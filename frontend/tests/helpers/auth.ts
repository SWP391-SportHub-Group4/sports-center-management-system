import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { bearer, requireLiveApi } from "./api";

export const DEMO_PASSWORD = "Sporthub@123";

type LoginResult = {
  accessToken: string;
  user: { userId: string; role: string };
};
// The API throttles login per IP (5/min, a deliberate security control). Live suites share one
// token per account for the process and wait out the window instead of weakening the limit.
const tokenCache = new Map<string, Promise<LoginResult>>();

async function loginWithRetry(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<LoginResult> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await request.post(`${requireLiveApi()}/api/auth/login`, {
      data: { email, password },
    });
    if (response.status() !== 429) {
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json() as Promise<LoginResult>;
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`login for ${email} stayed rate limited`);
}

export function loginApi(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD,
): Promise<LoginResult> {
  const key = `${email}
${password}`;
  let cached = tokenCache.get(key);
  if (!cached) {
    cached = loginWithRetry(request, email, password);
    cached.catch(() => tokenCache.delete(key));
    tokenCache.set(key, cached);
  }
  return cached;
}

export async function installBrowserSession(page: Page, token: string) {
  await page.addInitScript((value) => {
    localStorage.setItem("sporthub.accessToken", value);
    localStorage.setItem("sporthub_lang", "en");
  }, token);
}

export async function currentUser(request: APIRequestContext, token: string) {
  const response = await request.get(`${requireLiveApi()}/api/users/me`, {
    headers: bearer(token),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
