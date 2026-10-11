import { expect, test } from "@playwright/test";
import { bearer, liveApiBase } from "./helpers/api";
import { demoAccounts } from "./helpers/seed";
import { loginApi } from "./helpers/auth";

test.skip(!liveApiBase, "Set P2_LIVE_API to verify the P2.13 API coverage matrix.");
test.describe.configure({ mode: "serial" });

test("P2.13 safe-read coverage has no missing routes", async ({ request }) => {
  const member = await loginApi(request, demoAccounts.member);
  const receptionist = await loginApi(request, demoAccounts.receptionist);
  const manager = await loginApi(request, demoAccounts.manager);
  const coach = await loginApi(request, demoAccounts.coach);
  const admin = await loginApi(request, demoAccounts.admin);
  const today = new Date().toISOString().slice(0, 10);
  const cases = [
    ["public sports", "/api/sports", undefined],
    ["public courses", "/api/classes?page=1&pageSize=5", undefined],
    ["member profile", "/api/users/me", member.accessToken],
    ["member wallet", "/api/wallet/me", member.accessToken],
    ["receptionist users", "/api/users?role=MEMBER&page=1&pageSize=5", receptionist.accessToken],
    ["coach assigned classes", "/api/coaches/me/classes", coach.accessToken],
    ["manager sports", "/api/manager/sports", manager.accessToken],
    ["manager revenue", `/api/reports/revenue?fromDate=${today}&toDate=${today}`, manager.accessToken],
    ["manager refunds", "/api/refunds?page=1&pageSize=5", manager.accessToken],
    ["manager audit", "/api/audit-logs?page=1&pageSize=5", manager.accessToken],
    ["admin users", "/api/users/admin?page=1&pageSize=5", admin.accessToken],
  ] as const;
  for (const [name, path, token] of cases) {
    const response = await request.get(`${liveApiBase}${path}`, { headers: token ? bearer(token) : undefined });
    expect(response.status(), `${name}: ${await response.text()}`).not.toBe(404);
    expect(response.status(), `${name}: route must support GET`).not.toBe(405);
  }
});
