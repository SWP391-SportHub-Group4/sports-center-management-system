import { expect, test, type Page } from "@playwright/test";
import { vietnamUtc, dayRange } from "../src/lib/vietnam-time";
import { previewSessions } from "../src/features/courses/preview";
import type { ManagerCourseDto } from "../src/lib/types";
import { en } from "../src/locales/en";
import { vi } from "../src/locales/vi";

// HTTP fixtures validate frontend behavior only. No payments, email, or production API calls.

for (const hasPt of [false, true]) {
  test(
    "Coach teaching calendar uses owner-scoped APIs, PT specialty: " + hasPt,
    async ({ page }) => {
      await session(page, "COACH");
      await page.clock.setFixedTime(new Date("2030-10-03T02:00:00Z"));
      await page.route("**/api/users/me", (r) =>
        r.fulfill({
          json: {
            userId: memberId,
            email: "coach@example.com",
            fullName: "Coach A",
            role: "COACH",
            sportIds: hasPt ? [1, 2] : [1],
            isPersonalTrainer: hasPt,
          },
        }),
      );
      await page.route("**/api/sports", (r) =>
        r.fulfill({
          json: [
            sport,
            {
              ...sport,
              sportId: 2,
              name: "Personal training",
              code: "gym",
              services: [
                {
                  serviceType: "PERSONAL_TRAINING",
                  isEnabled: true,
                  defaultSessionMinutes: null,
                  defaultMaxCapacity: null,
                },
              ],
            },
          ],
        }),
      );
      let ptReads = 0,
        staffReads = 0,
        writes = 0;
      page.on("request", (r) => {
        const p = new URL(r.url()).pathname;
        if (p.startsWith("/api/manager/court-schedule")) staffReads++;
        if (
          p.startsWith("/api/") &&
          ["POST", "PUT", "DELETE", "PATCH"].includes(r.method())
        )
          writes++;
      });
      await page.route("**/api/coaches/me/court-schedule?**", (r) =>
        r.fulfill({
          json: [
            {
              sourceType: "CLASS_SESSION",
              sourceId: sessionId,
              classId: 1,
              roomId: 1,
              title: "My badminton course",
              coachId: memberId,
              coachName: "Coach A",
              startAtUtc: "2030-10-03T02:00:00Z",
              endAtUtc: "2030-10-03T03:30:00Z",
              status: "SCHEDULED",
              participants: [
                {
                  memberId: otherMemberId,
                  memberName: "Assigned member",
                  enrollmentId,
                  attendanceStatus: "PRESENT",
                  recordedAtUtc: null,
                },
              ],
            },
          ],
        }),
      );
      await page.route("**/api/coaches/me/pt-sessions?**", (r) => {
        ptReads++;
        expect(new URL(r.request().url()).searchParams.get("fromUtc")).toBe(
          "2030-10-02T17:00:00.000Z",
        );
        return r.fulfill({
          json: [
            {
              sessionId: rentalId,
              memberId: otherMemberId,
              memberName: "My PT member",
              coachId: memberId,
              coachName: "Coach A",
              roomId: null,
              startAtUtc: "2030-10-03T04:00:00Z",
              endAtUtc: "2030-10-03T05:30:00Z",
              status: "SCHEDULED",
            },
          ],
        });
      });
      await page.goto("/coach/schedule");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        en.operations.teachingSchedule,
      );
      await page.getByRole("button", { name: /My badminton course/ }).click();
      await expect(
        page.getByRole("cell", { name: "Assigned member", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Present", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      // Assigned PT sessions stay visible read-only even after the PT specialty is removed.
      await page.getByRole("button", { name: /My PT member/ }).click();
      await expect(
        page.getByRole("cell", { name: "My PT member", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "Attendance", exact: true }),
      ).toHaveCount(0);
      expect(ptReads).toBe(1);
      expect(staffReads).toBe(0);
      expect(writes).toBe(0);
    },
  );
}

for (const language of ["en", "vi"] as const) {
  test(
    "Rental checkout keeps payment confirmation after applying points and switching from " +
      language,
    async ({ page }) => {
      await session(page, "MEMBER", language);
      const copy = language === "en" ? en : vi;
      const other = language === "en" ? vi : en;
      let creates = 0,
        pointsWrites = 0,
        payments = 0;
      const checkout = {
        invoiceId: itemId,
        kind: "COURT_RENTAL",
        state: "ACTIVE",
        invoiceStatus: "ISSUED",
        totalAmount: 100000,
        pointsApplied: 0,
        cashAmount: 100000,
        revision: 1,
        fulfillmentOutcome: "NONE",
        reconciliationRequired: false,
        expiresAtUtc: "2030-10-03T03:15:00Z",
        serverNowUtc: "2030-10-03T03:00:00Z",
      };
      await page.route("**/api/court-rentals/availability?**", (route) =>
        route.fulfill({
          json: [
            {
              ...room,
              totalPrice: 100000,
              blocks: [
                {
                  startUtc: rental.startAtUtc,
                  endUtc: rental.endAtUtc,
                  price: 100000,
                },
              ],
            },
          ],
        }),
      );
      await page.route("**/api/checkouts/court-rental", (route) => {
        creates++;
        expect(route.request().postDataJSON()).toMatchObject({
          sportId: 1,
          roomId: 1,
        });
        return route.fulfill({ json: checkout });
      });
      await page.route("**/api/wallet/me", (route) =>
        route.fulfill({
          json: {
            availablePoints: 300 - checkout.pointsApplied,
            heldPoints: checkout.pointsApplied,
            vndPerPoint: 1000,
          },
        }),
      );
      await page.route("**/api/wallet/me/checkouts/*/points", (route) => {
        pointsWrites++;
        expect(route.request().postDataJSON()).toEqual({ points: 100 });
        checkout.pointsApplied = 100;
        checkout.cashAmount = 0;
        checkout.revision++;
        return route.fulfill({ json: checkout });
      });
      await page.route("**/api/checkouts/" + itemId, (route) =>
        route.fulfill({ json: checkout }),
      );
      await page.route(
        "**/api/checkouts/" + itemId + "/confirm-points",
        (route) => {
          payments++;
          checkout.invoiceStatus = "PAID";
          checkout.fulfillmentOutcome = "FULFILLED";
          return route.fulfill({ json: checkout });
        },
      );
      await page.route("**/api/invoices/" + itemId, (route) =>
        route.fulfill({
          json: {
            summary: { memberName: "Member renter" },
            items: [
              { itemId, description: "Court rental", lineAmount: 100000 },
            ],
          },
        }),
      );
      await page.goto("/member/courts/book");
      await page
        .getByLabel(copy.operations.sport, { exact: true })
        .selectOption("1");
      await page
        .getByLabel(copy.operations.date, { exact: true })
        .fill("2030-10-03");
      await page
        .getByRole("button", {
          name: copy.operations.availability,
          exact: true,
        })
        .click();
      await page
        .getByLabel(copy.operations.room, { exact: true })
        .selectOption("1");
      await page
        .getByRole("button", { name: copy.refactor.buy, exact: true })
        .click();
      await page.getByLabel(copy.refactor.points, { exact: true }).fill("100");
      await page
        .getByRole("button", { name: copy.refactor.apply, exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: copy.refactor.pay, exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByLabel(copy.refactor.points, { exact: true }),
      ).toHaveValue("100");
      await page.getByRole("button", { name: "Toggle language" }).click();
      await expect(
        page.getByRole("button", { name: other.refactor.pay, exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByLabel(other.refactor.points, { exact: true }),
      ).toHaveValue("100");
      expect(creates).toBe(1);
      expect(pointsWrites).toBe(1);
      expect(payments).toBe(0);
      await page
        .getByRole("button", { name: other.refactor.pay, exact: true })
        .click();
      await expect(
        page.getByText(other.refactor.paid, { exact: true }),
      ).toBeVisible();
      expect(payments).toBe(1);
      await page.reload();
      await expect(
        page.getByText(copy.refactor.paid, { exact: true }),
      ).toBeVisible();
      expect(creates).toBe(1);
      expect(payments).toBe(1);
    },
  );
}

test("Operating settings translate descriptions and preserve drafts without changing fixed rental blocks", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  const rows = [
    {
      key: "hold.minutes",
      value: "15",
      description: "Mô tả tiếng Việt từ backend",
      updatedAt: "2030-10-02T00:00:00Z",
    },
    {
      key: "rental.slot_minutes",
      value: "60",
      description: "Khung 30 hoặc 60 phút cũ",
      updatedAt: "2030-10-02T00:00:00Z",
    },
  ];
  let writes = 0;
  await page.route("**/api/system-settings", (route) =>
    route.fulfill({ json: rows }),
  );
  await page.route("**/api/system-settings/hold.minutes", (route) => {
    writes++;
    expect(route.request().method()).toBe("PUT");
    expect(route.request().postDataJSON()).toEqual({ value: "20" });
    rows[0].value = "20";
    return route.fulfill({ json: rows[0] });
  });
  await page.goto("/manager/settings");
  await expect(
    page.getByText(en.settingFields.holdMinutes.hint, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(rows[0].description, { exact: true }),
  ).toHaveCount(0);
  const fixed = page.getByLabel(en.settingFields.slotMinutes.label, {
    exact: true,
  });
  await expect(fixed).toHaveValue("60");
  await expect(fixed).toHaveAttribute("readonly", "");
  await page
    .getByLabel(en.settingFields.holdMinutes.label, { exact: true })
    .fill("20");
  await page.getByTitle("Switch to Vietnamese").click();
  await expect(
    page.getByLabel(vi.settingFields.holdMinutes.label, { exact: true }),
  ).toHaveValue("20");
  await expect(
    page.getByText(vi.settingFields.holdMinutes.hint, { exact: true }),
  ).toBeVisible();
  expect(writes).toBe(0);
  await page
    .getByRole("row")
    .filter({
      has: page.getByLabel(vi.settingFields.holdMinutes.label, { exact: true }),
    })
    .getByRole("button", { name: vi.operations.save, exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(vi.operations.saved);
  await page.getByTitle("Chuyển sang tiếng Anh").click();
  await expect(page.getByRole("status")).toHaveText(en.operations.saved);
  expect(writes).toBe(1);
});

const memberId = "11111111-1111-4111-8111-111111111111";
const otherMemberId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const enrollmentId = "44444444-4444-4444-8444-444444444444";
const rentalId = "55555555-5555-4555-8555-555555555555";
const itemId = "66666666-6666-4666-8666-666666666666";
const sport = {
  sportId: 1,
  name: "Badminton",
  code: "course",
  services: [
    {
      serviceType: "GROUP_COURSE",
      isEnabled: true,
      defaultSessionMinutes: 90,
      defaultMaxCapacity: 12,
    },
  ],
  defaultSessionMinutes: 90,
  defaultMaxCapacity: 12,
  isActive: true,
  sortOrder: 0,
};

for (const language of ["en", "vi"] as const)
  test(`Membership review preserves selection and pending creation when switching from ${language}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: language === "en" ? 1440 : 390,
      height: 1000,
    });
    await session(page, "RECEPTIONIST", language);
    const members = [
      {
        userId: memberId,
        fullName: "Alice",
        email: "alice@example.com",
        status: "ACTIVE",
      },
      {
        userId: otherMemberId,
        fullName: "Bob",
        email: "bob@example.com",
        status: "ACTIVE",
      },
    ];
    const plans = [
      {
        packageId: 1,
        name: "Gym tháng",
        price: 600000,
        durationDays: 30,
        isActive: true,
      },
      {
        packageId: 2,
        name: "Membership 90 ngày",
        price: 1800000,
        durationDays: 90,
        isActive: true,
      },
    ];
    await page.route("**/api/users?**", (r) =>
      r.fulfill({ json: { items: members, totalCount: 2 } }),
    );
    await page.route("**/api/membership-packages", (r) =>
      r.fulfill({ json: plans }),
    );
    await page.route("**/api/members/*/packages", (r) =>
      r.fulfill({ json: [] }),
    );
    await page.route("**/api/members/*/points", (r) =>
      r.fulfill({
        json: { availablePoints: 300, heldPoints: 0, vndPerPoint: 1000 },
      }),
    );
    const checkout = {
      invoiceId: itemId,
      kind: "MEMBERSHIP",
      state: "ACTIVE",
      invoiceStatus: "ISSUED",
      totalAmount: 1800000,
      cashAmount: 1800000,
      pointsApplied: 0,
      revision: 1,
      beneficiaryUserId: otherMemberId,
      fulfillmentOutcome: "NONE",
      reconciliationRequired: false,
      expiresAtUtc: new Date(Date.now() + 600000).toISOString(),
      serverNowUtc: new Date().toISOString(),
    };
    await page.route(`**/api/checkouts/${itemId}`, (r) =>
      r.fulfill({ json: checkout }),
    );
    await page.route(`**/api/invoices/${itemId}`, (r) =>
      r.fulfill({
        json: {
          summary: { memberName: "Bob", memberEmail: "bob@example.com" },
          items: [
            { itemId, description: plans[1].name, lineAmount: plans[1].price },
          ],
        },
      }),
    );
    await page.route(
      `**/api/invoices/${itemId}/point-confirmations/current`,
      (r) => r.fulfill({ body: "null", contentType: "application/json" }),
    );
    const creation = deferred();
    let posts = 0;
    await page.route("**/api/checkouts/membership", async (r) => {
      posts++;
      expect(r.request().postDataJSON()).toEqual({
        packageId: 2,
        targetMemberId: otherMemberId,
        allowStacking: false,
      });
      expect(r.request().headers()["idempotency-key"]).toBeTruthy();
      await creation.promise;
      await r.fulfill({ status: 201, json: checkout });
    });
    const labels = {
      en: {
        select: "Select plan",
        title: "Review membership purchase",
        create: "Create invoice",
        duration: "Membership duration",
        days: "days",
        change: "Change",
      },
      vi: {
        select: "Chọn gói",
        title: "Xác nhận mua gói Gym",
        create: "Tạo hóa đơn",
        duration: "Thời hạn gói",
        days: "ngày",
        change: "Thay đổi",
      },
    };
    const otherLanguage = language === "en" ? "vi" : "en";
    const review = () =>
      page.locator("section.card").filter({
        has: page.getByRole("heading", {
          name: /Review membership purchase|Xác nhận mua gói Gym/,
        }),
      });
    const switchLanguage = () =>
      page
        .getByTitle(
          /Switch to Vietnamese|Switch to English|Chuyển sang Tiếng Việt|Chuyển sang Tiếng Anh/,
        )
        .filter({ visible: true })
        .click();
    await page.goto("/receptionist/sell-plans");
    await page.getByPlaceholder(/Enter name|Nhập tên/).fill("Alice");
    await page.getByRole("button", { name: /Alice/ }).click();
    await expect(
      page.getByRole("button", { name: labels[language].select, exact: true }),
    ).toHaveCount(2);
    await page
      .getByRole("button", { name: labels[language].select, exact: true })
      .first()
      .click();
    await expect(review().getByText("Alice", { exact: true })).toBeVisible();
    await expect(
      review().getByText("alice@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      review().getByText(plans[0].name, { exact: true }),
    ).toBeVisible();
    await expect(
      review().getByText(`30 ${labels[language].days}`, { exact: true }),
    ).toBeVisible();
    expect(posts).toBe(0);
    await switchLanguage();
    await expect(review().getByRole("heading")).toHaveText(
      labels[otherLanguage].title,
    );
    await expect(
      review().getByText(labels[otherLanguage].duration, { exact: true }),
    ).toBeVisible();
    await expect(
      review().getByText(`30 ${labels[otherLanguage].days}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("button", {
          name: labels[otherLanguage].select,
          exact: true,
        })
        .first(),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: labels[otherLanguage].select, exact: true })
      .last()
      .click();
    await expect(
      review().getByText(plans[1].name, { exact: true }),
    ).toBeVisible();
    await expect(
      review().getByText(plans[0].name, { exact: true }),
    ).toHaveCount(0);
    await switchLanguage();
    await expect(
      review().getByText(`90 ${labels[language].days}`, { exact: true }),
    ).toBeVisible();
    expect(posts).toBe(0);
    await page
      .getByRole("button", { name: labels[language].change, exact: true })
      .click();
    await expect(review()).toHaveCount(0);
    await page.getByPlaceholder(/Enter name|Nhập tên/).fill("Bob");
    await page.getByRole("button", { name: /Bob/ }).click();
    await expect(review()).toHaveCount(0);
    await page
      .getByRole("button", { name: labels[language].select, exact: true })
      .last()
      .click();
    await expect(
      review().getByText("bob@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      review().getByText("alice@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(review().getByText(/1[,.]800[,.]000/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Checkout|Thanh toán)$/ }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page
      .locator(".table-wrap")
      .first()
      .evaluate((table) => {
        table.scrollLeft = 0;
      });
    expect(
      await page
        .getByRole("cell", { name: plans[0].name, exact: true })
        .evaluate((cell) => cell.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(180);
    await page.screenshot({
      path: `test-results/membership-review-${language}.png`,
      fullPage: true,
    });
    await review()
      .getByRole("button", { name: labels[language].create, exact: true })
      .click();
    await expect.poll(() => posts).toBe(1);
    await expect(
      review().getByRole("button", {
        name: labels[language].create,
        exact: true,
      }),
    ).toBeDisabled();
    await switchLanguage();
    await expect(
      review().getByRole("button", {
        name: labels[otherLanguage].create,
        exact: true,
      }),
    ).toBeDisabled();
    creation.resolve();
    await expect(page.getByText(itemId, { exact: false })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: labels[otherLanguage].create,
        exact: true,
      }),
    ).toHaveCount(0);
    expect(posts).toBe(1);
  });

for (const language of ["en", "vi"] as const)
  test(`Membership duplicate error follows ${language} and language switches without another checkout`, async ({
    page,
  }) => {
    await session(page, "RECEPTIONIST", language);
    await page.route("**/api/users?**", (r) =>
      r.fulfill({
        json: {
          items: [
            {
              userId: memberId,
              fullName: "Alice",
              email: "alice@example.com",
              status: "ACTIVE",
            },
          ],
          totalCount: 1,
        },
      }),
    );
    await page.route("**/api/membership-packages", (r) =>
      r.fulfill({
        json: [
          {
            packageId: 1,
            name: "Gym month",
            price: 600000,
            durationDays: 30,
            isActive: true,
          },
        ],
      }),
    );
    await page.route("**/api/members/*/packages", (r) =>
      r.fulfill({ json: [] }),
    );
    await page.route("**/api/members/*/points", (r) =>
      r.fulfill({
        json: { availablePoints: 300, heldPoints: 0, vndPerPoint: 1000 },
      }),
    );
    const messages = {
      en: "This member already has a package of the same type that is active or awaiting payment.",
      vi: "Hội viên đã có gói cùng loại đang hoạt động hoặc chờ thanh toán.",
    };
    let posts = 0;
    let rejectDuplicate = true;
    await page.route("**/api/checkouts/membership", (r) => {
      posts++;
      expect(r.request().postDataJSON()).toEqual({
        packageId: 1,
        targetMemberId: memberId,
        allowStacking: false,
      });
      return r.fulfill({
        status: 409,
        json: {
          error: rejectDuplicate
            ? "duplicate_active_package"
            : "unmapped_conflict",
          message: rejectDuplicate ? messages.vi : "Additional server detail",
        },
      });
    });
    await page.goto("/receptionist/sell-plans");
    await page.getByPlaceholder(/Enter name|Nhập tên/).fill("Alice");
    await page.getByRole("button", { name: /Alice/ }).click();
    await page
      .getByRole("button", { name: /^(Select plan|Chọn gói)$/ })
      .click();
    const review = page.locator("section.card").filter({
      has: page.getByRole("heading", {
        name: /Review membership purchase|Xác nhận mua gói Gym/,
      }),
    });
    await review
      .getByRole("button", { name: /^(Create invoice|Tạo hóa đơn)$/ })
      .click();
    await expect(review.getByRole("alert")).toHaveText(messages[language]);
    expect(posts).toBe(1);
    const switchLanguage = () =>
      page
        .getByTitle(
          /Switch to Vietnamese|Switch to English|Chuyển sang Tiếng Việt|Chuyển sang Tiếng Anh/,
        )
        .click();
    await switchLanguage();
    await expect(review.getByRole("alert")).toHaveText(
      messages[language === "en" ? "vi" : "en"],
    );
    await expect(
      review.getByText("alice@example.com", { exact: true }),
    ).toBeVisible();
    await expect(review.getByText("Gym month", { exact: true })).toBeVisible();
    await switchLanguage();
    await expect(review.getByRole("alert")).toHaveText(messages[language]);
    expect(posts).toBe(1);
    await page.screenshot({
      path: `test-results/sell-plans-error-${language}.png`,
      fullPage: true,
    });
    rejectDuplicate = false;
    await review
      .getByRole("button", { name: /^(Create invoice|Tạo hóa đơn)$/ })
      .click();
    await expect(review.getByRole("alert")).toHaveText(
      "Additional server detail",
    );
    expect(posts).toBe(2);
  });

for (const language of ["en", "vi"] as const)
  test(`Gym duplicate check-in reports the open visit in ${language} and allows re-entry after checkout`, async ({
    page,
  }) => {
    await session(page, "RECEPTIONIST", language);
    const visits: {
      checkInId: string;
      checkInTime: string;
      checkOutTime: string | null;
    }[] = [];
    let posts = 0;
    await page.route("**/api/users?**", (r) =>
      r.fulfill({
        json: {
          items: [
            {
              userId: memberId,
              fullName: "Alice",
              email: "alice@example.com",
              status: "ACTIVE",
            },
          ],
          totalCount: 1,
        },
      }),
    );
    await page.route(`**/api/members/${memberId}/packages`, (r) =>
      r.fulfill({
        json: [
          {
            memberPackageId: itemId,
            packageName: "Gym pass",
            status: "ACTIVE",
            isUsable: true,
            endDate: "2030-12-31",
          },
        ],
      }),
    );
    await page.route(`**/api/members/${memberId}/gym-checkins?**`, (r) =>
      r.fulfill({ json: { items: visits, totalCount: visits.length } }),
    );
    await page.route("**/api/gym-checkins", (r) => {
      expect(r.request().postDataJSON()).toEqual({ targetMemberId: memberId });
      posts++;
      if (visits.some((v) => !v.checkOutTime))
        return r.fulfill({
          status: 409,
          json: {
            error: "gym_already_checked_in",
            message:
              "Member đã được ghi nhận vào Gym, vui lòng ghi nhận ra trước.",
          },
        });
      const visit = {
        checkInId: posts === 1 ? sessionId : rentalId,
        checkInTime: new Date().toISOString(),
        checkOutTime: null,
      };
      visits.unshift(visit);
      return r.fulfill({ status: 201, json: visit });
    });
    await page.route(`**/api/gym-checkins/${sessionId}/checkout`, (r) => {
      visits[0].checkOutTime = new Date().toISOString();
      return r.fulfill({ json: visits[0] });
    });
    await page.goto("/receptionist/gym-checkin");
    await page.getByPlaceholder(/Enter name|Nhập tên/).fill("Alice");
    await page.getByRole("button", { name: /Alice/ }).click();
    const checkIn = page.getByRole("button", {
      name: language === "en" ? "Check in" : "Ghi nhận vào",
      exact: true,
    });
    await checkIn.click();
    const checkOut = page.getByRole("button", {
      name: language === "en" ? "Check out" : "Ghi nhận ra",
      exact: true,
    });
    await expect(checkOut).toHaveCount(1);
    await checkIn.click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      language === "en"
        ? "This member is already checked in to the gym. Check them out before checking in again."
        : "Member đã được ghi nhận vào Gym, vui lòng ghi nhận ra trước.",
    );
    expect(visits).toHaveLength(1);
    await expect(checkOut).toHaveCount(1);
    await page.screenshot({
      path: `test-results/gym-duplicate-${language}.png`,
      fullPage: true,
    });
    await checkOut.click();
    await expect(checkOut).toHaveCount(0);
    await checkIn.click();
    await expect(checkOut).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(visits).toHaveLength(2);
    expect(posts).toBe(3);
  });

test("notice validation rejection keeps the content editable", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  await page.route("**/api/users?**", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            userId: memberId,
            fullName: "Coach A",
            email: "coach@example.com",
            status: "ACTIVE",
          },
        ],
        totalCount: 1,
      },
    }),
  );
  await page.route("**/api/manager/court-schedule?**", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/manager/notices", (r) =>
    r.fulfill({
      status: 400,
      json: {
        message: "Recipient is inactive",
        code: "manual_notice_recipient_invalid",
      },
    }),
  );
  await page.goto("/manager/notices");
  await page.getByRole("checkbox", { name: "Coach A" }).check();
  await page.getByLabel("Subject", { exact: true }).fill("Schedule update");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Please read the schedule.");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Send notice", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Recipient is inactive",
  );
  await expect(page.getByLabel("Subject", { exact: true })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: "Coach A" })).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Check and retry the same request" }),
  ).toHaveCount(0);
  await expect(page).not.toHaveURL(/noticeKey=/);
});

