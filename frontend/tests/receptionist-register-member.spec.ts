import { expect, test, type Page } from "@playwright/test";

const deskId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

const pendingMember = {
  userId: memberId,
  fullName: "Walk In Member",
  email: "walkin@example.com",
  phone: "0912345678",
  role: "MEMBER",
  status: "ACTIVE",
  sportIds: [],
  createdAt: "2030-10-03T02:00:00Z",
  hasPassword: false,
  hasGoogleLink: false,
  activationPending: true,
};

async function setup(page: Page, member: typeof pendingMember | null) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "receptionist-fixture-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: deskId,
          fullName: "Receptionist",
          email: "desk@example.com",
          role: "RECEPTIONIST",
          sportIds: [],
        },
      });
    if (path.includes("notifications"))
      return route.fulfill({ json: path.endsWith("unread-count") ? { count: 0 } : [] });
    if (path === "/api/users")
      return route.fulfill({
        json: {
          items: member ? [member] : [],
          page: 1,
          pageSize: 20,
          totalCount: member ? 1 : 0,
        },
      });
    if (member && path === `/api/users/${member.userId}`)
      return route.fulfill({ json: member });
    if (path.endsWith("/packages") || path.endsWith("/gym-checkins"))
      return route.fulfill({ json: path.endsWith("/packages") ? [] : { items: [], page: 1, pageSize: 5, totalCount: 0 } });
    return route.fulfill({ json: { items: [], page: 1, pageSize: 20, totalCount: 0 } });
  });
}

test("front desk registers a member with a confirmed email and opens the new member", async ({
  page,
}) => {
  await setup(page, null);
  const writes: unknown[] = [];
  await page.route("**/api/members/front-desk", (route) => {
    writes.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: pendingMember });
  });
  await page.goto("/receptionist/members");
  await page.getByRole("button", { name: "Register a new member", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name", { exact: true }).fill("Walk In Member");
  await dialog.getByLabel("Email", { exact: true }).fill("walkin@example.com");
  await dialog.getByLabel("Confirm email", { exact: true }).fill("walkin@exmaple.com");
  await expect(dialog.getByText("The two email addresses do not match.")).toBeVisible();
  const submit = dialog.getByRole("button", {
    name: "Register and send activation email",
    exact: true,
  });
  await expect(submit).toBeDisabled();

  await dialog.getByLabel("Confirm email", { exact: true }).fill("WALKIN@example.com");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL(new RegExp(`/receptionist/members/${memberId}$`));
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    fullName: "Walk In Member",
    email: "walkin@example.com",
    confirmEmail: "WALKIN@example.com",
  });
  expect(writes[0]).not.toHaveProperty("password");
  expect(writes[0]).not.toHaveProperty("role");
});

test("members awaiting activation are flagged and the desk can resend the link or fix the email", async ({
  page,
}) => {
  await setup(page, pendingMember);
  const calls: string[] = [];
  await page.route(`**/api/members/front-desk/${memberId}/resend-activation`, (route) => {
    calls.push("resend");
    return route.fulfill({ json: pendingMember });
  });
  await page.route(`**/api/members/front-desk/${memberId}/email`, (route) => {
    calls.push("email");
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toMatchObject({
      email: "right@example.com",
      confirmEmail: "right@example.com",
      reason: "Typo at the desk",
    });
    return route.fulfill({ json: { ...pendingMember, email: "right@example.com" } });
  });

  await page.goto("/receptionist/members");
  await expect(page.getByRole("table")).toContainText("Pending activation");

  await page.goto(`/receptionist/members/${memberId}`);
  const panel = page.getByRole("region", { name: "Pending activation" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Resend activation link", exact: true }).click();
  await expect.poll(() => calls).toEqual(["resend"]);

  await panel.getByRole("button", { name: "Change email", exact: true }).click();
  await panel.getByLabel("New email", { exact: true }).fill("right@example.com");
  await panel.getByLabel("Confirm new email", { exact: true }).fill("other@example.com");
  await expect(panel.getByText("The two email addresses do not match.")).toBeVisible();
  const save = panel.getByRole("button", { name: "Update email and send link", exact: true });
  await expect(save).toBeDisabled();
  await panel.getByLabel("Confirm new email", { exact: true }).fill("right@example.com");
  await panel.getByLabel("Reason", { exact: true }).fill("Typo at the desk");
  await save.click();
  await expect.poll(() => calls).toEqual(["resend", "email"]);
});

test("activated members show no pending-activation panel", async ({ page }) => {
  await setup(page, { ...pendingMember, activationPending: false, hasPassword: true });
  await page.goto(`/receptionist/members/${memberId}`);
  await expect(page.getByRole("heading", { name: "Walk In Member" }).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Pending activation" })).toHaveCount(0);
});
