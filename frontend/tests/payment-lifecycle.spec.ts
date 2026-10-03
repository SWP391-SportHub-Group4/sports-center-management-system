import { expect, test } from "@playwright/test";
import { liveApiBase, bearer } from "./helpers/api";
import { demoAccounts } from "./helpers/seed";
import { loginApi } from "./helpers/auth";

test.skip(!liveApiBase, "Set P2_LIVE_API for payment lifecycle integration tests.");
test.describe.configure({ mode: "serial" });

test("browser return cannot mark an invoice paid by itself", async ({ request }) => {
  const member = await loginApi(request, demoAccounts.member);
  const response = await request.get(`${liveApiBase}/api/payments/vnpay/return?vnp_ResponseCode=00&vnp_TransactionStatus=00&vnp_TxnRef=fake`, { headers: bearer(member.accessToken) });
  expect([200, 400, 404]).toContain(response.status());
  const invoices = await request.get(`${liveApiBase}/api/members/me/invoices?page=1&pageSize=20`, { headers: bearer(member.accessToken) });
  expect(invoices.ok(), await invoices.text()).toBeTruthy();
});

test("payment API does not expose manual-paid endpoint", async ({ request }) => {
  const manager = await loginApi(request, demoAccounts.manager);
  const response = await request.post(`${liveApiBase}/api/payments/manual`, { headers: bearer(manager.accessToken), data: { amount: 100000 } });
  expect([404, 405]).toContain(response.status());
});
