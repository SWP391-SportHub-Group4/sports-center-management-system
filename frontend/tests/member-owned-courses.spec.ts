import { expect, test } from "@playwright/test";

test("the member's classes page lists paid enrollments", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "member-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({ json: {
        userId: "11111111-1111-4111-8111-111111111111",
        fullName: "Member A", email: "member@example.com", role: "MEMBER", sportIds: [],
      } });
    if (path === "/api/members/me/enrollments")
      return route.fulfill({ json: { items: [{
        enrollmentId: "22222222-2222-4222-8222-222222222222",
        classId: 7, classCode: "BAD-07", className: "My badminton class",
        sportId: 3, sportName: "Badminton", status: "CONFIRMED",
        classStatus: "PUBLISHED", numSessions: 12, completedSessions: 0,
        coachName: "Coach Minh", roomName: "Court A",
        enrolledAt: new Date().toISOString(),
        firstSessionStartUtc: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }], page: 1, pageSize: 50, totalCount: 1 } });
    if (path.includes("notifications"))
      return route.fulfill({ json: path.endsWith("unread-count") ? { count: 0 } : [] });
    return route.fulfill({ json: [] });
  });

  await page.goto("/member/services?section=courses&view=owned");
  await expect(page.getByText("My badminton class")).toBeVisible();
  await expect(page.getByText("Coach Minh")).toBeVisible();
});
