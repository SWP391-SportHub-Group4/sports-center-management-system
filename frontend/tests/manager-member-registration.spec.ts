import { expect, test } from "@playwright/test";
import { en } from "../src/locales/en";
import type { UserAdminDto } from "../src/lib/types";

const memberId = "22222222-2222-4222-8222-222222222222";

test("Manager registers at the desk and manages pending activation in their own workspace", async ({
  page,
}) => {
  let member: UserAdminDto = {
    userId: memberId,
    fullName: "New desk member",
    email: "desk@example.com",
    phone: null,
    role: "MEMBER",
    status: "ACTIVE",
    createdAt: "2026-10-18T00:00:00Z",
    hasPassword: false,
    hasGoogleLink: false,
    sportIds: [],
    activationPending: true,
  };
  let createCount = 0;
  let resendCount = 0;
  await page.addInitScript(() => {
    localStorage.setItem(
      "sporthub.accessToken",
      "manager-registration-fixture",
    );
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "11111111-1111-4111-8111-111111111111",
          fullName: "Manager",
          email: "manager@example.com",
          role: "CENTER_MANAGER",
          sportIds: [],
        },
      });
    if (path.endsWith("/unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/users")
      return route.fulfill({
        json: { items: [member], page: 1, pageSize: 20, totalCount: 1 },
      });
    if (path === "/api/members/front-desk") {
      createCount++;
      expect(route.request().postDataJSON()).toEqual({
        fullName: member.fullName,
        email: member.email,
        phone: null,
      });
      if (createCount === 1)
        return route.fulfill({
          status: 409,
          json: {
            error: "email_already_exists",
            message: "Email is already registered.",
          },
        });
      return route.fulfill({ status: 201, json: member });
    }
    if (path === `/api/users/${memberId}`)
      return route.fulfill({ json: member });
    if (path === "/api/coach-member-relationships")
      return route.fulfill({
        json: [
          {
            relationshipId: "current-assignment",
            coachId: "current-coach",
            coachName: "Current coach",
            memberId,
            sourceType: "ASSIGNED_BY_MANAGER",
            status: "ACTIVE",
            endedAt: null,
            activeClasses: [
              { classId: 42, className: "Current badminton course" },
            ],
          },
          {
            relationshipId: "ended-assignment",
            coachId: "former-coach",
            coachName: "Former coach",
            memberId,
            sourceType: "CLASS_BASED",
            status: "ENDED",
            endedAt: "2026-10-18T03:00:00Z",
            endReason: "No remaining active courses after enrollment ended.",
            activeClasses: [],
          },
        ],
      });
    if (path === `/api/members/front-desk/${memberId}/resend-activation`) {
      resendCount++;
      return route.fulfill({ json: member });
    }
    if (path === `/api/members/front-desk/${memberId}/email`) {
      expect(route.request().postDataJSON()).toEqual({
        email: "corrected@example.com",
        reason: "Correct email entered at the desk",
      });
      member = { ...member, email: "corrected@example.com" };
      return route.fulfill({ json: member });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/manager/members");
  await expect(
    page.getByRole("row").filter({ hasText: member.email }),
  ).toContainText(en.frontDesk.pendingActivation);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: member.email })
      .getByText("Active", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: en.frontDesk.openRegistration })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel(/password/i)).toHaveCount(0);
  await dialog
    .getByLabel(en.staffWork.fullName, { exact: true })
    .fill(member.fullName);
  await dialog
    .getByLabel(en.staffWork.email, { exact: true })
    .fill(member.email);
  await dialog
    .getByRole("button", { name: en.frontDesk.registerMemberSubmit })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Email is already registered.",
  );
  await expect(page).toHaveURL(/\/manager\/members$/);
  await dialog
    .getByRole("button", { name: en.frontDesk.registerMemberSubmit })
    .click();
  await expect(page).toHaveURL(`/manager/members/${memberId}`);
  await expect(
    page.getByRole("link", { name: "Current badminton course" }),
  ).toHaveAttribute("href", "/manager/classes/42");
  await expect(
    page.getByText("No remaining active courses after enrollment ended.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: en.frontDesk.pendingActivation }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: en.frontDesk.resendActivation })
    .click();
  await expect.poll(() => resendCount).toBe(1);
  await page
    .getByRole("button", { name: en.frontDesk.changeEmail, exact: true })
    .click();
  await page
    .getByLabel(en.frontDesk.newEmail, { exact: true })
    .fill("corrected@example.com");
  await page
    .getByLabel(en.staffWork.reason, { exact: true })
    .fill("Correct email entered at the desk");
  await page.getByRole("button", { name: en.frontDesk.saveNewEmail }).click();
  await expect(
    page.getByText("corrected@example.com", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("corrected@example.com", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: en.frontDesk.changeEmail, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/manager-member-registration-mobile.png",
    fullPage: true,
  });

  member = { ...member, activationPending: false, hasPassword: true };
  await page.reload();
  await expect(
    page.getByText("corrected@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.frontDesk.resendActivation }),
  ).toHaveCount(0);
  expect(createCount).toBe(2);
  await page.goto("/manager/members");
  await expect(
    page.getByRole("row").filter({ hasText: member.email }),
  ).not.toContainText(en.frontDesk.pendingActivation);
});
