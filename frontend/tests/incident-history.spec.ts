import { test, expect } from "@playwright/test";

const incidents = Array.from({ length: 21 }, (_, index) => ({
  incidentId: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
  scope: index % 2 ? "CENTER" : "ROOM",
  roomId: index % 2 ? null : 1,
  roomName: index % 2 ? null : "Badminton BC1",
  reason: `Court maintenance ${index + 1}`,
  resolutionSummary: "Court blocked; affected rentals refunded as points.",
  startAtUtc: "2026-10-14T07:00:00Z",
  endAtUtc: "2026-10-14T11:00:00Z",
  createdAtUtc: "2026-10-12T12:00:00Z",
}));

test("incident history scrolls, pages and opens incident details", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "incident-history-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "22222222-2222-4222-8222-222222222222",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          email: "manager@example.com",
          sportIds: [],
        },
      });
    if (path === "/api/notifications/unread-count")
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/system-settings")
      return route.fulfill({
        json: [
          { key: "center.opening_minutes", value: "360" },
          { key: "center.closing_minutes", value: "1320" },
        ],
      });
    if (path === "/api/manager/incidents") {
      const currentPage = Number(url.searchParams.get("page") || 1);
      return route.fulfill({
        json: {
          items: incidents.slice((currentPage - 1) * 20, currentPage * 20),
          page: currentPage,
          pageSize: 20,
          totalCount: 21,
        },
      });
    }
    if (path.endsWith("/notifications"))
      return route.fulfill({
        json: { total: 2, pending: 0, sending: 0, sent: 2, failed: 0, read: 0 },
      });
    if (path.startsWith("/api/manager/incidents/"))
      return route.fulfill({
        json: incidents.find((item) => path.endsWith(item.incidentId)),
      });
    return route.fulfill({ json: [] });
  });
  await page.goto("/manager/incidents");
  const region = page.getByRole("region", {
    name: "Incident history",
    exact: true,
  });
  await expect(
    region.getByText("Court maintenance 1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Track notification delivery by incident ID",
    }),
  ).toHaveCount(0);
  expect(
    await region.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBeTruthy();
  await region.scrollIntoViewIfNeeded();
  await region.screenshot({ path: "../.tmp/incident-history-desktop.png" });
  const next = page.getByRole("button", { name: "Next page", exact: true });
  await next.click();
  await expect(
    region.getByText("Court maintenance 21", { exact: true }),
  ).toBeVisible();
  await region.getByRole("link", { name: "Details", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(incidents[20].incidentId));
  await expect(
    page.getByRole("heading", { name: "Court maintenance 21", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(incidents[20].resolutionSummary)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/manager/incidents");
  await expect(
    region.getByText("Court maintenance 1", { exact: true }),
  ).toBeVisible();
  expect(
    await region.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBeTruthy();
  await region.screenshot({ path: "../.tmp/incident-history-mobile.png" });
});
