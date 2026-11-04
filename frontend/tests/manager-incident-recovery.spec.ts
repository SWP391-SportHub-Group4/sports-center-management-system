import { expect, test } from "@playwright/test";
import { en } from "../src/locales/en";

test.use({ timezoneId: "America/Los_Angeles" });

for (const [start, end, past] of [
  ["2026-11-03T18:00", "2026-11-03T19:00", true],
  ["2026-11-04T16:00", "2026-11-04T18:00", true],
  ["2026-11-04T18:00", "2026-11-04T19:00", false],
] as const) {
  test(`incident start uses Vietnam time and rejects the past: ${start}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T10:00:00Z"));
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "incident-fixture"),
    );
    const writes: string[] = [];
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === "POST") writes.push(path);
      let data: unknown = [];
      if (path === "/api/users/me")
        data = {
          userId: "manager",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          sportIds: [],
        };
      if (path.endsWith("unread-count")) data = { count: 0 };
      if (path === "/api/rooms")
        data = [{ roomId: 1, name: "Court A", capacity: 20, isActive: true }];
      if (path === "/api/manager/incidents")
        data = { items: [], totalCount: 0, page: 1, pageSize: 20 };
      if (path === "/api/manager/incidents/preview")
        data = {
          ...route.request().postDataJSON(),
          impacts: [],
          refunds: [],
          members: [],
          canResolve: true,
        };
      return route.fulfill({ json: data });
    });
    const query = new URLSearchParams({
      scope: "ROOM",
      roomId: "1",
      start,
      end,
      reason: "Court repair",
    });
    await page.goto(`/manager/incidents?${query}`);
    await expect(
      page.getByLabel(en.operations.start, { exact: true }),
    ).toHaveAttribute("min", "2026-11-04");
    await page
      .getByRole("button", { name: en.operations.review, exact: true })
      .click();
    if (past) {
      await expect(
        page
          .getByRole("dialog", { name: en.incidentHistory.timeErrorTitle })
          .getByRole("alert"),
      ).toContainText(en.incidentHistory.startInPast);
      expect(writes).toHaveLength(0);
    } else {
      await expect(
        page.getByRole("dialog", { name: en.operations.impact, exact: true }),
      ).toBeVisible();
      expect(writes).toEqual(["/api/manager/incidents/preview"]);
    }
  });
}