for (const recovery of ["retry", "reload"] as const)
  test(`notice ${recovery} recovers an uncertain committed request without a second POST`, async ({
    page,
  }) => {
    await session(page, "CENTER_MANAGER");
    await page.route("**/api/users?**", (r) =>
      r.fulfill({
        json: {
          items: [
            {
              userId: memberId,
              fullName: "Coach A",
              email: "coach@example.com",
              status: "ACTIVE",
            },
          ],
          totalCount: 1,
        },
      }),
    );
    await page.route("**/api/manager/court-schedule?**", (r) =>
      r.fulfill({ json: [] }),
    );
    let sends = 0;
    let key = "";
    await page.route("**/api/manager/notices", async (r) => {
      sends++;
      key = r.request().headers()["idempotency-key"];
      expect(key).toMatch(/^[0-9a-f-]{36}$/i);
      await r.abort("failed");
    });
    await page.route("**/api/manager/notices/by-key/*", (r) => {
      expect(new URL(r.request().url()).pathname).toContain(key);
      return r.fulfill({ json: { noticeId: rentalId } });
    });
    await page.goto("/manager/notices");
    await page.getByRole("checkbox", { name: "Coach A" }).check();
    await page.getByLabel("Subject", { exact: true }).fill("Schedule update");
    await page
      .getByLabel("Message", { exact: true })
      .fill("Please read the new schedule.");
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page
      .getByRole("button", { name: "Send notice", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Check and retry the same request" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/noticeKey=/);
    if (recovery === "retry")
      await page
        .getByRole("button", { name: "Check and retry the same request" })
        .click();
    else await page.reload();
    await expect(page.getByText(rentalId, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Failed", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Compose another notice", exact: true }),
    ).toBeVisible();
    expect(sends).toBe(1);
  });

test("historical rental detail loads by owner ID with its snapshot and refund, without a date filter", async ({
  page,
}) => {
  await session(page, "MEMBER");
  let rangeCalls = 0;
  await page.route("**/api/court-rentals/mine?**", (r) => {
    rangeCalls++;
    return r.fulfill({ json: [] });
  });
  await page.route(`**/api/court-rentals/${rentalId}`, (r) =>
    r.fulfill({
      json: {
        rental: {
          ...rental,
          status: "CANCELLED",
          invoiceId: enrollmentId,
          startAtUtc: "2020-10-03T02:00:00Z",
          endAtUtc: "2020-10-03T03:00:00Z",
        },
        roomName: "Historical Court",
        sportName: "Badminton",
        blocks: [
          {
            startUtc: "2020-10-03T02:00:00Z",
            endUtc: "2020-10-03T03:00:00Z",
            price: 100000,
          },
        ],
        cancelReason: "Court repair",
        cancelledAtUtc: "2020-10-02T02:00:00Z",
        refundPoints: 100,
      },
    }),
  );
  await page.goto(`/member/rentals/${rentalId}`);
  await expect(
    page.getByRole("heading", { name: "Historical Court · Badminton" }),
  ).toBeVisible();
  await expect(
    page.getByText("Refund points: 100", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Reason: Court repair", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Invoices", exact: true }).last(),
  ).toHaveAttribute("href", `/member/invoices/${enrollmentId}`);
  await expect(page.getByLabel("From date", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /attendance|cancel rental/i }),
  ).toHaveCount(0);
  expect(rangeCalls).toBe(0);
});

