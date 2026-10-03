import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { bearer, requireLiveApi } from "./api";

export const DEMO_PASSWORD = "Sporthub@123";

export async function loginApi(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD,
) {
  const response = await request.post(`${requireLiveApi()}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{
    accessToken: string;
    user: { userId: string; role: string };
  }>;
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
