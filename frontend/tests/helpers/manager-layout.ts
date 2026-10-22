import type { Page } from "@playwright/test";

export const layoutRoutes = [
  ["sports", "/manager/sports"],
  ["courts", "/manager/facilities"],
  ["membership", "/manager/membership-plans"],
  ["rates", "/manager/catalog?tab=court-rates"],
  ["classes", "/manager/classes"],
  ["people", "/manager/people"],
  ["wallets", "/manager/points"],
  ["notices", "/manager/notices"],
] as const;
export async function managerLayoutFixture(page: Page) {
  const people = [1, 2].map((n) => ({
    userId: "00000000-0000-4000-8000-00000000000" + n,
    fullName: n === 1 ? "Alex Nguyen with a longer display name" : "Linh Tran",
    email:
      n === 1
        ? "long.member.contact.for.alignment@example.com"
        : "linh@example.com",
    phone: "0901234567",
    role: n === 1 ? "MEMBER" : "COACH",
    status: "ACTIVE",
    activationPending: false,
    avatarUrl: null,
    sportIds: [3],
  }));
  const sports = [1, 2].map((n) => ({
    sportId: n === 1 ? 3 : 4,
    code: n === 1 ? "badminton" : "basketball",
    name: n === 1 ? "Badminton" : "Basketball",
    sortOrder: n,
    isActive: n === 1,
    description: "Training",
    imageUrl: null,
    services: [
      {
        serviceType: "GROUP_COURSE",
        isEnabled: true,
        defaultSessionMinutes: 90,
        defaultMaxCapacity: 12,
      },
    ],
    readiness: [],
  }));
  const rooms = [1, 2].map((n) => ({
    roomId: n,
    name: n === 1 ? "Indoor Badminton Court A" : "Court B",
    roomTypeId: 3,
    sportId: 3,
    capacity: n === 1 ? 12 : 125,
    isActive: true,
    activeClassCount: 1,
  }));
  const packages = [1, 2].map((n) => ({
    packageId: n,
    name: n === 1 ? "Gym membership with extended access" : "Gym 30 days",
    price: n === 1 ? 1500000 : 300000,
    durationDays: n === 1 ? 365 : 30,
    isActive: n === 1,
    description: "Gym access",
    sessionLimit: null,
  }));
  const rates = [1, 2].map((n) => ({
    rateId: n,
    roomTypeId: 3,
    sportId: 3,
    daysOfWeek: "MON,TUE,WED,THU,FRI",
    startTimeLocal: "06:00",
    endTimeLocal: "12:00",
    pricePerHour: n === 1 ? 120000 : 95000,
    isActive: true,
  }));
  const classes = [1, 2].map((n) => ({
    classId: n,
    code: "BD-00" + n,
    name:
      n === 1
        ? "Badminton foundations and movement for beginners"
        : "Evening training",
    sportId: 3,
    sportName: "Badminton",
    status: "PUBLISHED",
    thresholdStatus: "MET",
    confirmedCount: 12,
    capacity: 20,
    activeHoldCount: 2,
    price: 1500000,
    coachName: "Coach Linh",
    startDate: "2026-11-01",
    endDate: "2026-12-01",
  }));
  const notices = [1, 2].map((n) => ({
    noticeId: "00000000-0000-4000-8000-00000000000" + n,
    subject:
      n === 1
        ? "Court maintenance and updated practice arrangements"
        : "Schedule reminder",
    createdAtUtc: "2026-10-21T08:00:00Z",
    recipientCount: n === 1 ? 125 : 12,
    sendInApp: true,
    sendEmail: true,
    status: "SENT",
  }));
  const paged = (items: unknown[]) => ({
    items,
    totalCount: items.length,
    page: 1,
    pageSize: 20,
  });
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "layout-fixture"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let value: unknown = [];
    if (path === "/api/users/me")
      value = {
        userId: "manager",
        fullName: "Center Manager",
        email: "manager@example.com",
        role: "CENTER_MANAGER",
        sportIds: [],
      };
    else if (path.includes("notifications"))
      value = path.endsWith("unread-count") ? { count: 0 } : [];
    else if (path === "/api/manager/sports" || path === "/api/sports")
      value = sports;
    else if (path === "/api/rooms") value = rooms;
    else if (path === "/api/room-types")
      value = [
        {
          roomTypeId: 3,
          name: "Indoor badminton courts",
          sportIds: [3],
          isActive: true,
        },
      ];
    else if (path === "/api/manager/court-rates") value = rates;
    else if (path === "/api/membership-packages") value = packages;
    else if (path === "/api/manager/people" || path === "/api/users")
      value = paged(people);
    else if (path === "/api/manager/classes") value = paged(classes);
    else if (path === "/api/manager/notices") value = paged(notices);
    else if (path.includes("points-summary"))
      value = { outstandingPoints: 2000, pointsSold: 3000, pointsSpent: 1000 };
    else if (path === "/api/public/overview")
      value = {
        coachCount: 3,
        memberCount: 120,
        facilityCount: 4,
        facilities: [],
      };
    return route.fulfill({ json: value });
  });
}