test("course cancellation shows the server refund and discards a preview rejected as stale", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  await page.route("**/api/manager/classes/1", (r) =>
    r.fulfill({
      json: {
        classId: 1,
        code: "C-1",
        name: "Course A",
        sportId: 1,
        status: "PUBLISHED",
        numSessions: 3,
        price: 100000,
        costAmount: 0,
        confirmedCount: 1,
        reservedCount: 1,
        activeHoldCount: 0,
        thresholdStatus: "MET",
        version: 1,
        scheduleRules: [],
      },
    }),
  );
  await page.route("**/api/classes/1/sessions", (r) => r.fulfill({ json: [] }));
  for (const kind of ["holds", "enrollments", "threshold-responses"])
    await page.route(`**/api/manager/classes/1/${kind}?**`, (r) =>
      r.fulfill({ json: { items: [], totalCount: 0 } }),
    );
  await page.route("**/api/manager/classes/1/cancellation-preview", (r) =>
    r.fulfill({
      json: {
        canCancel: true,
        previewToken: "server-quote",
        totalSessions: 3,
        sessionsNotProvided: 2,
        confirmedCount: 1,
        activeHoldCount: 0,
        refundPoints: 66,
      },
    }),
  );
  let cancellations = 0;
  await page.route("**/api/manager/classes/1/cancel", (r) => {
    cancellations++;
    expect(r.request().postDataJSON()).toEqual({
      reason: "Center closure",
      previewToken: "server-quote",
    });
    return r.fulfill({
      status: 409,
      json: {
        error: "class_cancellation_changed",
        message: "Refund changed; preview again",
      },
    });
  });
  await page.goto("/manager/classes/1");
  const panel = page.locator("section.card").filter({
    has: page.getByRole("heading", { name: "Cancel", exact: true }),
  });
  await panel.getByLabel("Reason", { exact: true }).fill("Center closure");
  await panel
    .getByRole("button", { name: "Preview course cancellation" })
    .click();
  await expect(
    panel.getByText("Estimated total refund points: 66", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText(
    "Refund changed; preview again",
  );
  await expect(
    panel.getByRole("button", { name: "Confirm", exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByLabel("Reason", { exact: true })).toHaveValue(
    "Center closure",
  );
  expect(cancellations).toBe(1);
});
const room = {
  roomId: 1,
  name: "Court A",
  roomTypeId: 1,
  capacity: 12,
  isActive: true,
};
const rental = {
  courtRentalId: rentalId,
  sportId: 1,
  roomId: 1,
  startAtUtc: "2030-10-03T02:00:00Z",
  endAtUtc: "2030-10-03T03:00:00Z",
  totalPrice: 100000,
  status: "CONFIRMED",
  invoiceItemId: itemId,
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function session(page: Page, role: string, language: "en" | "vi" = "en") {
  await page.addInitScript((lang) => {
    localStorage.setItem("sporthub.accessToken", "fixture-token");
    localStorage.setItem("sporthub_lang", lang);
  }, language);
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/users/me")
      return route.fulfill({
        json: {
          userId: memberId,
          email: "staff@example.com",
          fullName: "Current user",
          role,
          sportIds: [1],
          approvalStatus: "APPROVED",
        },
      });
    if (p === "/api/sports" || p === "/api/manager/sports")
      return route.fulfill({ json: [sport] });
    if (p === "/api/rooms") return route.fulfill({ json: [room] });
    if (p === "/api/court-rentals/policy")
      return route.fulfill({
        json: {
          slotMinutes: 60,
          maxHours: 4,
          advanceDays: 30,
          cancelFreeHours: 24,
          serverNowUtc: "2030-10-02T00:00:00Z",
        },
      });
    if (p.startsWith("/api/manager/notices/") && !p.includes("by-key"))
      return route.fulfill({
        json: {
          noticeId: rentalId,
          delivery: {
            total: 2,
            pending: 1,
            sending: 0,
            sent: 0,
            failed: 1,
            read: 0,
          },
        },
      });
    if (p === "/api/room-types")
      return route.fulfill({
        json: [{ roomTypeId: 1, name: "Court", sportIds: [1] }],
      });
    if (p.includes("notifications")) return route.fulfill({ json: [] });
    if (p === "/api/wallet/me")
      return route.fulfill({
        json: {
          ownerUserId: memberId,
          availablePoints: 300,
          heldPoints: 0,
          vndPerPoint: 1000,
        },
      });
    return route.fulfill({
      status: 404,
      json: { error: "unexpected_fixture_request", message: p },
    });
  });
}
test("Vietnam controls and course preview use sport duration across calendar boundaries", () => {
  expect(vietnamUtc("2030-10-03T00:30")).toBe("2030-10-02T17:30:00.000Z");
  expect(dayRange("2030-10-03", "2030-10-03")).toEqual({
    fromUtc: "2030-10-02T17:00:00.000Z",
    toUtc: "2030-10-03T17:00:00.000Z",
  });
  const course = {
    startDate: "2030-10-03",
    numSessions: 3,
    scheduleRules: [
      { dayOfWeek: 4, startTimeLocal: "23:00" },
      { dayOfWeek: 0, startTimeLocal: "10:00" },
    ],
  } as ManagerCourseDto;
  const preview = previewSessions(course, 90);
  expect(preview).toHaveLength(3);
  expect(preview[0]).toEqual({
    startAtUtc: "2030-10-03T16:00:00.000Z",
    endAtUtc: "2030-10-03T17:30:00.000Z",
  });
  expect(previewSessions({ ...course, startDate: "2030-10-04" }, 90)).toEqual(
    [],
  );
});

test("attendance rejects one row without showing a successful present status", async ({
  page,
}) => {
  await session(page, "RECEPTIONIST");
  await page.clock.setFixedTime(new Date("2030-10-03T02:30:00Z"));
  await page.route("**/api/manager/court-schedule?**", (r) =>
    r.fulfill({
      json: [
        {
          sourceType: "CLASS_SESSION",
          sourceId: sessionId,
          classId: 1,
          title: "Course A",
          startAtUtc: "2030-10-03T02:00:00Z",
        },
      ],
    }),
  );
  await page.route(`**/api/class-sessions/${sessionId}/roster`, (r) =>
    r.fulfill({
      json: {
        session: { sessionId },
        attendanceOpensAtUtc: "2030-10-03T02:00:00Z",
        attendanceClosesAtUtc: "2030-10-04T03:30:00Z",
        entries: [
          {
            enrollmentId,
            memberId,
            memberName: "Student A",
            enrollmentStatus: "CONFIRMED",
            attendanceStatus: null,
          },
        ],
      },
    }),
  );
  let writes = 0;
  await page.route(
    `**/api/class-sessions/${sessionId}/attendance/${enrollmentId}`,
    (r) => {
      writes++;
      expect(r.request().method()).toBe("PUT");
      expect(r.request().postDataJSON()).toEqual({ status: "PRESENT" });
      return r.fulfill({
        status: 409,
        json: {
          error: "attendance_closed",
          message: "Attendance window closed",
        },
      });
    },
  );
  await page.goto("/receptionist/attendance");
  await page.getByLabel("Course registration").selectOption("1");
  await page.getByLabel("Sessions", { exact: true }).selectOption(sessionId);
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toHaveText(
    "Attendance window closed",
  );
  expect(writes).toBe(1);
  await expect(
    page.locator("tbody tr").filter({ hasText: "Student A" }).locator(".chip"),
  ).toHaveCount(0);
});

test("switching members resets wallet data and fetches the selected member only", async ({
  page,
}) => {
  await session(page, "RECEPTIONIST");
  await page.route("**/api/users?**", (r) => {
    const keyword = new URL(r.request().url()).searchParams.get("keyword");
    const id = keyword === "Alice" ? memberId : otherMemberId;
    return r.fulfill({
      json: {
        items: [
          {
            userId: id,
            fullName: keyword,
            email: `${keyword}@example.com`,
            status: "ACTIVE",
          },
        ],
        totalCount: 1,
      },
    });
  });
  const lookedUp: string[] = [];
  await page.route("**/api/members/*/points**", async (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p.endsWith("ledger")) return r.fulfill({ json: [] });
    lookedUp.push(p);
    return r.fulfill({
      json: {
        availablePoints: p.includes(otherMemberId) ? 20 : 987,
        heldPoints: 0,
      },
    });
  });
  await page.route(new RegExp("/api/users/[0-9a-f-]{36}$"), (r) => {
    const id = new URL(r.request().url()).pathname.split("/").pop()!;
    return r.fulfill({
      json: {
        userId: id,
        fullName: id === memberId ? "Alice" : "Bob",
        email: `${id}@example.com`,
        status: "ACTIVE",
        role: "MEMBER",
      },
    });
  });
  await page.goto("/receptionist");
  await page.getByPlaceholder(/Enter name/).fill("Alice");
  await page.getByRole("button", { name: /Alice/ }).click();
  await page.getByRole("link", { name: "Open profile" }).click();
  await page.getByRole("tab", { name: "Wallet" }).click();
  await expect(page.getByText("987", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change member" }).click();
  await expect(page.getByText("987", { exact: true })).toHaveCount(0);
  await page.getByLabel("Find a member").fill("Bob");
  await page.getByRole("row", { name: /Bob/ }).getByRole("link").click();
  await page.getByRole("tab", { name: "Wallet" }).click();
  await expect(page.getByText("20", { exact: true })).toBeVisible();
  expect(lookedUp).toEqual([
    `/api/members/${memberId}/points`,
    `/api/members/${otherMemberId}/points`,
  ]);
  await expect(page.getByRole("button", { name: /adjust/i })).toHaveCount(0);
});

test("manager creates an API-backed draft and preserves the form on conflict", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  await page.route("**/api/availability/rooms?**", (r) =>
    r.fulfill({ json: [{ roomId: 1, isAvailable: true }] }),
  );
  await page.route("**/api/availability/coaches?**", (r) =>
    r.fulfill({ json: [{ coachId: memberId, isAvailable: true }] }),
  );
  await page.route("**/api/manager/classes?**", (r) =>
    r.fulfill({ json: { items: [], totalCount: 0, page: 1, pageSize: 20 } }),
  );
  await page.route("**/api/coaches?**", (r) =>
    r.fulfill({ json: [{ userId: memberId, fullName: "Coach A" }] }),
  );
  let body: Record<string, unknown> | undefined;
  await page.route("**/api/manager/classes", (r) => {
    body = r.request().postDataJSON();
    return r.fulfill({
      status: 409,
      json: { error: "class_code_taken", message: "Code already exists" },
    });
  });
  await page.goto("/manager/classes");
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("COURSE-2");
  await page.getByLabel("Name", { exact: true }).fill("Badminton course");
  await page.getByLabel("Sport", { exact: true }).first().selectOption("1");
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await page.getByLabel("Room", { exact: true }).selectOption("1");
  await page.getByLabel("Coach", { exact: true }).selectOption(memberId);
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.operations.next, exact: true })
    .click();
  await page
    .getByRole("button", { name: en.managerOperations.saveDraft, exact: true })
    .click();
  await expect(page.locator("main [role=alert]")).toHaveText(
    "Code already exists",
  );
  for (let step = 0; step < 3; step++)
    await page
      .getByRole("button", { name: en.operations.previous, exact: true })
      .click();
  await expect(page.getByLabel("Code", { exact: true })).toHaveValue(
    "COURSE-2",
  );
  expect(body?.sportId).toBe(1);
  expect(body?.defaultRoomId).toBe(1);
  expect(body).not.toHaveProperty("discipline");
});

