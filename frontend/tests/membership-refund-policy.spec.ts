import { expect, test } from "@playwright/test";
import { en } from "../src/locales/en";

for (const points of [0, 500]) {
  test(`membership cancellation with ${points} quoted points explains the time policy`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      localStorage.setItem("sporthub.accessToken", "member-token");
      localStorage.setItem("sporthub_lang", "en");
    });
    const writes: unknown[] = [];
    let cancelled = false;
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body: unknown) => route.fulfill({ json: body });
      if (request.method() === "POST") {
        writes.push(request.postDataJSON());
        cancelled = true;
        return json({ approvedPoints: points });
      }
      if (path === "/api/users/me")
        return json({
          userId: "member-1",
          fullName: "Member",
          email: "member@example.com",
          role: "MEMBER",
          sportIds: [],
        });
      if (path === "/api/members/me/packages")
        return json(
          cancelled
            ? []
            : [
                {
                  memberPackageId: "package-1",
                  packageId: 1,
                  packageName: "Gym quarterly",
                  startDate: "2030-01-01",
                  endDate: "2030-03-31",
                  status: "ACTIVE",
                  isUsable: true,
                  invoiceItemId: "membership-item-1",
                },
              ],
        );
      if (path === "/api/refunds/quote/membership-item-1")
        return json({ systemCalculatedPoints: points });
      if (path === "/api/members/me/enrollments")
        return json({ items: [], totalCount: 0 });
      if (path === "/api/wallet/me")
        return json({ availablePoints: 0, heldPoints: 0, vndPerPoint: 1000 });
      if (path.endsWith("unread-count")) return json({ count: 0 });
      return json([]);
    });
    await page.goto("/member/services?view=owned&type=gym");
    await page
      .getByRole("button", { name: "Cancel membership", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Cancel Gym membership" });
    await expect(
      dialog.getByText(en.finOps.membershipRefundPolicy),
    ).toBeVisible();
    await expect(
      dialog.getByText(points ? "50%" : "0%", { exact: true }),
    ).toBeVisible();
    const confirm = dialog.getByRole("button", {
      name: "Confirm cancellation",
    });
    if (!points) {
      await expect(confirm).toBeDisabled();
      expect(writes).toHaveLength(0);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(dialog).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("membership-policy-mobile.png"),
        fullPage: true,
      });
    } else {
      await expect(confirm).toBeEnabled();
      await confirm.click();
      await expect.poll(() => writes.length).toBe(1);
      await expect(dialog).not.toBeVisible();
      expect(writes).toEqual([{ invoiceItemId: "membership-item-1" }]);
    }
  });
}
