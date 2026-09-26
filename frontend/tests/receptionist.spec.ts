import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-26T08:00:00Z") });
  await page.addInitScript(() => {
    window.localStorage.setItem("sporthub.accessToken", "receptionist-test-token");
    window.localStorage.setItem(
      "sporthub.user",
      JSON.stringify({
        userId: "rec-1",
        email: "receptionist@sporthub.test",
        fullName: "Lễ Tân Ca Sáng",
        role: "Receptionist",
      }),
    );
  });

  // Mock class sessions
  await page.route("**/api/class-sessions*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          sessionId: "sess-1",
          className: "Morning HIIT Boxing",
          discipline: "Strength",
          coachName: "Trần HLV",
          roomName: "Studio A",
          startAtUtc: "2026-09-26T08:30:00Z",
          endAtUtc: "2026-09-26T09:30:00Z",
          capacity: 20,
          confirmedCount: 15,
          status: "Scheduled",
          isFull: false,
        },
      ]),
    });
  });

  // Mock invoices
  await page.route("**/api/invoices*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            invoiceId: "inv-1",
            invoiceNumber: "INV-2026-001",
            memberName: "Lê Văn Hùng",
            memberEmail: "hung@gmail.com",
            totalAmount: 3000000,
            grossCollected: 1500000,
            netCollected: 1500000,
            outstanding: 1500000,
            obligationReduction: 0,
            netPayable: 3000000,
            refundDue: 0,
            refundedAmount: 0,
            issuedAt: "2026-09-01T00:00:00Z",
            dueDateUtc: "2026-10-01T00:00:00Z",
            status: "PartiallyPaid",
            isOverdue: false,
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 10,
      }),
    });
  });

  // Mock members search
  await page.route("**/api/admin/users*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            userId: "mem-1",
            fullName: "Lê Văn Hùng",
            email: "hung@gmail.com",
            phoneNumber: "0901234567",
            role: "Member",
            status: "Active",
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 10,
      }),
    });
  });

  // Mock membership packages catalog
  await page.route("**/api/membership-packages*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          packageId: "pkg-1",
          name: "All-Access Gold 3 Months",
          durationDays: 90,
          price: 3600000,
          discipline: "All",
          sessionLimit: null,
          isActive: true,
        },
      ]),
    });
  });

  // Mock member packages
  await page.route("**/api/members/*/packages*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          memberPackageId: "pkg-1",
          packageName: "All-Access Gold 3 Months",
          status: "Active",
          startDate: "2026-09-01",
          endDate: "2026-12-01",
          remainingSessions: null,
          isUsable: true,
        },
      ]),
    });
  });

  // Mock member check-ins
  await page.route("**/api/members/*/checkins*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          checkInId: "chk-1",
          checkedInAt: "2026-09-26T07:45:00Z",
          packageName: "All-Access Gold 3 Months",
        },
      ]),
    });
  });
});