test("incident preview blocks resolution and invalidates when the form changes", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  let resolves = 0;
  await page.route("**/api/manager/incidents/preview", (r) =>
    r.fulfill({
      json: {
        scope: "ROOM",
        canResolve: false,
        blockReason: "Move the class first",
        impacts: [
          {
            sourceType: "CLASS_SESSION",
            sourceId: sessionId,
            startAtUtc: "2030-10-03T02:00:00Z",
            endAtUtc: "2030-10-03T03:00:00Z",
            resolutionOptions: [],
          },
        ],
      },
    }),
  );
  await page.route("**/api/manager/incidents/resolve", (r) => {
    resolves++;
    return r.fulfill({ json: { incidentId: "incident" } });
  });
  await page.goto("/manager/incidents");
  await page.getByLabel("Room", { exact: true }).selectOption("1");
  await page.getByLabel("Start (Vietnam time)").fill("2030-10-03T09:00");
  await page.getByLabel("End (Vietnam time)").fill("2030-10-03T10:00");
  await page.getByLabel("Reason").fill("Court maintenance");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("Move the class first")).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.managerOperations.finalResolve }),
  ).toHaveCount(0);
  await page.getByLabel("Reason").fill("Different scope reason");
  await expect(
    page.getByRole("button", { name: en.managerOperations.recheck }),
  ).toHaveCount(0);
  expect(resolves).toBe(0);
});

