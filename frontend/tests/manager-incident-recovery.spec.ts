import { expect, test } from "@playwright/test";
import { en } from "../src/locales/en";

for (const full of [false, true]) {
  test(`Manager handles a past incident: ${full ? "fully delivered" : "whole replacement"}`, async ({
    page,
  }) => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const fenceId = "22222222-2222-4222-8222-222222222222";
    let handled = false;
    let reports = 0;
    let searches = 0;
    const session = {
      sessionId,
      classId: 42,
      className: "Basketball recovery class",
      sessionNo: 1,
      roomId: 1,
      roomName: "Basketball court",
      coachId: "coach-a",
      coachName: "Basketball coach",
      startAtUtc: "2020-01-02T02:00:00Z",
      endAtUtc: "2020-01-02T04:00:00Z",
      status: "COMPLETED",
      isMakeup: false,
    };
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "incident-manager-fixture"),
    );
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path === "/api/users/me")
        return route.fulfill({
          json: {
            userId: "manager",
            role: "CENTER_MANAGER",
            fullName: "Manager",
            email: "manager@example.com",
            sportIds: [],
          },
        });
      if (path.endsWith("unread-count"))
        return route.fulfill({ json: { count: 0 } });
      if (path === "/api/rooms")
        return route.fulfill({
          json: [
            {
              roomId: 1,
              name: "Basketball court",
              capacity: 12,
              roomTypeId: 4,
              isActive: true,
            },
          ],
        });
      if (path === "/api/room-types")
        return route.fulfill({
          json: [{ roomTypeId: 4, name: "Basketball", sportIds: [4] }],
        });
      if (path === "/api/coaches")
        return route.fulfill({
          json: [{ userId: "coach-a", fullName: "Basketball coach" }],
        });
      if (path === `/api/class-sessions/${sessionId}`)
        return route.fulfill({ json: session });
      if (path === "/api/manager/classes/42")
        return route.fulfill({
          json: { classId: 42, sportId: 4, capacity: 12 },
        });
      if (path === "/api/manager/incidents/fences")
        return route.fulfill({
          json: route.request().method() === "GET" ? [] : { fenceId },
        });
      if (path === "/api/manager/incidents")
        return route.fulfill({
          json: { items: [], page: 1, pageSize: 20, totalCount: 0 },
        });
      if (path === "/api/manager/incidents/preview")
        return route.fulfill({
          json: {
            scope: "ROOM",
            roomId: 1,
            startAtUtc: session.startAtUtc,
            endAtUtc: session.endAtUtc,
            canResolve: handled,
            blockReason: null,
            members: [],
            impacts: handled
              ? []
              : [
                  {
                    sourceType: "CLASS_SESSION",
                    sourceId: sessionId,
                    startAtUtc: session.startAtUtc,
                    endAtUtc: session.endAtUtc,
                    resolutionOptions: [],
                  },
                ],
          },
        });
      if (path.endsWith("/suggestions")) {
        searches++;
        return route.fulfill({ status: 404 });
      }
      if (path === `/api/class-sessions/${sessionId}/incident`) {
        reports++;
        const data = route.request().postDataJSON();
        expect(data.fenceId).toBe(fenceId);
        expect(data.outcome).toBe(
          full ? "COMPLETED_AS_PLANNED" : "INTERRUPTED",
        );
        expect(data.makeup).toEqual(
          full
            ? null
            : {
                startAtUtc: "2032-02-01T02:00:00.000Z",
                roomId: 1,
                coachId: "coach-a",
              },
        );
        handled = true;
        return route.fulfill({ json: session });
      }
      return route.fulfill({ json: [] });
    });
    const query = new URLSearchParams({
      scope: "ROOM",
      roomId: "1",
      start: "2020-01-02T09:00",
      end: "2020-01-02T11:00",
      reason: "Power failure during class",
    });
    await page.goto(`/manager/incidents?${query}`);
    await page
      .getByRole("button", { name: en.operations.review, exact: true })
      .click();
    const impacts = page.getByRole("dialog", {
      name: en.operations.impact,
      exact: true,
    });
    await expect(impacts).toBeVisible();
    await expect(impacts).toHaveCSS("animation-name", /impactOpen/);
    await expect(impacts).toContainText(en.operations.classSession);
    await page.screenshot({
      path: `test-results/incident-impacts-desktop-${full}.png`,
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await expect(impacts).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: en.operations.review, exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: en.operations.review, exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(impacts).toBeVisible();
    expect(
      await impacts.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/incident-impacts-mobile-${full}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: en.operations.edit, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: en.incidentHistory.editSession,
    });
    await expect(dialog).toContainText(
      "Original times, attendance and assessments are retained",
    );
    if (full)
      await dialog
        .getByRole("combobox", { name: "Actual session outcome" })
        .selectOption("COMPLETED_AS_PLANNED");
    else {
      await dialog.getByLabel("Actual incident time").fill("2020-01-02T09:30");
      await dialog
        .getByLabel("Replacement start", { exact: true })
        .fill("2032-02-01T09:00");
    }
    await dialog
      .getByRole("button", { name: "Review outcome", exact: true })
      .click();
    expect(reports).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/incident-recovery-${full}.png`,
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Confirm outcome", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(en.incidentHistory.noImpacts, { exact: true }),
    ).toBeVisible();
    expect(reports).toBe(1);
    expect(searches).toBe(0);
    await impacts
      .getByRole("button", { name: en.managerOperations.recheck, exact: true })
      .click();
    const finalReview = page.getByRole("dialog", {
      name: en.managerOperations.resolveReview,
      exact: true,
    });
    await expect(finalReview).toBeVisible();
    await expect(impacts).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.screenshot({
      path: `test-results/incident-final-review-${full}.png`,
      animations: "disabled",
    });
    await expect(
      finalReview.getByRole("button", {
        name: en.managerOperations.finalResolve,
        exact: true,
      }),
    ).toBeEnabled();
    await finalReview
      .getByRole("button", {
        name: en.incidentHistory.backToImpacts,
        exact: true,
      })
      .click();
    await expect(finalReview).toHaveCount(0);
    await expect(impacts).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
