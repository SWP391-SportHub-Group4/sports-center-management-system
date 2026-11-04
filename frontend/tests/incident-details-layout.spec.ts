import { test, expect } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
for (const kind of ["gym", "class", "rental"]) {
  test(`Incident details shares the same layout for ${kind}`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "incident-fixture"),
    );
    const original = {
      startAtUtc: "2026-11-04T07:00:00Z",
      endAtUtc: "2026-11-04T09:00:00Z",
      roomName: "Room A",
      coachName: "Coach Alex",
    };
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
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
      if (path === `/api/manager/incidents/${id}`)
        return route.fulfill({
          json: {
            incidentId: id,
            scope: "ROOM",
            roomId: 1,
            roomName: "Room A",
            startAtUtc: original.startAtUtc,
            endAtUtc: original.endAtUtc,
            createdAtUtc: "2026-11-04T05:00:00Z",
            recordedByName: "Manager Alex",
            reason: "Room maintenance",
            closesGym: kind === "gym",
            dayPassMemberEmails: {
              m1: "an@example.com",
              m2: "khoa@example.com",
            },
            dayPassMembers:
              kind === "gym"
                ? [
                    { passId: "p1", memberId: "m1", memberName: "Member An" },
                    {
                      passId: "p2",
                      memberId: "m2",
                      memberName: "Nguyễn Nam Khoa",
                    },
                  ]
                : [],
            activities:
              kind === "class"
                ? [
                    {
                      stepId: "step1",
                      sourceType: "CLASS_SESSION",
                      sourceId: "s1",
                      classId: 1,
                      sessionNo: 3,
                      title: "Badminton",
                      action: "RESCHEDULE",
                      originalSchedule: original,
                      replacementSchedule: {
                        ...original,
                        startAtUtc: "2026-11-05T07:00:00Z",
                        endAtUtc: "2026-11-05T09:00:00Z",
                      },
                    },
                  ]
                : [],
            refunds:
              kind === "rental"
                ? [
                    {
                      sourceId: "rental1",
                      sourceType: "COURT_RENTAL",
                      memberName: "Member An",
                      serviceName: "Court rental",
                      startAtUtc: original.startAtUtc,
                      endAtUtc: original.endAtUtc,
                      status: "CANCELLED",
                      isPaid: true,
                      points: 100,
                      suggestedPoints: 100,
                      previouslyRefundedPoints: 0,
                      adjustmentReason: "Incident cancellation",
                    },
                  ]
                : [],
          },
        });
      return route.fulfill({ json: [] });
    });
    await page.goto(`/manager/incidents/${id}`);
    await expect(
      page.getByRole("heading", { name: "Incident details", exact: true }),
    ).toBeVisible();
    for (const label of [
      "Reason",
      "Incident scope",
      "Incident start",
      "Incident end",
      "Recorded by",
      "Recorded at",
    ])
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    await expect(page.getByText("Manager Alex", { exact: true })).toBeVisible();
    if (kind === "gym") {
      await expect(page.getByRole("columnheader")).toHaveText([
        "Member",
        "Email",
      ]);
      await page.getByLabel("Search by name or email").fill("nguyen");
      await expect(
        page.getByText("khoa@example.com", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("an@example.com", { exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Search by name or email").fill("an@example.com");
      await expect(
        page.getByText("an@example.com", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("khoa@example.com", { exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Search by name or email").fill("");
    } else
      await expect(
        page.getByRole("heading", {
          name: "Affected Gym day-pass members",
          exact: true,
        }),
      ).toHaveCount(0);
    if (kind === "class") {
      await expect(
        page.getByText("Original schedule", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Updated schedule", { exact: true }),
      ).toBeVisible();
    }
    if (kind === "rental")
      await expect(
        page.getByText("Court rental", { exact: true }).first(),
      ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("incident-desktop.png"),
      animations: "disabled",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: testInfo.outputPath("incident-mobile.png"),
      animations: "disabled",
      fullPage: true,
    });
  });
}
