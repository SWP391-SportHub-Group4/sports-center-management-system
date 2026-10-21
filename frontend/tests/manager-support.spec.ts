import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const id = "22222222-2222-4222-8222-222222222222";
const staff = "33333333-3333-4333-8333-333333333333";
async function install(page: Page, role = "CENTER_MANAGER") {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "support-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  const state = {
    status: "OPEN",
    note: "",
    assigned: "",
    error: false,
    reject: false,
    empty: false,
    multiple: false,
  };
  const queries: URL[] = [];
  const writes: { path: string; body: Record<string, string> }[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (path === "/api/users/me")
      return json({
        userId: staff,
        role,
        fullName: "Manager",
        email: "manager@example.com",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (req.method() === "POST") {
      const body = req.postDataJSON();
      writes.push({ path, body });
      if (state.reject)
        return route.fulfill({
          status: 409,
          json: {
            error: "support_request_closed",
            message: "Support request is closed.",
          },
        });
      if (path.endsWith("assign")) {
        state.assigned = body.assigneeUserId;
        state.status = "ASSIGNED";
      }
      if (path.endsWith("progress")) {
        state.note = body.note;
        state.status = "IN_PROGRESS";
      }
      if (path.endsWith("close")) {
        state.note = body.resolution;
        state.status = "CLOSED";
      }
      return json({ requestId: id });
    }
    if (path.endsWith("/assignees"))
      return json([
        {
          userId: staff,
          name: "Desk handler",
          email: "handler@example.com",
          role: "Receptionist",
        },
      ]);
    const row = {
      requestId: id,
      memberId: id,
      memberName: "Member An",
      memberEmail: "an@example.com",
      recordedByUserId: staff,
      category: "GENERAL",
      subject: "Help with membership",
      description: "Please review my membership.\n<img src=x onerror=alert(1)>",
      status: state.status,
      createdAt: "2026-10-18T03:00:00Z",
      updatedAt: "2026-10-18T04:00:00Z",
      closedAt: state.status === "CLOSED" ? "2026-10-18T05:00:00Z" : null,
      assignedToUserId: state.assigned || null,
      assignedToName: state.assigned ? "Desk handler" : null,
      progressNote: state.note || null,
    };
    if (path.endsWith("/queue")) {
      queries.push(url);
      if (state.error)
        return route.fulfill({
          status: 500,
          json: { error: "unavailable", message: "Support unavailable" },
        });
      return json({
        items: state.empty
          ? []
          : state.multiple
            ? [
                row,
                {
                  ...row,
                  requestId: "44444444-4444-4444-8444-444444444444",
                  subject: "Court booking question",
                  memberName: "Member Binh",
                  memberEmail: "binh@example.com",
                  category: "CLASS",
                  status: "OPEN",
                  assignedToUserId: null,
                  assignedToName: null,
                  progressNote: null,
                },
              ]
            : [row],
        totalCount: state.empty ? 0 : 21,
        page: Number(url.searchParams.get("page")),
        pageSize: 20,
      });
    }
    if (path === "/api/member-support-requests") return json([]);
    if (path === `/api/users/${id}`)
      return json({
        userId: id,
        fullName: "Member An",
        email: "an@example.com",
        role: "MEMBER",
        status: "ACTIVE",
      });
    if (path === "/api/coach-member-relationships")
      return json({ items: [], totalCount: 0 });
    return json([]);
  });
  return { state, queries, writes };
}

