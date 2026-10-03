import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

export const liveApiBase = process.env.P2_LIVE_API?.replace(/\/$/, "");

export function requireLiveApi(): string {
  if (!liveApiBase) throw new Error("P2_LIVE_API is not configured");
  return liveApiBase;
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function expectOk(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
  return response;
}

export async function getJson<T>(
  request: APIRequestContext,
  path: string,
  token?: string,
): Promise<T> {
  const response = await request.get(`${requireLiveApi()}${path}`, {
    headers: token ? bearer(token) : undefined,
  });
  await expectOk(response);
  return response.json() as Promise<T>;
}
