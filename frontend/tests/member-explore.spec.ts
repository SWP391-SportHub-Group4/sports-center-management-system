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
    page.getByText(
      "Tìm khóa học phù hợp với bạn. Xem lịch, chỗ còn và học phí trước khi đăng ký.",
    ),
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
  await page.getByRole("button", { name: "Danh sách" }).click();
  await expect(page.getByText("Bóng rổ 01").first()).toBeVisible();
  await expect(page.getByText("PT cùng Đỗ Quang").first()).toBeVisible();
});

test("Lịch của tôi: lịch trống có ba lối đi", async ({ page }) => {
  await base(page);
  await page.goto("/member/schedule");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "Khám phá khóa học" }),
  ).toHaveAttribute("href", "/member/discover");
  await expect(main.getByRole("link", { name: /Đặt lịch PT/ })).toHaveAttribute(
    "href",
    "/member/pt/book",
  );
  await expect(main.getByRole("link", { name: /Thuê sân/ })).toHaveAttribute(
    "href",
    "/member/courts/book",
  );
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
    status: "TRANSFERRED",
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
