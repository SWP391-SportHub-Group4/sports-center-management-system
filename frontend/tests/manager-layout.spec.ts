import { expect, test } from "@playwright/test";
import { managerLayoutFixture, layoutRoutes } from "./helpers/manager-layout";

const groups = {
  Sport: [
    ["Sports", "/manager/sports"],
    ["Rooms", "/manager/facilities"],
    ["Membership", "/manager/membership-plans"],
    ["Classes", "/manager/classes"],
  ],
  "Billing management": [
    ["Invoices", "/manager/finance"],
    ["Point wallets", "/manager/points"],
    ["Report", "/manager/reports"],
  ],
  Exception: [
    ["Request", "/manager/requests"],
    ["Incident", "/manager/incidents"],
    ["Manual notices", "/manager/notices"],
  ],
};
test("manager navigation matches the requested groups on desktop and in the mobile drawer", async ({
  page,
}) => {
  await managerLayoutFixture(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/manager/sports");
  const nav = page.getByRole("navigation", {
    name: "Center Manager",
    exact: true,
  });
  await expect(nav.locator(":scope > a, :scope > div > button")).toHaveText([
    "Overview",
    "Sport",
    "Media",
    "People",
    "Billing management",
    "Exception",
  ]);
  for (const [name, entries] of Object.entries(groups)) {
    const trigger = nav.getByRole("button", { name, exact: true });
    await trigger.click();
    const menu = page.locator(
      "#" + (await trigger.getAttribute("aria-controls")),
    );
    await expect(menu.getByRole("link")).toHaveText(
      entries.map(([label]) => label),
    );
    for (const [label, href] of entries)
      await expect(
        menu.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("href", href);
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await nav.getByRole("button", { name: "Sport", exact: true }).click();
  await page.screenshot({
    path: "../.impeccable/review/navbar-sport-desktop.png",
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await nav
    .getByRole("button", { name: "Billing management", exact: true })
    .click();
  await page.screenshot({
    path: "../.impeccable/review/navbar-billing-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation menu", exact: true })
    .click();
  const drawer = page.locator('[class*="mobileNavLinks"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[class*=drawerGroupLabel]")).toHaveText([
    "Sport",
    "Billing management",
    "Exception",
  ]);
  for (const entries of Object.values(groups))
    for (const [label, href] of entries)
      await expect(
        drawer.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("href", href);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "../.impeccable/review/navbar-mobile.png",
    animations: "disabled",
  });
});

for (const width of [1440, 1024, 390, 320])
  test(
    "management table alignment and overflow at " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await managerLayoutFixture(page);
      for (const [name, path] of layoutRoutes) {
        await page.goto(path);
        const table = page.locator("table").first();
        await expect(table).toBeVisible();
        await expect(table.locator("tbody .skeleton")).toHaveCount(0);
        await expect(table.locator("tbody tr")).toHaveCount(2);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          name + " page overflow",
        ).toBe(true);
        if (width >= 768) {
          const alignment = await table.evaluate((table) => {
            const head = [...table.querySelectorAll("thead tr:first-child >*")];
            const cells = [
              ...table.querySelectorAll("tbody tr:first-child >*"),
            ];
            const row = table
              .querySelector("tbody tr")!
              .getBoundingClientRect();
            return {
              head: head.map((el) => getComputedStyle(el).textAlign),
              body: cells.map((el) => getComputedStyle(el).textAlign),
              primary: [...table.querySelectorAll('tbody th[scope="row"]')].map(
                (el) => getComputedStyle(el).textAlign,
              ),
              heights: cells.map((el) =>
                Math.abs(el.getBoundingClientRect().height - row.height),
              ),
            };
          });
          expect(alignment.body, name + " header/body alignment").toEqual(
            alignment.head,
          );
          for (const value of alignment.primary)
            expect(value, name + " primary name").toBe("left");
          for (const delta of alignment.heights)
            expect(delta, name + " broken table cell").toBeLessThan(1);
          if (name === "rates")
            await expect(
              table.locator('tbody td[data-label="Price / hour"]').first(),
            ).toHaveCSS("text-align", "right");
          if (name === "rates" || name === "people")
            await expect(
              table.locator('tbody td[data-label="Status"]').first(),
            ).toHaveCSS("text-align", "center");
        } else {
          await expect(
            table.locator("tbody td[data-label],tbody th[data-label]").first(),
          ).toBeVisible();
        }
        if (
          [1440, 390].includes(width) &&
          ["courts", "rates", "membership", "people"].includes(name)
        )
          await page.screenshot({
            path:
              "../.impeccable/review/tables-after-" +
              name +
              "-" +
              width +
              ".png",
            animations: "disabled",
          });
      }
    },
  );
