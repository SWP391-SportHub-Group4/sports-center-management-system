/**
 * Client gọi REST API của SportHub.
 *
 * Mọi lỗi đều được chuẩn hoá thành ApiError có `error` (mã snake_case của backend) để màn
 * hình xử lý theo mã thay vì so chuỗi thông báo — thông báo có thể đổi, mã thì không.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";

/** Khoá localStorage giữ JWT. Chỉ đọc/ghi ở đây và ở lib/auth.tsx. */
export const TOKEN_STORAGE_KEY = "sporthub.accessToken";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Không kết nối được tới máy chủ.");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const raw = await response.text();
  const parsed: unknown = raw ? safeJsonParse(raw) : null;

  if (!response.ok) {
    const payload = (parsed ?? {}) as Json;

    const code =
      typeof payload.error === "string" ? payload.error : `http_${response.status}`;

    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.title === "string"
          ? payload.title
          : defaultMessageFor(response.status);

    if (response.status === 401 && !options.anonymous) {
      onUnauthorized?.();
    }

    throw new ApiError(response.status, code, withValidationDetail(message, payload));
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
  switch (status) {
    case 400:
      return "Dữ liệu gửi lên không hợp lệ.";
    case 401:
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case 403:
      return "Bạn không có quyền thực hiện thao tác này.";
    case 404:
      return "Không tìm thấy dữ liệu.";
    case 409:
      return "Thao tác xung đột với dữ liệu hiện tại.";
    case 429:
      return "Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.";
    default:
      return "Đã xảy ra lỗi, vui lòng thử lại.";
  }
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),
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