test("any member can open court booking without approval, and rentals have no attendance controls", async ({
  page,
}) => {
  await session(page, "MEMBER");
  await page.route("**/api/court-rentals/mine?**", (r) =>
    r.fulfill({ json: [rental] }),
  );
  await page.goto("/member/courts/book");
  // BR-140: không còn bước duyệt hay hồ sơ; Member vào là đặt được.
  await expect(
    page.getByRole("button", { name: "Check availability and price" }),
  ).toBeVisible();
  await expect(page.getByLabel("Expected attendees")).toHaveCount(0);
  await page.goto("/member/rentals");
  await expect(
    page.getByRole("button", { name: "Cancel rental" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /attendance|present|absent/i }),
  ).toHaveCount(0);
});

test("rental cancellation uses the server refund quote and does not create a refund request", async ({
  page,
}) => {
  await session(page, "MEMBER");
  await page.route("**/api/court-rentals/mine?**", (r) =>
    r.fulfill({ json: [rental] }),
  );
  await page.route(`**/api/refunds/quote/${itemId}`, (r) =>
    r.fulfill({ json: { systemCalculatedPoints: 0 } }),
  );
  let cancelled = 0;
  await page.route(`**/api/court-rentals/${rentalId}/cancel`, (r) => {
    cancelled++;
    return r.fulfill({ status: 204 });
  });
  await page.goto("/member/rentals");
  await page.getByRole("button", { name: "Cancel rental" }).click();
  await expect(page.getByRole("dialog")).toContainText("Refund points: 0");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(cancelled).toBe(1);
});

