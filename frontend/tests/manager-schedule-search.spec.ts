import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`schedule filters search names and preserve All at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("sporthub.accessToken", "schedule-search-fixture");
      localStorage.setItem("sporthub_lang", "en");
    });
    const entries = [
      {
        classId: 1,
        title: "Bóng rổ cơ bản",
        coachId: "coach-1",
        coachName: "Trịnh Thắng Bằng",
        roomId: 7,
      },
      {
        classId: 2,
        title: "Badminton",
        coachId: "coach-2",
        coachName: "Alex",
        roomId: 8,
      },
    ].map((entry) => ({
      ...entry,
      sourceType: "CLASS_SESSION",
      sourceId: `session-${entry.classId}`,
      status: "SCHEDULED",
      startAtUtc: "2030-10-03T02:00:00Z",
      endAtUtc: "2030-10-03T03:00:00Z",
      participants: [],
    }));
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/users/me")
        return route.fulfill({
          json: {
            userId: "manager",
            fullName: "Manager",
            role: "CENTER_MANAGER",
            status: "ACTIVE",
            hasPassword: true,
            sportIds: [],
          },
        });
      if (url.pathname === "/api/rooms")
        return route.fulfill({
          json: [
            { roomId: 7, name: "Phòng 102", capacity: 20, isActive: true },
            { roomId: 8, name: "Court B", capacity: 20, isActive: true },
          ],
        });
      if (url.pathname === "/api/manager/court-schedule") {
        const roomId = url.searchParams.get("roomId");
        return route.fulfill({
          json: entries.filter(
            (entry) => !roomId || String(entry.roomId) === roomId,
          ),
        });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/manager/schedule?date=2030-10-03&view=list");
    for (const label of ["Room", "Coach", "Class"]) {
      const input = page.getByRole("combobox", { name: label, exact: true });
      await expect(input).toHaveValue(`${label}: All`);
      await input.click();
      await expect(input).toHaveValue("");
      await page
        .getByRole("heading", { name: "Activity schedule", exact: true })
        .click();
      await expect(input).toHaveValue(`${label}: All`);
    }
    const coach = page.getByRole("combobox", { name: "Coach", exact: true });
    await coach.click();
    await coach.pressSequentially("thang bang");
    await expect(
      page.getByRole("option", { name: "Alex", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("option", { name: "Trịnh Thắng Bằng", exact: true })
      .click();
    await expect(page).toHaveURL(/coachId=coach-1/);
    const room = page.getByRole("combobox", { name: "Room", exact: true });
    await room.fill("phong");
    await page.getByRole("option", { name: "Phòng 102", exact: true }).click();
    await expect(page).toHaveURL(/roomId=7/);
    const classInput = page.getByRole("combobox", {
      name: "Class",
      exact: true,
    });
    await classInput.fill("BONG RO");
    await classInput.press("Enter");
    await expect(classInput).toHaveValue("Bóng rổ cơ bản");
    await expect(page).toHaveURL(/classId=1/);
    await page.reload();
    await expect(classInput).toHaveValue("Bóng rổ cơ bản");
    await classInput.click();
    await page.getByRole("option", { name: "Class: All", exact: true }).click();
    await expect(page).not.toHaveURL(/classId=/);
    await page.getByRole("button", { name: /Clear filters/ }).click();
    await expect(coach).toHaveValue("Coach: All");
    await expect(room).toHaveValue("Room: All");
    await expect(classInput).toHaveValue("Class: All");
    await expect(page).not.toHaveURL(/coachId=|roomId=|classId=/);
    await room.fill("missing room");
    await expect(
      page.getByRole("option", { name: "Phòng 102", exact: true }),
    ).toHaveCount(0);
    await room.press("Escape");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`schedule-search-${width}.png`),
      fullPage: true,
    });
  });
}