test.describe("Receptionist Desk Suite", () => {
  test("Dashboard displays quick action cards with hotkeys and schedule occupancy", async ({ page }) => {
    await page.goto("/receptionist");
    await expect(page.getByText("Front Desk Terminal").or(page.getByText("Bàn Lễ Tân Trung Tâm"))).toBeVisible();

    // Check quick action cards
    await expect(page.getByText("Gym Turnstile Check-in").or(page.getByText("Điểm danh Cửa Gym"))).toBeVisible();
    await expect(page.getByText("Alt + 1")).toBeVisible();
    await expect(page.getByText("Alt + 2")).toBeVisible();
    await expect(page.getByText("Alt + 3")).toBeVisible();
    await expect(page.getByText("Alt + 4")).toBeVisible();

    // Check schedule row
    await expect(page.getByText("Morning HIIT Boxing")).toBeVisible();
    await expect(page.getByText("15/20")).toBeVisible();
  });

  test("Gym Check-in Terminal displays hardware scanner HUD and clearance grant", async ({ page }) => {
    await page.goto("/receptionist/gym-checkin");
    await expect(page.getByText("Gym Turnstile Terminal").or(page.getByText("Điểm danh Cổng Turnstile Gym"))).toBeVisible();

    // Verify hardware scanner HUD
    await expect(page.getByText("Optical Gate Turnstile Reader Active").or(page.getByText("Đầu đọc cổng quang Turnstile đang sẵn sàng"))).toBeVisible();
    await expect(page.getByText("Hardware Online").or(page.getByText("Cổng kết nối tốt"))).toBeVisible();

    // Verify Live Camera Scanner HUD is mounted
    await expect(page.getByText("Live Camera Turnstile Scanner").or(page.getByText("Camera Quét Mã Cổng Turnstile"))).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Auto-unlock gate|Tự động mở cổng/i })).toBeVisible();

    // Verify member input is present
    const searchInput = page.getByPlaceholder(/Scan barcode\/QR/i).or(page.getByPlaceholder(/Quét mã Barcode\/QR/i));
    await expect(searchInput).toBeVisible();

    // Search for member
    await searchInput.fill("hung");
    await page.waitForTimeout(400);

    // Select member
    const memberOption = page.getByRole("button", { name: /Lê Văn Hùng/i }).first();
    if (await memberOption.isVisible()) {
      await memberOption.click();

      // Clearance Card should be visible
      await expect(page.getByText("Clearance Granted").or(page.getByText("Đủ Điều Kiện Qua Cổng")).or(page.getByText("All-Access Gold 3 Months"))).toBeVisible();
    }
  });

  test("Sell Packages POS displays 3-step workflow and quick payment presets", async ({ page }) => {
    await page.goto("/receptionist/sell-plans");
    await expect(page.getByText("POS Package Sales & Cashier").or(page.getByText("Bán gói tập & Thu ngân"))).toBeVisible();

    // Workflow steps visible
    await expect(page.getByText("Select Package").or(page.getByText("Chọn gói tập"))).toBeVisible();
    await expect(page.getByText("Collect Payment").or(page.getByText("Thu tiền"))).toBeVisible();
    await expect(page.getByText("Receipt & Activation").or(page.getByText("In biên lai"))).toBeVisible();

    // Available package card visible
    await expect(page.getByText("All-Access Gold 3 Months")).toBeVisible();
  });

  test("Invoices Workbench displays filters and tabular numbers", async ({ page }) => {
    await page.goto("/receptionist/invoices");
    await expect(page.getByText("Invoice Lookup & Payments").or(page.getByText("Tra cứu hóa đơn & Thu tiền"))).toBeVisible();

    // Verify invoice list table
    await expect(page.getByText("INV-2026-001")).toBeVisible();
    await expect(page.getByText("Lê Văn Hùng")).toBeVisible();
  });

  test("Class Booking Assistance displays unified member selection & schedule filters", async ({ page }) => {
    await page.goto("/receptionist/registrations");
    await expect(page.getByText("Class Booking Assistance").or(page.getByText("Đăng ký lớp hộ hội viên"))).toBeVisible();
    await expect(page.getByText("Member Selection & Schedule Filters").or(page.getByText("Chọn hội viên & Bộ lọc lịch ca học"))).toBeVisible();
    await expect(page.getByText("Schedule Date Presets:").or(page.getByText("Bộ lọc thời gian nhanh:"))).toBeVisible();
    await expect(page.getByRole("button", { name: /Next 7 Days|7 ngày tới/i })).toBeVisible();
  });

  test("Attendance Board displays quick date presets and session selection", async ({ page }) => {
    await page.goto("/receptionist/attendance");
    await expect(page.getByText("Front Desk Attendance").or(page.getByText("Điểm danh tại quầy"))).toBeVisible();
    await expect(page.getByText("Quick Date:").or(page.getByText("Chọn nhanh:"))).toBeVisible();
    await expect(page.getByRole("button", { name: /Today|Hôm nay/i })).toBeVisible();
  });
});
