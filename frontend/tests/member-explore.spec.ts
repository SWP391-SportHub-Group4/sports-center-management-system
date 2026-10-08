import { expect, test, type Page } from "@playwright/test";

// Khám phá, Lịch của tôi, Khóa học của tôi (tiếng Việt): nội dung theo Business Rules, dữ liệu giả.

const h = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();
const d = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const sports = [
  {
    sportId: 1,
    code: "gym",
    name: "Gym",
    isActive: true,
    services: [{ serviceType: "PERSONAL_TRAINING", isEnabled: true }],
  },
  {
    sportId: 3,
    code: "badminton",
    name: "Cầu lông",
    isActive: true,
    services: [
      {
        serviceType: "GROUP_COURSE",
        isEnabled: true,
        defaultSessionMinutes: 120,
        defaultMaxCapacity: 12,
      },
      { serviceType: "COURT_RENTAL", isEnabled: true },
    ],
  },
  {
    sportId: 4,
    code: "basketball",
    name: "Bóng rổ",
    isActive: true,
    services: [
      {
        serviceType: "GROUP_COURSE",
        isEnabled: true,
        defaultSessionMinutes: 120,
        defaultMaxCapacity: 20,
      },
    ],
  },
];
const courses = [
  {
    classId: 1,
    code: "BR01",
    name: "Bóng rổ 01",
    sportId: 4,
    sportName: "Bóng rổ",
    coachId: "c",
    coachName: "Vũ Hải",
    defaultRoomId: 9,
    roomName: "Sân bóng rổ 1",
    startDate: d(5),
    numSessions: 12,
    capacity: 20,
    availableSeats: 14,
    price: 1200000,
    status: "PUBLISHED",
    firstSessionStartUtc: h(120),
    scheduleRules: [
      { dayOfWeek: 1, startTimeLocal: "07:00" },
      { dayOfWeek: 3, startTimeLocal: "07:00" },
      { dayOfWeek: 5, startTimeLocal: "07:00" },
    ],
  },
  {
    classId: 2,
    code: "CL01",
    name: "Cầu lông 01",
    sportId: 3,
    sportName: "Cầu lông",
    coachId: "c",
    coachName: "Phạm Minh",
    defaultRoomId: 3,
    roomName: "Sân cầu lông 1",
    startDate: d(6),
    numSessions: 12,
    capacity: 12,
    availableSeats: 2,
    price: 900000,
    status: "PUBLISHED",
    firstSessionStartUtc: h(140),
    scheduleRules: [
      { dayOfWeek: 2, startTimeLocal: "14:00" },
      { dayOfWeek: 4, startTimeLocal: "14:00" },
      { dayOfWeek: 6, startTimeLocal: "14:00" },
    ],
  },
  {
    classId: 3,
    code: "CL02",
    name: "Cầu lông 02",
    sportId: 3,
    sportName: "Cầu lông",
    coachId: "c",
    coachName: null,
    defaultRoomId: 3,
    roomName: "Sân cầu lông 2",
    startDate: d(9),
    numSessions: 8,
    capacity: 12,
    availableSeats: 0,
    price: 700000,
    status: "PUBLISHED",
    firstSessionStartUtc: null,
    scheduleRules: [],
  },
];

async function base(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "t");
    localStorage.setItem("sporthub_lang", "vi");
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b: unknown) => route.fulfill({ json: b });
    if (p === "/api/users/me")
      return json({
        userId: "u",
        email: "a@x.vn",
        fullName: "An",
        role: "MEMBER",
        sportIds: [],
      });
    if (p === "/api/sports") return json(sports);
    if (p.includes("notifications"))
      return json(p.endsWith("unread-count") ? { count: 0 } : []);
    return json([]);
  });
}

test("Khám phá: thẻ lớp đủ thông tin, lọc còn chỗ", async ({ page }) => {
  await base(page);
  await page.route("**/api/classes?**", (r) =>
    r.fulfill({
      json: { items: courses, page: 1, pageSize: 12, totalCount: 3 },
    }),
  );
  await page.goto("/member/discover");
  await expect(
    page.getByText("Tìm và mua khóa học, Membership Gym, PT hoặc đặt sân."),
  ).toBeVisible();

  const br = page.locator("article").filter({ hasText: "Bóng rổ 01" });
  await expect(br).toContainText("Vũ Hải");
  await expect(br).toContainText("Sân bóng rổ 1");
  await expect(br).toContainText("12 buổi");
  await expect(br).toContainText("07:00");
  await expect(br.getByRole("link", { name: "Xem chi tiết" })).toHaveAttribute(
    "href",
    "/member/discover/1",
  );
  await expect(
    page.locator("article").filter({ hasText: "Cầu lông 02" }),
  ).toContainText("Hết chỗ");

  await page.getByLabel(/còn chỗ/i).check();
  await expect(page.locator("article")).toHaveCount(2);
  await expect(page.getByText("Cầu lông 02")).toHaveCount(0);
});