test("manager assigns, records progress and closes with resolution in its workspace", async ({
  page,
}, info) => {
  const { writes } = await install(page);
  await page.goto("/manager/support");
  await expect(
    page.getByRole("heading", { level: 1, name: "Support requests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Member An · an@example.com" }),
  ).toHaveAttribute("href", `/manager/members/${id}`);
  await expect(page.locator('a[href^="/receptionist/"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Close request", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("combobox", { name: "Assign to", exact: true })
    .selectOption(staff);
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(
    page
      .locator("p")
      .filter({ has: page.getByText("Assigned to", { exact: true }) })
      .getByText("Desk handler", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: /^Progress or resolution/ })
    .fill("Checking the account");
  await page.getByRole("button", { name: "Update progress" }).click();
  await expect(
    page.getByText("Latest update: Checking the account"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Help with membership.*IN PROGRESS/ }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search", exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("manager-support-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await page.screenshot({
    path: info.outputPath("manager-support-mobile.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter(
      (x) => x.impact === "serious" || x.impact === "critical",
    ),
  ).toEqual([]);
  await page
    .getByRole("textbox", { name: /^Progress or resolution/ })
    .fill("Membership corrected");
  await page
    .getByRole("button", { name: "Close request", exact: true })
    .click();
  expect(writes.some((write) => write.path.endsWith("/close"))).toBe(false);
  await page.getByRole("button", { name: "Confirm close" }).click();
  await expect(
    page.getByText("Resolution: Membership corrected"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close request", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Closed 18\/10\/2026/)).toBeVisible();
  expect(writes.map((x) => x.path.split("/").at(-1))).toEqual([
    "assign",
    "progress",
    "close",
  ]);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test("manager filters on the server, pages, retries and sees empty results", async ({
  page,
}) => {
  const { queries, state } = await install(page);
  await page.goto("/manager/support");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get("page")).toBe("2");
  await page.getByLabel("Search", { exact: true }).fill(" Member An ");
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("ASSIGNED");
  await page
    .getByRole("combobox", { name: "Assigned staff", exact: true })
    .selectOption(staff);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("search"))
    .toBe("Member An");
  expect(queries.at(-1)?.searchParams.get("status")).toBe("ASSIGNED");
  expect(queries.at(-1)?.searchParams.get("assignedToUserId")).toBe(staff);
  expect(queries.at(-1)?.searchParams.get("page")).toBe("1");
  state.error = true;
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.getByText("Support unavailable")).toBeVisible();
  state.error = false;
  state.empty = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText(/No requests match these filters/)).toBeVisible();
});

test("assigned-to-me filter toggles the server query and resets pagination", async ({
  page,
}) => {
  const { queries } = await install(page);
  await page.goto("/manager/support");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get("page")).toBe("2");
  const mine = page.getByRole("button", {
    name: "Assigned to me",
    exact: true,
  });
  await mine.click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("assignedToUserId"))
    .toBe(staff);
  await expect(mine).toHaveAttribute("aria-pressed", "true");
  expect(queries.at(-1)?.searchParams.get("page")).toBe("1");
  await mine.click();
  await expect
    .poll(() => queries.at(-1)?.searchParams.get("assignedToUserId") || null)
    .toBeNull();
  await expect(mine).toHaveAttribute("aria-pressed", "false");
});

test("a conflict retains the draft and refresh displays the closed result", async ({
  page,
}) => {
  const { state } = await install(page);
  state.assigned = staff;
  state.status = "ASSIGNED";
  await page.goto("/manager/support");
  await page
    .getByRole("textbox", { name: /^Progress or resolution/ })
    .fill("Do not lose this note");
  state.reject = true;
  await page.getByRole("button", { name: "Update progress" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Support request is closed." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /^Progress or resolution/ }),
  ).toHaveValue("Do not lose this note");
  state.status = "CLOSED";
  state.note = "Closed by another staff member";
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByText("Resolution: Closed by another staff member"),
  ).toBeVisible();
});

test("manager records a request from a member profile", async ({ page }) => {
  const { writes } = await install(page);
  await page.goto(`/manager/members/${id}`);
  const support = page.getByRole("region", {
    name: "Member support requests",
    exact: true,
  });
  await support
    .getByRole("button", { name: "Locker request", exact: true })
    .click();
  await support.getByLabel("Subject", { exact: true }).fill("Membership help");
  await support
    .getByLabel(/^Description/)
    .fill("Please check the expiry date.");
  await support.getByRole("button", { name: "Record support request" }).click();
  await expect(
    support.getByText("Support request recorded successfully."),
  ).toBeVisible();
  expect(writes[0].body).toEqual({
    memberId: id,
    category: "GENERAL",
    subject: "Membership help",
    description: "Please check the expiry date.",
  });
});

test("request details retain unsent notes when switching requests and refreshing", async ({
  page,
}) => {
  const { state } = await install(page);
  state.status = "ASSIGNED";
  state.assigned = staff;
  state.multiple = true;
  await page.goto("/manager/support");
  await page
    .getByRole("textbox", { name: /^Progress or resolution/ })
    .fill("Keep this unfinished progress note");
  await page
    .getByRole("button", {
      name: "View request: Court booking question",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Collapse request: Court booking question",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("button", {
      name: "View request: Help with membership",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: /^Progress or resolution/ }),
  ).toHaveValue("Keep this unfinished progress note");
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: /^Progress or resolution/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: /^Progress or resolution/ }),
  ).toHaveValue("Keep this unfinished progress note");
});

test("receptionist queue keeps member links in its own workspace", async ({
  page,
}) => {
  await install(page, "RECEPTIONIST");
  await page.goto("/receptionist/support");
  await expect(
    page.getByRole("link", { name: "Member An · an@example.com" }),
  ).toHaveAttribute("href", `/receptionist/members/${id}`);
  // Lễ tân ghi yêu cầu ngay trên Today's desk, nên hàng đợi không còn nút "Record a request".
  await expect(
    page.getByRole("link", { name: "Record a request" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Assign", exact: true }),
  ).toBeVisible();
});

test("member cannot enter manager support", async ({ page }) => {
  const { writes } = await install(page, "MEMBER");
  await page.goto("/manager/support");
  await expect(page).toHaveURL(/\/member$/);
  await expect(
    page.getByRole("combobox", { name: "Assign to", exact: true }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});
