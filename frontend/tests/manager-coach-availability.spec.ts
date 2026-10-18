import { expect, test, type Page, type Route } from "@playwright/test";

const managerId = "11111111-1111-4111-8111-111111111111";
const original = "22222222-2222-4222-8222-222222222222";
const free = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const sessionId = "55555555-5555-4555-8555-555555555555";
const request = {
  requestId: "66666666-6666-4666-8666-666666666666",
  sessionId,
  classId: 1,
  className: "Badminton · Evening foundations",
  sportId: 3,
  sessionNo: 3,
  coachId: original,
  coachName: "Alex Nguyen",
  type: "ABSENCE",
  status: "PENDING",
  reason: "Medical appointment — please arrange a replacement for this lesson.",
  originalStartAtUtc: "2032-03-01T11:00:00Z",
  originalEndAtUtc: "2032-03-01T12:30:00Z",
  originalRoomId: 7,
  proposedStartAtUtc: null,
  proposedEndAtUtc: null,
  createdAtUtc: "2032-02-28T02:00:00Z",
  reviewedAtUtc: null,
  reviewNote: null,
  resolutionType: null,
  resultSessionId: null,
};
const paged = (items: unknown[]) => ({
  items,
  totalCount: items.length,
  page: 1,
  pageSize: 50,
});
type Fixture = {
  lookup?: (route: Route) => Promise<void>;
  resolve?: (route: Route) => Promise<void>;
};
async function fixture(page: Page, handlers: Fixture = {}) {
  const queries: URL[] = [];
  let unfilteredReads = 0;
  let current = { ...request };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "availability-ui-fixture");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()),
      p = url.pathname;
    if (p === "/api/availability/coaches") {
      queries.push(url);
      if (handlers.lookup) return handlers.lookup(route);
      return route.fulfill({
        json: [
          { coachId: original, fullName: "Alex Nguyen" },
          { coachId: free, fullName: "Jamie Tran" },
        ],
      });
    }
    if (p.endsWith("/resolve") || p.endsWith("/reject")) {
      if (handlers.resolve) return handlers.resolve(route);
      current = { ...current, status: "RESOLVED" };
      return route.fulfill({ json: current });
    }
    if (p === "/api/manager/coaches") {
      unfilteredReads++;
      return route.fulfill({ json: paged([]) });
    }
    const data: Record<string, unknown> = {
      "/api/users/me": {
        userId: managerId,
        role: "CENTER_MANAGER",
        fullName: "Center Manager",
        email: "manager@example.test",
        sportIds: [],
        status: "ACTIVE",
      },
      "/api/notifications/unread-count": { count: 0 },
      "/api/manager/class-session-change-requests/filters": {
        classes: [{ classId: 1, name: request.className }],
        coaches: [{ coachId: original, name: request.coachName }],
      },
      "/api/manager/class-session-change-requests": paged([current]),
      "/api/rooms": [
        {
          roomId: 7,
          name: "Badminton court 1",
          roomTypeId: 1,
          capacity: 12,
          isActive: true,
        },
      ],
    };
    return route.fulfill({ json: data[p] ?? [] });
  });
  await page.goto("/manager/schedule?section=requests");
  await page
    .getByRole("button", {
      name: new RegExp(request.className.replace("·", ".") + ".*Session 3"),
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review request", exact: true }),
  ).toBeVisible();
  return { queries, unfilteredReads: () => unfilteredReads };
}
const decision = (page: Page) =>
  page.getByRole("combobox", { name: "Decision", exact: true });
const assigned = (page: Page) =>
  page.getByRole("combobox", { name: "Assigned coach", exact: true });
const confirm = (page: Page) =>
  page.getByRole("button", { name: "Confirm decision", exact: true });
async function snapshot(page: Page, file: string) {
  await page.screenshot({
    path: test.info().outputPath(file),
    fullPage: true,
    animations: "disabled",
  });
  await test.info().attach(file, {
    path: test.info().outputPath(file),
    contentType: "image/png",
  });
}

test("substitute selector uses the full original slot and excludes the absent coach", async ({
  page,
}) => {
  const state = await fixture(page);
  await decision(page).selectOption("SUBSTITUTE");
  await expect(assigned(page)).toBeEnabled();
  expect(state.queries.at(-1)?.searchParams.get("sportId")).toBe("3");
  expect(Date.parse(state.queries.at(-1)!.searchParams.get("startUtc")!)).toBe(
    Date.parse(request.originalStartAtUtc),
  );
  expect(Date.parse(state.queries.at(-1)!.searchParams.get("endUtc")!)).toBe(
    Date.parse(request.originalEndAtUtc),
  );
  expect(state.queries.at(-1)?.searchParams.get("excludeSessionId")).toBe(
    sessionId,
  );
  await expect(
    assigned(page).getByRole("option", { name: "Alex Nguyen", exact: true }),
  ).toHaveCount(0);
  await expect(
    assigned(page).getByRole("option", { name: "Jamie Tran", exact: true }),
  ).toHaveCount(1);
  await expect(confirm(page)).toBeDisabled();
  await assigned(page).selectOption(free);
  await page
    .getByRole("textbox", {
      name: "Decision reason / feedback to Coach",
      exact: true,
    })
    .fill(
      "Jamie is available for the full lesson and will cover this session.",
    );
  await expect(confirm(page)).toBeEnabled();
  expect(state.unfilteredReads()).toBe(0);
  await snapshot(page, "01-available-substitute.png");
  await confirm(page).click();
  await expect(
    page.getByRole("dialog", { name: "Review request", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Badminton.*Evening foundations.*Session 3/,
    }),
  ).toContainText("Approved");
});