test("Khám phá có danh mục Gym, PT và lối đặt sân", async ({ page }) => {
  await base(page);
  await page.route("**/api/membership-packages", (route) =>
    route.fulfill({
      json: [
        {
          packageId: 1,
          name: "Gym tháng",
          price: 500000,
          durationDays: 30,
          sessionLimit: null,
          description: "Tập Gym tự do trong 30 ngày.",
          isActive: true,
        },
      ],
    }),
  );
  await page.goto("/member/discover");
  await page.getByRole("tab", { name: "Membership Gym" }).click();
  await expect(page.getByText("Gym tháng")).toBeVisible();
  await page.getByRole("tab", { name: "Huấn luyện cá nhân" }).click();
  await expect(
    page.getByRole("tab", { name: "Huấn luyện cá nhân" }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Sân" }).click();
  await expect(
    page.getByRole("link", { name: "Tìm sân trống" }),
  ).toHaveAttribute("href", "/member/courts/book");
});

test("Khám phá: không có lớp thì hiện trạng thái trống có lối đi tiếp", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/classes?**", (r) =>
    r.fulfill({ json: { items: [], page: 1, pageSize: 12, totalCount: 0 } }),
  );
  await page.goto("/member/discover");
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /Thuê sân/ })
      .first(),
  ).toHaveAttribute("href", "/member/courts/book");
});

test("Lịch của tôi: phân biệt lớp nhóm, PT và thuê sân", async ({ page }) => {
  await base(page);
  await page.route("**/api/members/me/schedule**", (r) =>
    r.fulfill({
      json: [
        {
          sessionId: "s1",
          classId: 1,
          className: "Bóng rổ 01",
          sportName: "Bóng rổ",
          sessionNo: 1,
          roomName: "Sân bóng rổ 1",
          startAtUtc: h(1),
          endAtUtc: h(3),
          status: "SCHEDULED",
          isMakeup: false,
          attendanceStatus: null,
        },
      ],
    }),
  );
  await page.route("**/api/members/me/pt-sessions**", (r) =>
    r.fulfill({
      json: [
        {
          sessionId: "p1",
          entitlementId: "e",
          memberId: "m",
          memberName: "An",
          coachId: "c",
          coachName: "Đỗ Quang",
          startAtUtc: h(4),
          endAtUtc: h(5.5),
          status: "SCHEDULED",
          quotaState: "RESERVED",
          roomId: 3,
          roomName: "Phòng PT 2",
        },
      ],
    }),
  );
  await page.goto("/member/schedule");

  await expect(page.getByText("Bóng rổ 01").first()).toBeVisible();
  await expect(page.getByText("Đỗ Quang").first()).toBeVisible();
  const filters = page.getByRole("group", { name: "Hiển thị" });
  await filters.getByRole("button", { name: "Buổi PT" }).click();
  const calendar = page.getByRole("region", { name: "Thời khóa biểu tuần" });
  await expect(calendar.getByText("Đỗ Quang").first()).toBeVisible();
  await expect(calendar.getByText("Bóng rổ 01")).toHaveCount(0);
  await filters.getByRole("button", { name: "Tất cả" }).click();
  await expect(calendar.getByText("Bóng rổ 01").first()).toBeVisible();
});

const enrollments = [
  {
    enrollmentId: "e1",
    classId: 1,
    classCode: "BR01",
    className: "Bóng rổ 01",
    sportName: "Bóng rổ",
    memberId: "u",
    status: "CONFIRMED",
    enrolledAt: h(-200),
    endedAt: null,
    numSessions: 12,
    firstSessionStartUtc: h(-100),
    classStatus: "IN_PROGRESS",
    coachName: "Vũ Hải",
    roomName: "Sân bóng rổ 1",
    lastSessionEndUtc: h(900),
    completedSessions: 3,
    invoiceItemId: null,
  },
  {
    enrollmentId: "e2",
    classId: 2,
    classCode: "CL01",
    className: "Cầu lông 01",
    sportName: "Cầu lông",
    memberId: "u",
    status: "CONFIRMED",
    enrolledAt: h(-20),
    endedAt: null,
    numSessions: 12,
    firstSessionStartUtc: h(140),
    classStatus: "PUBLISHED",
    coachName: "Phạm Minh",
    roomName: "Sân cầu lông 1",
    lastSessionEndUtc: h(1500),
    completedSessions: 0,
    invoiceItemId: null,
  },
  {
    enrollmentId: "e3",
    classId: 3,
    classCode: "CL00",
    className: "Cầu lông cơ bản",
    sportName: "Cầu lông",
    memberId: "u",
    status: "TRANSFERRED_OUT",
    enrolledAt: h(-900),
    endedAt: h(-300),
    numSessions: 8,
    firstSessionStartUtc: h(-800),
    classStatus: "COMPLETED",
    coachName: "Phạm Minh",
    roomName: "Sân cầu lông 2",
    lastSessionEndUtc: h(-400),
    completedSessions: 8,
    invoiceItemId: null,
  },
];

