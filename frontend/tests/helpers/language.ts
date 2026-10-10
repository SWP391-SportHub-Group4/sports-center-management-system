import type { Page } from "@playwright/test";

export async function toggleHeaderLanguage(page: Page) {
  await page
    .getByTestId("language-switcher-trigger")
    .filter({ visible: true })
    .last()
    .click();
  await page
    .getByRole("menuitem", { name: /English \(EN\)|Tiếng Việt \(VI\)/ })
    .click();
}
