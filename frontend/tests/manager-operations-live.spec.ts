import { expect, test } from "@playwright/test";
import { bearer, liveApiBase } from "./helpers/api";
import { installBrowserSession, loginApi } from "./helpers/auth";

// Read-only smoke: no class, account, notice, payment or incident mutations.
test("live Manager reads operating pages and qualification IDs from the server", async ({
  page,
  request,
}) => {
  test.skip(!liveApiBase, "Requires Docker API and demo Manager account.");
  const { accessToken } = await loginApi(request, "manager@sporthub.vn");
  const headers = bearer(accessToken);
  const catalog = await request.get(`${liveApiBase}/api/manager/sports`, {
    headers,
  });
  expect(catalog.ok()).toBeTruthy();
  const sports = await catalog.json();
  for (const sport of sports)
    for (const service of sport.services)
      expect(service.offeringId).toBeGreaterThan(0);
  const audit = await request.get(
    `${liveApiBase}/api/audit-logs?targetEntity=Class&targetId=1&pageSize=1`,
    { headers },
  );
  expect(audit.ok()).toBeTruthy();
  for (const row of (await audit.json()).items) expect(row.targetId).toBe("1");
  await installBrowserSession(page, accessToken);
  const failures: string[] = [];
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/") && response.status() >= 400)
      failures.push(`${response.status()} ${path}`);
  });
  for (const path of [
    "/manager",
    "/manager/classes",
    "/manager/classes/new",
    "/manager/schedule?view=list",
    "/manager/coaches",
    "/manager/facilities",
    "/manager/incidents",
    "/manager/notices",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main .alert--error")).toHaveCount(0);
  }
  expect(failures).toEqual([]);
  await page.goto("/manager/schedule?view=list");
  await page.screenshot({
    path: "../output/manager-operations-live.png",
    fullPage: true,
  });
});
