import { expect, test } from "@playwright/test";

test("payment support invoice picker filters by number and loads more while scrolling", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "invoice-picker-test");
    localStorage.setItem("sporthub_lang", "en");
  });

  const requestedPages: number[] = [];
  const requestedKeywords: string[] = [];
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "member-1",
          email: "member@example.com",
          fullName: "Alex Member",
          role: "MEMBER",
        },
      });
    if (path === "/api/support/requests/mine")
      return route.fulfill({ json: [] });
    if (path === "/api/members/me/invoices") {
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
      const keyword = url.searchParams.get("keyword") ?? "";
      requestedPages.push(pageNumber);
      requestedKeywords.push(keyword);
      const all = Array.from({ length: 45 }, (_, index) => {
        const number = 45 - index;
        return {
          invoiceId: String(number),
          invoiceNumber: "INV-2026-" + String(number).padStart(6, "0"),
          itemDescription: "Court rental",
          totalAmount: 100_000,
          issuedAt: new Date(Date.UTC(2026, 9, 25, 0, number)).toISOString(),
          status: number % 2 ? "VOID" : "PAID",
        };
      });
      const matches = keyword
        ? all.filter((invoice) =>
            invoice.invoiceNumber.toLowerCase().includes(keyword.toLowerCase()),
          )
        : all;
      return route.fulfill({
        json: {
          items: matches.slice(
            (pageNumber - 1) * pageSize,
            pageNumber * pageSize,
          ),
          totalCount: matches.length,
          page: pageNumber,
          pageSize,
        },
      });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/member/help?topic=PAYMENT");
  const picker = page.getByRole("combobox", { name: "Invoice *" });
  await expect(picker).toBeVisible();
  await expect(page.getByText("Search invoices")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Load 5 more invoices" }),
  ).toHaveCount(0);

  await picker.click();
  const list = page.getByRole("listbox", { name: "Invoices" });
  await expect(list.getByRole("option")).toHaveCount(20);
  await expect(list.getByRole("option").first()).toContainText(
    "INV-2026-000045",
  );
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(list.getByRole("option")).toHaveCount(40);
  expect(requestedPages).toContain(2);
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(list.getByRole("option")).toHaveCount(45);
  expect(requestedPages).toContain(3);

  await picker.fill("INV-2026-000117");
  await expect(
    page.getByText(
      "Invoice not found in your account. Check the invoice number.",
    ),
  ).toBeVisible();
  await expect(picker).toHaveAttribute("aria-invalid", "true");
  await picker.press("Tab");
  await expect(
    page.getByText(
      "Invoice not found in your account. Check the invoice number.",
    ),
  ).toBeVisible();

  await picker.fill("INV-2026-000003");
  await expect(list.getByRole("option")).toHaveCount(1);
  await expect(list.getByRole("option")).toContainText("INV-2026-000003");
  expect(requestedKeywords).toContain("INV-2026-000003");
  await list.getByRole("option").click();
  await expect(picker).toHaveValue("INV-2026-000003");
  await expect(picker).toHaveAttribute("aria-invalid", "false");
  await expect(list).toHaveCount(0);
});
