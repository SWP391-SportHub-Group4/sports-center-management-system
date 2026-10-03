import { expect, test } from "@playwright/test";
import { bearer, liveApiBase } from "./helpers/api";
import { demoAccounts } from "./helpers/seed";
import { loginApi } from "./helpers/auth";

test.skip(!liveApiBase, "Set P2_LIVE_API for RBAC integration tests.");
test.describe.configure({ mode: "serial" });

test("Receptionist and System Administrator cannot perform Manager point adjustment", async ({ request }) => {
  const receptionist = await loginApi(request, demoAccounts.receptionist);
  const admin = await loginApi(request, demoAccounts.admin);
  const member = await loginApi(request, demoAccounts.member);
  for (const token of [receptionist.accessToken, admin.accessToken]) {
    const response = await request.post(`${liveApiBase}/api/wallets/${member.user.userId}/adjustments`, {
      headers: bearer(token),
      data: { idempotencyKey: crypto.randomUUID(), points: 1, direction: "CREDIT", reason: "RBAC negative test" },
    });
    expect(response.status()).toBe(403);
  }
});

test("Member cannot read manager revenue report or account audit", async ({ request }) => {
  const member = await loginApi(request, demoAccounts.member);
  const headers = bearer(member.accessToken);
  const [report, audit] = await Promise.all([
    request.get(`${liveApiBase}/api/reports/revenue?fromDate=2030-01-01&toDate=2030-01-31`, { headers }),
    request.get(`${liveApiBase}/api/audit-logs`, { headers }),
  ]);
  expect(report.status()).toBe(403);
  expect(audit.status()).toBe(403);
});
