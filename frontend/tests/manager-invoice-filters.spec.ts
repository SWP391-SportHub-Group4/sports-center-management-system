import { expect, test } from "@playwright/test";

test("invoice filters combine dates, member suggestions and status", async ({
  page,
}) => {
  const memberId = "11111111-1111-4111-8111-111111111111";
  const queries: URLSearchParams[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "manager-token");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ json: body });
    if (url.pathname === "/api/users/me")
      return json({
        userId: "22222222-2222-4222-8222-222222222222",
        email: "manager@example.com",
        fullName: "Manager",
        role: "CENTER_MANAGER",
        sportIds: [],
      });
    if (url.pathname === "/api/users")
      return json({
        items: [
          {
            userId: memberId,
            fullName: "Trịnh Công Sơn",
            email: "son@example.com",
            role: "MEMBER",
            status: "ACTIVE",
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 8,
      });
    if (url.pathname === "/api/invoices") {
      queries.push(url.searchParams);
      return json({
        items: [],
        page: Number(url.searchParams.get("page")),
        pageSize: 10,
        totalCount: 30,
      });
    }
    return json(url.pathname.endsWith("unread-count") ? { count: 0 } : []);
  });
  await page.goto("/manager/finance");
  await page
    .getByLabel("From date & time", { exact: true })
    .fill("2026-11-18T08:00");
  await page
    .getByLabel("To date & time", { exact: true })
    .fill("2026-11-19T18:30");
  await page.getByLabel("Member", { exact: true }).fill("Sơn");
  await expect(
    page.getByRole("button", { name: /Trịnh Công Sơn/ }),
  ).toBeVisible();
  await page.getByLabel("Member", { exact: true }).press("Enter");
  await expect(page.getByLabel("Member", { exact: true })).toHaveValue(
    "Trịnh Công Sơn",
  );
  await expect(
    page.getByRole("button", { name: "Change", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Trịnh Công Sơn/ }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: /Status/ }).selectOption("PAID");
  await expect.poll(() => queries.at(-1)?.get("memberId")).toBe(memberId);
  await expect.poll(() => queries.at(-1)?.get("status")).toBe("PAID");
  expect(queries.at(-1)?.get("issuedFrom")).toBe("2026-11-18T01:00:00.000Z");
  expect(queries.at(-1)?.get("issuedTo")).toBe("2026-11-19T11:30:59.999Z");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect.poll(() => queries.at(-1)?.get("page")).toBe("2");
  await page.getByLabel("Member", { exact: true }).fill("Sơn mới");
  await expect.poll(() => queries.at(-1)?.get("memberId")).toBe(null);
  expect(queries.at(-1)?.get("page")).toBe("1");
  await page.getByRole("button", { name: /Trịnh Công Sơn/ }).click();
  await expect(page.getByLabel("Member", { exact: true })).toHaveValue(
    "Trịnh Công Sơn",
  );
  await expect.poll(() => queries.at(-1)?.get("memberId")).toBe(memberId);
  await page.getByLabel("Member", { exact: true }).fill("");
  await expect.poll(() => queries.at(-1)?.get("memberId")).toBe(null);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByLabel("To date & time", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