test("Khóa học của tôi: tiến độ, trạng thái, coach, phòng", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/members/me/enrollments**", (r) =>
    r.fulfill({
      json: { items: enrollments, page: 1, pageSize: 50, totalCount: 3 },
    }),
  );
  await page.goto("/member/courses?tab=all");
  const ongoing = page.locator("article").filter({ hasText: "Bóng rổ 01" });
  await expect(ongoing).toContainText("Đang học");
  await expect(ongoing).toContainText("3/12 buổi");
  await expect(ongoing).toContainText("Vũ Hải");
  await expect(ongoing).toContainText("Sân bóng rổ 1");
  await expect(
    ongoing.getByRole("link", { name: "Xem chi tiết" }),
  ).toHaveAttribute("href", "/member/courses/1");
  await expect(
    page.locator("article").filter({ hasText: "Cầu lông 01" }),
  ).toContainText("Sắp bắt đầu");
  await expect(
    page.locator("article").filter({ hasText: "Cầu lông cơ bản" }),
  ).toContainText("Đã chuyển lớp");
});

test("Khóa học của tôi: mỗi tab trống có CTA Khám phá khóa học", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/members/me/enrollments**", (r) =>
    r.fulfill({ json: { items: [], page: 1, pageSize: 50, totalCount: 0 } }),
  );
  for (const tab of ["upcoming", "ongoing", "history", "all"]) {
    await page.goto(`/member/courses?tab=${tab}`);
    await expect(
      page.getByRole("main").getByRole("link", { name: "Khám phá khóa học" }),
    ).toHaveAttribute("href", "/member/discover");
  }
});

const vnDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(iso),
  );

test("Khóa học của tôi: buổi kế tiếp, nhắc chọn phương án khi lớp thiếu học viên và gợi ý khóa tiếp theo", async ({
  page,
}) => {
  await base(page);
  const rows = [
    {
      ...enrollments[0],
      completedSessions: 11,
      nextSessionStartUtc: h(30),
      sportId: 4,
    },
    { ...enrollments[1], nextSessionStartUtc: h(140), sportId: 3 },
    {
      ...enrollments[2],
      status: "TRANSFERRED_OUT",
      sportId: 3,
      nextSessionStartUtc: null,
    },
  ];
  await page.route("**/api/members/me/enrollments**", (r) =>
    r.fulfill({ json: { items: rows, page: 1, pageSize: 50, totalCount: 3 } }),
  );
  await page.route("**/api/class-threshold-responses/mine", (r) =>
    r.fulfill({
      json: [
        {
          responseId: "th1",
          classId: 2,
          className: "Cầu lông 01",
          sportId: 3,
          paidValueVnd: 900000,
          deadlineUtc: h(48),
          choice: null,
          targetClassId: null,
          resolutionStatus: "PENDING",
          additionalInvoiceId: null,
          serverNowUtc: h(0),
        },
      ],
    }),
  );
  await page.goto("/member/courses?tab=all");

  const going = page.locator("article").filter({ hasText: "Bóng rổ 01" });
  await expect(going).toContainText("Buổi kế tiếp");
  await expect(
    going.getByRole("link", { name: "Xem khóa Bóng rổ tiếp theo" }),
  ).toHaveAttribute("href", "/member/discover?sport=4");

  const short = page.locator("article").filter({ hasText: "Cầu lông 01" });
  await expect(short.getByRole("status")).toContainText(
    "Lớp chưa đủ học viên để mở",
  );
  await expect(
    short.getByRole("link", { name: "Chọn phương án" }),
  ).toHaveAttribute("href", "/member/threshold-responses/th1");
  await expect(going.getByRole("status")).toHaveCount(0);

  const moved = page.locator("article").filter({ hasText: "Cầu lông cơ bản" });
  await expect(moved).toContainText("Đã chuyển lớp");
  await expect(moved).not.toContainText("Buổi kế tiếp");
});

test("Khám phá: mở từ liên kết gia hạn thì đã lọc sẵn theo môn", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/classes?**", (r) => {
    const sport = new URL(r.request().url()).searchParams.get("sportId");
    return r.fulfill({
      json: {
        items: sport === "4" ? [courses[0]] : courses,
        page: 1,
        pageSize: 12,
        totalCount: 3,
      },
    });
  });
  await page.goto("/member/discover?sport=4");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("Bóng rổ 01");
});