test("system administrator direct catalog URL never mounts manager data requests", async ({
  page,
}) => {
  await session(page, "SYSTEM_ADMINISTRATOR");
  let managerCalls = 0;
  await page.route("**/api/manager/sports", (r) => {
    managerCalls++;
    return r.fulfill({ json: [] });
  });
  await page.route("**/api/users/admin?**", (r) =>
    r.fulfill({ json: { items: [], totalCount: 0 } }),
  );
  await page.goto("/manager/sports");
  await expect(page).toHaveURL(/\/admin$/);
  expect(managerCalls).toBe(0);
});

test("a rejected court-rental checkout shows the server error and keeps no booking action", async ({
  page,
}) => {
  await session(page, "MEMBER");
  let checkouts = 0;
  await page.route("**/api/court-rentals/availability?**", (r) =>
    r.fulfill({
      json: [
        {
          ...room,
          totalPrice: 100000,
          blocks: [
            {
              startUtc: rental.startAtUtc,
              endUtc: rental.endAtUtc,
              price: 100000,
            },
          ],
        },
      ],
    }),
  );
  await page.route("**/api/checkouts/court-rental", (r) => {
    checkouts++;
    expect(r.request().postDataJSON()).toMatchObject({
      roomId: 1,
      sportId: 1,
    });
    return r.fulfill({
      status: 403,
      json: { error: "member_inactive", message: "Member account inactive" },
    });
  });
  await page.goto("/member/courts/book");
  await page.getByLabel("Sport", { exact: true }).selectOption("1");
  await page.getByLabel("Date", { exact: true }).fill("2030-10-03");
  await page
    .getByRole("button", { name: "Check availability and price" })
    .click();
  await page.getByLabel("Room", { exact: true }).selectOption("1");
  await expect(
    page.getByRole("heading", { name: "Price breakdown" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect(page.getByText("Member account inactive")).toBeVisible();
  expect(checkouts).toBe(1);
});

test("manual notice reviews explicit recipients and sends only once", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  await page.route("**/api/users?**", (r) =>
    r.fulfill({
      json: {
        items: [
          {
            userId: memberId,
            fullName: "Coach A",
            email: "coach@example.com",
            status: "ACTIVE",
          },
        ],
        totalCount: 1,
      },
    }),
  );
  await page.route("**/api/manager/court-schedule?**", (r) =>
    r.fulfill({ json: [] }),
  );
  let sends = 0;
  await page.route("**/api/manager/notices", async (r) => {
    sends++;
    expect(r.request().postDataJSON()).toEqual({
      subject: "Schedule update",
      message: "Please review the revised schedule.",
      recipientUserIds: [memberId],
      sendEmail: true,
      sendInApp: true,
    });
    await r.fulfill({ json: { noticeId: "notice-1" } });
  });
  await page.goto("/manager/notices");
  await page.getByRole("checkbox", { name: "Coach A" }).check();
  await page.getByLabel("Subject", { exact: true }).fill("Schedule update");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Please review the revised schedule.");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(
    page.getByText("Review the recipient list before sending."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Send notice", exact: true }).click();
  await expect(page.getByText("Notice queued.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send notice", exact: true }),
  ).toBeDisabled();
  expect(sends).toBe(1);
});

test("calendar has no page overflow at desktop and mobile sizes", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  await page.route("**/api/manager/court-schedule?**", (r) =>
    r.fulfill({
      json: [
        {
          sourceType: "COURT_RENTAL",
          sourceId: rentalId,
          title: "Rental",
          roomId: 1,
          startAtUtc: new Date().toISOString(),
          endAtUtc: new Date(Date.now() + 3600000).toISOString(),
          coachName: "Member renter",
          status: "CONFIRMED",
          participants: [],
        },
      ],
    }),
  );
  await page.goto("/manager/court-schedule");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(
      page.getByRole("heading", { name: "Court schedule", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `test-results/p2-court-schedule-${width}.png`,
      fullPage: true,
    });
  }
});

test("late incident preview cannot resolve after its reason changes", async ({
  page,
}) => {
  await session(page, "CENTER_MANAGER");
  const requested = deferred();
  const release = deferred();
  await page.route("**/api/manager/incidents/preview", async (route) => {
    requested.resolve();
    await release.promise;
    await route.fulfill({ json: { canResolve: true, impacts: [] } });
  });
  await page.goto("/manager/incidents");
  await page.getByLabel("Room", { exact: true }).selectOption("1");
  await page.getByLabel("Start (Vietnam time)").fill("2030-10-03T09:00");
  await page.getByLabel("End (Vietnam time)").fill("2030-10-03T10:00");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Original maintenance reason");
  const review = page.getByRole("button", { name: "Review", exact: true });
  await review.click();
  await requested.promise;
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Revised maintenance reason");
  release.resolve();
  await expect(review).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: en.managerOperations.finalResolve,
      exact: true,
    }),
  ).toHaveCount(0);
});

