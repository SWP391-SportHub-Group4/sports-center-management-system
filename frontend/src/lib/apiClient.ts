/**
 * Client gọi REST API của SportHub.
 *
 * Mọi lỗi đều được chuẩn hoá thành ApiError có `error` (mã snake_case của backend) để màn
 * hình xử lý theo mã thay vì so chuỗi thông báo — thông báo có thể đổi, mã thì không.
 */

import { en } from "@/locales/en";
import { vi } from "@/locales/vi";
import type { Language } from "./language";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";

const LANGUAGE_STORAGE_KEY = "sporthub_lang";

/**
 * Đọc ngôn ngữ trực tiếp từ localStorage thay vì import lib/language.tsx: module này
 * không phải React component và không nên kéo theo LanguageProvider/context.
 */
function currentLanguage(): Language {
  if (typeof window === "undefined") return "en";
  if (document.documentElement.dataset.forceLang === "en") return "en";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "vi" ? "vi" : "en";
  } catch {
    return "en";
  }
}

/** Khoá localStorage giữ JWT. Chỉ đọc/ghi ở đây và ở lib/auth.tsx. */
export const TOKEN_STORAGE_KEY = "sporthub.accessToken";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** 401 = token thiếu/hết hạn/tài khoản bị khoá — người dùng phải đăng nhập lại. */
  get isUnauthorized() {
    return this.status === 401;
  }

  /** 403 = đã đăng nhập nhưng không đủ quyền cho thao tác này. */
  get isForbidden() {
    return this.status === 403;
  }

  /** 409 = xung đột nghiệp vụ (hết chỗ, trùng đăng ký, vượt số tiền hoá đơn…). */
  get isConflict() {
    return this.status === 409;
  }

  /** 429 = vượt rate limit của endpoint đăng nhập/đăng ký. */
  get isRateLimited() {
    return this.status === 429;
  }
}

type Json = Record<string, unknown>;

export interface RequestOptions {
  /** Bỏ Authorization header — dùng cho login/register/google. */
  anonymous?: boolean;
  /** Huỷ request khi component unmount hoặc khi người dùng đổi bộ lọc. */
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Chế độ riêng tư hoặc site data bị chặn: coi như chưa đăng nhập thay vì để cả app vỡ.
    return null;
  }
}

/**
 * Nơi duy nhất phản ứng với 401. lib/auth.tsx đăng ký hàm này để xoá phiên và đưa về trang
 * đăng nhập; tách ra đây để apiClient không phải biết gì về React/router.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const url = new URL(
    path.startsWith("http") ? path : `${API_BASE_URL}${path}`,
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (!options.anonymous) {
    const token = readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (error) {
    // AbortError là chủ ý của caller, không phải sự cố mạng — ném nguyên để useApi bỏ qua.
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      0,
      "network_error",
      (currentLanguage() === "vi" ? vi : en).apiErrors.networkError,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  const parsed: unknown = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    const payload = (parsed ?? {}) as Json;

    const code =
      typeof payload.error === "string"
        ? payload.error
        : `http_${response.status}`;

    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.title === "string"
          ? payload.title
          : defaultMessageFor(response.status);

    // Compatibility with older APIs: this authenticated form can reject the
    // current password without invalidating the session. Never suppress other 401s.
    const legacyPasswordRejection =
      method === "POST" &&
      path === "/api/users/me/password" &&
      code === "invalid_credentials";
    if (
      response.status === 401 &&
      !options.anonymous &&
      !legacyPasswordRejection
    ) {
      onUnauthorized?.();
    }

    throw new ApiError(
      response.status,
      code,
      withValidationDetail(message, payload),
      { ...payload, retryAfter: response.headers.get("Retry-After") },
    );
  }

  return parsed as T;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

/**
 * ASP.NET trả lỗi model validation dưới dạng ProblemDetails có `errors`. Gộp vào thông báo
 * để người dùng thấy ĐÚNG trường nào sai, thay vì chỉ "One or more validation errors".
 */
function withValidationDetail(message: string, payload: Json): string {
  const errors = payload.errors;
  if (!errors || typeof errors !== "object") return message;

  const details = Object.values(errors as Record<string, unknown>)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string");

  return details.length > 0 ? details.join(" ") : message;
}

function defaultMessageFor(status: number): string {
  const t = (currentLanguage() === "vi" ? vi : en).apiErrors;

  switch (status) {
    case 400:
      return t.invalidRequest;
    case 401:
      return t.sessionExpired;
    case 403:
      return t.forbidden;
    case 404:
      return t.notFound;
    case 409:
      return t.conflict;
    case 429:
      return t.rateLimited;
    default:
      return t.generic;
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};

/**
 * Tải tệp đã xuất (BR-44..BR-48). Không dùng thẻ <a href> trực tiếp: endpoint tải về cần
 * Authorization header để kiểm ownership (BR-45), mà điều hướng trình duyệt thì không gửi được.
 */
export async function downloadFile(path: string, fallbackName: string) {
  const token = readToken();

  const response = await fetch(buildUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401) onUnauthorized?.();
    throw new ApiError(
      response.status,
      `http_${response.status}`,
      defaultMessageFor(response.status),
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = match?.[1] ?? fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export { API_BASE_URL };