test("Lịch của tôi: lượt thuê sân hủy được kèm quy tắc hoàn điểm, xuất .ics, PT chỉ xem", async ({
  page,
}) => {
  await base(page);
  const rental = {
    courtRentalId: "r1",
    sportId: 3,
    roomId: 6,
    startAtUtc: h(30),
    endAtUtc: h(31),
    totalPrice: 100000,
    status: "CONFIRMED",
    invoiceItemId: null,
  };
  let cancelled = false;
  await page.route("**/api/court-rentals/mine**", (r) =>
    r.fulfill({
      json: [cancelled ? { ...rental, status: "CANCELLED" } : rental],
    }),
  );
  await page.route("**/api/court-rentals/policy", (r) =>
    r.fulfill({
      json: {
        slotMinutes: 60,
        maxHours: 4,
        advanceDays: 30,
        cancelFreeHours: 24,
        serverNowUtc: h(0),
      },
    }),
  );
  await page.route("**/api/court-rentals/r1/cancel", (r) => {
    cancelled = true;
    return r.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/members/me/pt-sessions**", (r) =>
    r.fulfill({
      json: [
        {
          sessionId: "p1",
          entitlementId: "e",
          memberId: "m",
          memberName: "An",
          coachId: "c",
          coachName: "Đỗ Quang",
          startAtUtc: h(30),
          endAtUtc: h(31.5),
          status: "SCHEDULED",
          quotaState: "RESERVED",
          roomId: 3,
          roomName: "Phòng PT 2",
        },
      ],
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/member/schedule?date=" + vnDate(h(30)));

  // PT: chỉ xem, không có nút hủy; có hướng dẫn sang trang chi tiết
  await page.locator("table button").filter({ hasText: "Buổi PT" }).click();
  let drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("button", { name: "Hủy lượt thuê" }),
  ).toHaveCount(0);
  await expect(drawer).toContainText(
    "Đổi hoặc hủy buổi PT thực hiện ở trang chi tiết buổi.",
  );
  await drawer.getByRole("button", { name: "Đóng" }).click();

  // Thuê sân: xuất .ics
  await page.locator("table button").filter({ hasText: "Thuê sân" }).click();
  drawer = page.getByRole("dialog");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    drawer.getByRole("button", { name: "Thêm vào lịch (.ics)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^sporthub-rental-.*[.]ics$/);

  // Hủy: còn hơn 24 giờ nên hoàn 100% điểm
  await drawer.getByRole("button", { name: "Hủy lượt thuê" }).click();
  const confirm = page.getByRole("dialog", { name: "Hủy lượt thuê sân?" });
  await expect(confirm).toContainText("được hoàn 100% điểm");
  await confirm.getByRole("button", { name: "Xác nhận hủy" }).click();
  await expect(
    page.getByRole("dialog", { name: "Hủy lượt thuê sân?" }),
  ).toHaveCount(0);
  await expect(
    page.locator("table button").filter({ hasText: "Thuê sân" }),
  ).toContainText("Đã hủy");
});

test("Lịch của tôi: lượt thuê sát giờ chơi cảnh báo không hoàn điểm", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/court-rentals/mine**", (r) =>
    r.fulfill({
      json: [
        {
          courtRentalId: "r2",
          sportId: 3,
          roomId: 6,
          startAtUtc: h(5),
          endAtUtc: h(6),
          totalPrice: 100000,
          status: "CONFIRMED",
          invoiceItemId: null,
        },
      ],
    }),
  );
  await page.route("**/api/court-rentals/policy", (r) =>
    r.fulfill({
      json: {
        slotMinutes: 60,
        maxHours: 4,
        advanceDays: 30,
        cancelFreeHours: 24,
        serverNowUtc: h(0),
      },
    }),
  );
  await page.goto("/member/schedule?date=" + vnDate(h(5)));
  await page.locator("table button").filter({ hasText: "Thuê sân" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hủy lượt thuê" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Hủy lượt thuê sân?" }),
  ).toContainText("không được hoàn điểm");
});

test("Lịch của tôi trên điện thoại: tuần chia theo ngày, không cuộn ngang, bấm buổi mở chi tiết", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/members/me/pt-sessions**", (r) =>
    r.fulfill({
      json: [
        {
          sessionId: "p1",
          entitlementId: "e",
          memberId: "m",
          memberName: "An",
          coachId: "c",
          coachName: "Đỗ Quang",
          startAtUtc: h(30),
          endAtUtc: h(31.5),
          status: "SCHEDULED",
          quotaState: "RESERVED",
          roomId: 3,
          roomName: "Phòng PT 2",
        },
      ],
    }),
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/member/schedule?date=" + vnDate(h(30)));
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.getByRole("region", { name: /^(Thứ|Chủ)/ })).toHaveCount(7);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(361);
  await page.getByRole("button", { name: /Buổi PT/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Phòng PT 2");
});