test("empty availability blocks substitution and guides Manager to another resolution", async ({
  page,
}) => {
  await fixture(page, { lookup: (route) => route.fulfill({ json: [] }) });
  await decision(page).selectOption("SUBSTITUTE");
  await expect(
    page.getByText(
      "No available coaches for this session. Choose Reschedule or Cancel & makeup.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(assigned(page)).toBeDisabled();
  await expect(confirm(page)).toBeDisabled();
  await snapshot(page, "02-no-coaches.png");
  await decision(page).selectOption("REJECT");
  await page
    .getByRole("textbox", {
      name: "Decision reason / feedback to Coach",
      exact: true,
    })
    .fill("No replacement can be arranged; contact the center.");
  await expect(confirm(page)).toBeEnabled();
});

test("loading and lookup failure block confirmation until a successful retry", async ({
  page,
}) => {
  let calls = 0;
  await fixture(page, {
    lookup: async (route) => {
      if (++calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return route.fulfill({
          status: 503,
          json: {
            error: "lookup_unavailable",
            message: "Availability service is temporarily unavailable.",
          },
        });
      }
      return route.fulfill({
        json: [{ coachId: free, fullName: "Jamie Tran" }],
      });
    },
  });
  await decision(page).selectOption("SUBSTITUTE");
  await expect(
    page.getByText("Checking available coaches…", { exact: true }),
  ).toBeVisible();
  await expect(confirm(page)).toBeDisabled();
  await expect(
    page.getByText(
      "Coach availability could not be loaded. Retry before confirming.",
      { exact: true },
    ),
  ).toBeVisible();
  await snapshot(page, "03-lookup-error.png");
  await page
    .getByRole("button", { name: "Refresh availability", exact: true })
    .click();
  await expect(assigned(page)).toBeEnabled();
  await expect(
    assigned(page).getByRole("option", { name: "Jamie Tran", exact: true }),
  ).toHaveCount(1);
});

test("reschedule refreshes the complete target slot and clears stale coach selection", async ({
  page,
}) => {
  const state = await fixture(page, {
    lookup: (route) =>
      route.fulfill({
        json: new URL(route.request().url()).searchParams
          .get("startUtc")
          ?.includes("12:00")
          ? [{ coachId: other, fullName: "Morgan Le" }]
          : [{ coachId: free, fullName: "Jamie Tran" }],
      }),
  });
  await decision(page).selectOption("RESCHEDULE");
  await expect(assigned(page)).toBeDisabled();
  await page.getByLabel("New start", { exact: true }).fill("2032-03-02T18:00");
  await expect(assigned(page)).toBeEnabled();
  await assigned(page).selectOption(free);
  await page.getByLabel("New start", { exact: true }).fill("2032-03-02T19:00");
  await expect(
    assigned(page).getByRole("option", { name: "Morgan Le", exact: true }),
  ).toHaveCount(1);
  await expect(assigned(page)).toHaveValue("");
  await expect(confirm(page)).toBeDisabled();
  expect(state.queries.at(-1)?.searchParams.get("startUtc")).toBe(
    "2032-03-02T12:00:00.000Z",
  );
  expect(state.queries.at(-1)?.searchParams.get("endUtc")).toBe(
    "2032-03-02T13:30:00.000Z",
  );
  await snapshot(page, "04-reschedule-refreshed.png");
});

test("Manager can keep the current coach when only the edited session occupies their time", async ({
  page,
}) => {
  const state = await fixture(page);
  await decision(page).selectOption("RESCHEDULE");
  await page.getByLabel("New start", { exact: true }).fill("2032-03-01T18:00");
  await expect(
    assigned(page).getByRole("option", {
      name: "Keep current coach",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("textbox", {
      name: "Decision reason / feedback to Coach",
      exact: true,
    })
    .fill("Keep coach and update the room after checking availability.");
  await expect(confirm(page)).toBeEnabled();
  expect(state.queries.at(-1)?.searchParams.get("excludeSessionId")).toBe(
    sessionId,
  );
  await snapshot(page, "05-keep-current-coach.png");
});

test("a save-time conflict retains Pending and the reason, then reloads available coaches", async ({
  page,
}) => {
  let occupied = false,
    saves = 0;
  await fixture(page, {
    lookup: (route) =>
      route.fulfill({
        json: occupied ? [] : [{ coachId: free, fullName: "Jamie Tran" }],
      }),
    resolve: (route) => {
      saves++;
      expect(route.request().postDataJSON().coachId).toBe(free);
      occupied = true;
      return route.fulfill({
        status: 409,
        json: {
          error: "occupancy_conflict",
          message:
            "This coach was just booked for another session. Select another time or coach.",
        },
      });
    },
  });
  await decision(page).selectOption("SUBSTITUTE");
  await expect(assigned(page)).toBeEnabled();
  await assigned(page).selectOption(free);
  const note = "Please arrange cover for the complete lesson.";
  await page
    .getByRole("textbox", {
      name: "Decision reason / feedback to Coach",
      exact: true,
    })
    .fill(note);
  await confirm(page).click();
  await expect(
    page.getByText(
      "This coach was just booked for another session. Select another time or coach.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "No available coaches for this session. Choose Reschedule or Cancel & makeup.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", {
      name: "Decision reason / feedback to Coach",
      exact: true,
    }),
  ).toHaveValue(note);
  await expect(confirm(page)).toBeDisabled();
  expect(saves).toBe(1);
  await snapshot(page, "06-save-conflict.png");
});

test("available-coach review fits a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await decision(page).selectOption("SUBSTITUTE");
  await expect(assigned(page)).toBeEnabled();
  await assigned(page).selectOption(free);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
  await snapshot(page, "07-mobile-review.png");
});
