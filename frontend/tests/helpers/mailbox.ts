import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Optional adapter for a test-only mailbox service. Production must never expose OTP/log-mail endpoints.
 * Configure P2_TEST_MAILBOX_URL only in an isolated Development/Test environment.
 */
export async function readLatestTestMail(
  request: APIRequestContext,
  recipient: string,
) {
  const base = process.env.P2_TEST_MAILBOX_URL;
  if (!base) throw new Error("P2_TEST_MAILBOX_URL is not configured");
  const response = await request.get(
    `${base.replace(/\/$/, "")}/messages/latest?recipient=${encodeURIComponent(recipient)}`,
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ subject: string; body: string }>;
}