test("late court availability cannot offer checkout for an earlier date", async ({
  page,
}) => {
  await session(page, "MEMBER");
  const requested = deferred();
  const release = deferred();
  await page.route("**/api/court-rentals/availability?**", async (route) => {
    requested.resolve();
    await release.promise;
    await route.fulfill({
      json: [
        {
          ...room,
          totalPrice: 100000,
          blocks: [
            {
              startUtc: rental.startAtUtc,
              endUtc: rental.endAtUtc,
              price: 100000,
            },
          ],
        },
      ],
    });
  });
  await page.goto("/member/courts/book");
  await page.getByLabel("Sport", { exact: true }).selectOption("1");
  await page.getByLabel("Date", { exact: true }).fill("2030-10-03");
  const availability = page.getByRole("button", {
    name: "Check availability and price",
    exact: true,
  });
  await availability.click();
  await requested.promise;
  await page.getByLabel("Date", { exact: true }).fill("2030-10-04");
  release.resolve();
  await expect(availability).toBeEnabled();
  await expect(page.getByLabel("Room", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Checkout", exact: true }),
  ).toHaveCount(0);
});

test("staff invoice deep link must match the selected member before mounting payment", async ({
  page,
}) => {
  await session(page, "RECEPTIONIST");
  await page.route("**/api/users?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            userId: memberId,
            fullName: "Alice",
            email: "alice@example.com",
            status: "ACTIVE",
          },
        ],
        totalCount: 1,
      },
    }),
  );
  await page.route("**/api/invoices?**", (route) =>
    route.fulfill({ json: { items: [], totalCount: 0 } }),
  );
  const invoiceId = "77777777-7777-4777-8777-777777777777";
  await page.route(`**/api/users/${otherMemberId}`, (route) =>
    route.fulfill({
      json: {
        userId: otherMemberId,
        fullName: "Bob",
        email: "bob@example.com",
        role: "MEMBER",
        status: "ACTIVE",
      },
    }),
  );
  await page.route(`**/api/invoices/${invoiceId}`, (route) =>
    route.fulfill({
      json: {
        summary: { invoiceId, memberId: otherMemberId, status: "ISSUED" },
        items: [],
        adjustments: [],
      },
    }),
  );
  let checkoutReads = 0;
  await page.route(`**/api/checkouts/${invoiceId}`, (route) => {
    checkoutReads++;
    return route.fulfill({
      json: {
        invoiceId,
        kind: "MEMBERSHIP",
        state: "ACTIVE",
        invoiceStatus: "ISSUED",
        totalAmount: 600000,
        cashAmount: 600000,
        pointsApplied: 0,
        revision: 1,
        beneficiaryUserId: otherMemberId,
        fulfillmentOutcome: "NONE",
        reconciliationRequired: false,
        expiresAtUtc: new Date(Date.now() + 600000).toISOString(),
        serverNowUtc: new Date().toISOString(),
      },
    });
  });
  await page.route(
    `**/api/invoices/${invoiceId}/point-confirmations/current`,
    (route) => route.fulfill({ body: "null", contentType: "application/json" }),
  );
  await page.route(`**/api/members/${otherMemberId}/points`, (route) =>
    route.fulfill({
      json: { availablePoints: 0, heldPoints: 0, vndPerPoint: 1000 },
    }),
  );
  await page.goto(`/receptionist/invoices?invoiceId=${invoiceId}`);
  await expect(
    page.getByRole("button", { name: "Change", exact: true }),
  ).toBeVisible();
  await expect.poll(() => checkoutReads).toBe(1);
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByPlaceholder(/Enter name/).fill("Alice");
  await page.getByRole("button", { name: /Alice/ }).click();
  await expect(page.locator("main [role=alert]")).toHaveText(
    "This invoice belongs to another member. Select that member to continue.",
  );
  await expect(
    page.getByRole("button", { name: "Confirm payment", exact: true }),
  ).toHaveCount(0);
  expect(checkoutReads).toBe(1);
});

