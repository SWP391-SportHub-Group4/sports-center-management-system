import { expect, test } from "@playwright/test";

test("admin reads a manager support assignment from the notification bell", async ({
  page,
}) => {
  const id = "11111111-1111-4111-8111-111111111111";
  const message =
    "Manager Alex assigned a member support request to you.\nSubject: Payment assistance\nMember: Member An\nCategory: PAYMENT\nPlease investigate this payment.";
  let reads = 0;
  const notice = () => ({
    notificationId: id,
    sourceEventType: "SUPPORT_REQUEST_ASSIGNED",
    sourceEntityId: "22222222-2222-4222-8222-222222222222",
    message,
    status: reads ? "READ" : "PENDING",
    sentAt: null,
    actionUrl: null,
  });
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "fixture");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "admin",
          fullName: "Administrator",
          email: "admin@example.test",
          role: "SYSTEM_ADMINISTRATOR",
          sportIds: [],
        },
      });
    if (path === "/api/notifications/unread-count")
      return route.fulfill({ json: { count: reads ? 0 : 1 } });
    if (path === "/api/notifications")
      return route.fulfill({ json: [notice()] });
    if (path === "/api/notifications/inbox")
      return route.fulfill({
        json: { items: [notice()], page: 1, pageSize: 25, totalCount: 1 },
      });
    if (path === `/api/notifications/${id}/read`) {
      reads++;
      return route.fulfill({ status: 204 });
    }
    if (path === `/api/notifications/${id}`)
      return route.fulfill({ json: notice() });
    return route.fulfill({ json: [] });
  });
  await page.goto("/notifications");
  await page
    .getByRole("button", { name: "Notifications (1)", exact: true })
    .click();
  const link = page
    .getByRole("banner")
    .locator(`a[href="/notifications?message=${id}"]`);
  await expect(link).toContainText(
    "A support request has been assigned to you",
  );
  await link.click();
  await expect(page).toHaveURL(new RegExp(`message=${id}`));
  await expect(
    page
      .getByRole("region", { name: "Message reader", exact: true })
      .getByText(message, { exact: true }),
  ).toBeVisible();
  await expect.poll(() => reads).toBe(1);
  await expect(
    page.getByRole("button", { name: "Notifications (0)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This message is for your information. No further action is linked.",
      { exact: true },
    ),
  ).toBeVisible();
});
