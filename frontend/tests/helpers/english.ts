import { expect, type Page } from "@playwright/test";

/** Legacy saved preferences must never restore a language control or change copy. */
export async function assertEnglishOnlyShell(page: Page) {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("profile-language-toggle")).toHaveCount(0);
  await expect(page.getByTestId("language-switcher-trigger")).toHaveCount(0);
}
