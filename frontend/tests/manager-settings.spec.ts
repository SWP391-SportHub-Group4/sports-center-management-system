import { expect, test, type Page } from "@playwright/test";

const initialValues = {
  "center.opening_minutes": "480",
  "center.closing_minutes": "1200",
  "class.threshold_days_before_start": "6",
  "hold.minutes": "20",
  "points.confirm_otp_minutes": "9",
  "rental.max_hours": "2",
  "membership.expiry_notice_days": "21",
  "support.sla_hours": "12",
  "support.remind_cooldown_hours": "6",
  "support.payout_confirm_days": "7",
};
const savedAt = "2026-10-27T06:15:00Z";
async function install(page: Page) {
  const state = {
    fail: false,
    missing: false,
    rows: Object.entries(initialValues).map(([key, value]) => ({
      key,
      value,
      description: key,
      updatedAt: "2026-10-26T02:00:00Z",
    })),
    writes: [] as Record<string, string>[],
  };
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "settings-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/users/me")
      return route.fulfill({
        json: {
          userId: "11111111-1111-4111-8111-111111111111",
          role: "CENTER_MANAGER",
          fullName: "Manager",
          sportIds: [],
        },
      });
    if (path.endsWith("unread-count"))
      return route.fulfill({ json: { count: 0 } });
    if (path === "/api/system-settings") {
      if (request.method() === "PUT") {
        const { values } = request.postDataJSON() as {
          values: Record<string, string>;
        };
        state.writes.push(values);
        if (state.fail)
          return route.fulfill({
            status: 409,
            json: {
              error: "settings_conflict",
              message: "Settings could not be saved. Please retry.",
            },
          });
        const updated = state.rows.filter((row) => row.key in values);
        updated.forEach((row) => {
          row.value = values[row.key];
          row.updatedAt = savedAt;
        });
        return route.fulfill({ json: updated });
      }
      return route.fulfill({ json: state.missing ? [] : state.rows });
    }
    return route.fulfill({ json: [] });
  });
  return state;
}

const cases = [
  {
    section: "Center hours",
    fields: {
      "Center opening time": ["08:00", "09:00"],
      "Center closing time": ["20:00", "21:00"],
    },
    values: {
      "center.opening_minutes": "540",
      "center.closing_minutes": "1260",
    },
  },
  {
    section: "Classes",
    fields: { "Threshold check": ["6", "7"] },
    values: { "class.threshold_days_before_start": "7" },
  },
  {
    section: "Checkout & points",
    fields: {
      "Checkout hold": ["20", "25"],
      "Counter point OTP validity": ["9", "8"],
    },
    values: { "hold.minutes": "25", "points.confirm_otp_minutes": "8" },
  },
  {
    section: "Court rentals",
    fields: { "Maximum rental duration": ["2", "3"] },
    values: { "rental.max_hours": "3" },
  },
  {
    section: "Membership",
    fields: { "Membership expiry notice": ["21", "30"] },
    values: { "membership.expiry_notice_days": "30" },
  },
  {
    section: "Support requests",
    fields: {
      "Support response deadline": ["12", "24"],
      "Support reminder interval": ["6", "8"],
      "Payout confirmation period": ["7", "5"],
    },
    values: {
      "support.sla_hours": "24",
      "support.remind_cooldown_hours": "8",
      "support.payout_confirm_days": "5",
    },
  },
];

for (const example of cases) {
  test(`${example.section} reads server values and persists its section through reload`, async ({
    page,
  }) => {
    const state = await install(page);
    await page.goto("/manager/settings");
    const section = page.getByRole("region", {
      name: example.section,
      exact: true,
    });
    for (const [label, [initial, value]] of Object.entries(example.fields)) {
      await expect(section.getByLabel(label, { exact: true })).toHaveValue(
        initial,
      );
      await section.getByLabel(label, { exact: true }).fill(value);
    }
    await section
      .getByRole("button", { name: `Save ${example.section}`, exact: true })
      .click();
    await expect(section.getByRole("status")).toHaveText("Changes saved.");
    expect(state.writes).toEqual([example.values]);
    await expect(section.locator("time")).toHaveAttribute("datetime", savedAt);
    await page.reload();
    for (const [label, [, value]] of Object.entries(example.fields))
      await expect(section.getByLabel(label, { exact: true })).toHaveValue(
        value,
      );
  });
}

test("a failed save preserves the draft and never reports success", async ({
  page,
}) => {
  const state = await install(page);
  state.fail = true;
  await page.goto("/manager/settings");
  const section = page.getByRole("region", {
    name: "Support requests",
    exact: true,
  });
  await section
    .getByLabel("Support response deadline", { exact: true })
    .fill("24");
  await section.getByRole("button", { name: "Save Support requests" }).click();
  await expect(section.getByRole("alert")).toHaveText(
    "Settings could not be saved. Please retry.",
  );
  await expect(section.getByRole("status")).not.toHaveText("Changes saved.");
  await expect(
    section.getByLabel("Support response deadline", { exact: true }),
  ).toHaveValue("24");
  await page.reload();
  await expect(
    section.getByLabel("Support response deadline", { exact: true }),
  ).toHaveValue("12");
});

test("missing server settings show an error instead of fabricated defaults", async ({
  page,
}) => {
  const state = await install(page);
  state.missing = true;
  await page.goto("/manager/settings");
  await expect(
    page.getByText(
      "Operating settings are unavailable. Please retry loading them.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Center hours" }),
  ).toHaveCount(0);
});
