import type { Page } from "@playwright/test";
import { en } from "../../src/locales/en";

export async function chooseNoticeRecipient(
  page: Page,
  role: string,
  account: { userId: string; name: string; email: string },
) {
  await page.route("**/api/manager/notices/recipient-options?**", (route) =>
    route.fulfill({
      json: {
        items: [{ ...account, avatarUrl: null }],
        page: 1,
        pageSize: 20,
        totalCount: 1,
      },
    }),
  );
  await page.route("**/api/manager/notices/recipient-filters", (route) =>
    route.fulfill({ json: { classes: [], specialties: [] } }),
  );
  await page
    .getByRole("button", {
      name: `${en.manualNotices.chooseRecipients}: ${role}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: `${role} recipients`,
    exact: true,
  });
  await dialog
    .getByRole("checkbox", { name: account.name, exact: true })
    .check();
  await dialog
    .getByRole("button", { name: en.manualNotices.finishSelection })
    .click();
}