async function invoiceLinkFixture(page: Page) {
  const invoiceId = "88888888-8888-4888-8888-888888888888";
  const owner = {
    userId: otherMemberId,
    fullName: "Bob",
    email: "bob@example.com",
    role: "MEMBER",
    status: "ACTIVE",
  };
  const detail = {
    summary: {
      invoiceId,
      invoiceNumber: "INV-LINK-001",
      checkoutExpiresAtUtc: new Date(Date.now() + 600000).toISOString(),
      memberId: owner.userId,
      memberName: owner.fullName,
      memberEmail: owner.email,
      status: "ISSUED",
      totalAmount: 600000,
      outstanding: 600000,
      fulfillmentOutcome: "NONE",
    },
    items: [
      { itemId, description: "Linked Gym membership", lineAmount: 600000 },
    ],
    adjustments: [],
  };
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && request.method() !== "GET")
      writes.push(request.url());
  });
  await page.route(`**/api/users/${owner.userId}`, (route) =>
    route.fulfill({ json: owner }),
  );
  await page.route(`**/api/invoices/${invoiceId}`, (route) =>
    route.fulfill({ json: detail }),
  );
  await page.route(`**/api/invoices/by-item/${itemId}`, (route) =>
    route.fulfill({ json: detail }),
  );
  await page.route("**/api/invoices?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (query.has("memberId")) expect(query.get("memberId")).toBe(owner.userId);
    return route.fulfill({ json: { items: [detail.summary], totalCount: 1 } });
  });
  await page.route("**/api/manager/court-schedule?**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/gym-checkins/inside?**", (route) =>
    route.fulfill({ json: { items: [], totalCount: 0 } }),
  );
  await page.route(`**/api/members/${owner.userId}/points`, (route) =>
    route.fulfill({
      json: { availablePoints: 0, heldPoints: 0, vndPerPoint: 1000 },
    }),
  );
  await page.route(
    `**/api/invoices/${invoiceId}/point-confirmations/current`,
    (route) => route.fulfill({ body: "null", contentType: "application/json" }),
  );
  await page.route(`**/api/checkouts/${invoiceId}`, (route) =>
    route.fulfill({
      json: {
        invoiceId,
        kind: "MEMBERSHIP",
        state: "ACTIVE",
        invoiceStatus: "ISSUED",
        totalAmount: 600000,
        cashAmount: 600000,
        pointsApplied: 0,
        revision: 1,
        beneficiaryUserId: owner.userId,
        fulfillmentOutcome: "NONE",
        reconciliationRequired: false,
        expiresAtUtc: new Date(Date.now() + 600000).toISOString(),
        serverNowUtc: new Date().toISOString(),
      },
    }),
  );
  return { invoiceId, owner, detail, writes };
}

for (const language of ["en", "vi"] as const)
  test(`Dashboard invoice link selects its member and opens detail after reload in ${language}`, async ({
    page,
  }) => {
    await session(page, "RECEPTIONIST", language);
    const { invoiceId, owner, writes } = await invoiceLinkFixture(page);
    await page.goto("/receptionist");
    await page
      .getByRole("link", {
        name: language === "en" ? "Details" : "Chi tiết",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      `/receptionist/invoices?invoiceId=${invoiceId}`,
    );
    const invoice = page
      .getByRole("listitem")
      .filter({ hasText: "Linked Gym membership" })
      .first();
    await expect(invoice).toBeVisible();
    await expect(
      page.getByText(owner.email, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 }).first(),
    ).toHaveText(language === "en" ? "Invoice" : "Hóa đơn");
    await page.getByTitle(/Switch to Vietnamese|Chuyển sang Tiếng Anh/).click();
    await expect(invoice).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 }).first(),
    ).toHaveText(language === "en" ? "Hóa đơn" : "Invoice");
    await page.reload();
    await expect(invoice).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Change|Thay đổi)$/ }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/invoice-link-${language}.png`,
      fullPage: true,
    });
    expect(writes).toEqual([]);
  });

test("Invoice item link resolves the beneficiary without manual member selection", async ({
  page,
}) => {
  await session(page, "RECEPTIONIST");
  const { owner, writes } = await invoiceLinkFixture(page);
  await page.goto(`/receptionist/invoices?invoiceItemId=${itemId}`);
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Linked Gym membership" })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByText(owner.email, { exact: true }).first(),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

for (const status of [403, 404])
  test(`Invoice link ${status} is visible and retry restores detail without payment writes`, async ({
    page,
  }) => {
    await session(page, "RECEPTIONIST");
    const { invoiceId, detail, writes } = await invoiceLinkFixture(page);
    let rejected = true;
    await page.route(`**/api/invoices/${invoiceId}`, (route) =>
      rejected
        ? route.fulfill({
            status,
            json: {
              error:
                status === 403 ? "invoice_access_denied" : "invoice_not_found",
              message: "Invoice unavailable",
            },
          })
        : route.fulfill({ json: detail }),
    );
    await page.goto(`/receptionist/invoices?invoiceId=${invoiceId}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Invoice unavailable",
    );
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Linked Gym membership" })
        .first(),
    ).toHaveCount(0);
    rejected = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: "Linked Gym membership" })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(writes).toEqual([]);
  });

test("Malformed invoice link shows a translated error without requesting invoice data", async ({
  page,
}) => {
  await session(page, "RECEPTIONIST");
  let invoiceReads = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/invoices")) invoiceReads++;
  });
  await page.goto("/receptionist/invoices?invoiceId=bad-id");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "This invoice link is invalid",
  );
  await page.getByTitle("Switch to Vietnamese").click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Liên kết hóa đơn không hợp lệ",
  );
  expect(invoiceReads).toBe(0);
});

test("Legacy pending invoice shows its details without opening a missing checkout", async ({
  page,
}) => {
  await session(page, "RECEPTIONIST");
  const { invoiceId, detail, writes } = await invoiceLinkFixture(page);
  await page.route(`**/api/invoices/${invoiceId}`, (route) =>
    route.fulfill({
      json: {
        ...detail,
        summary: { ...detail.summary, checkoutExpiresAtUtc: null },
      },
    }),
  );
  let checkoutReads = 0;
  await page.route(`**/api/checkouts/${invoiceId}`, (route) => {
    checkoutReads++;
    return route.fulfill({
      status: 404,
      json: { error: "checkout_not_found", message: "No checkout" },
    });
  });
  await page.goto(`/receptionist/invoices?invoiceId=${invoiceId}`);
  await expect(
    page.getByRole("listitem").filter({ hasText: "Linked Gym membership" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This legacy invoice has no online payment session to resume.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.getByTitle("Switch to Vietnamese").click();
  await expect(
    page.getByText("Hóa đơn cũ không có phiên thanh toán trực tuyến", {
      exact: false,
    }),
  ).toBeVisible();
  expect(checkoutReads).toBe(0);
  expect(writes).toEqual([]);
});
