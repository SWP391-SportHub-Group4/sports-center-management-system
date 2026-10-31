import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { loginApi } from "./helpers/auth";
import { en } from "../src/locales/en";
import type {
  CourseEnrollmentDto,
  CourseSessionDto,
  ManagerCourseDto,
  WalletBalanceDto,
} from "../src/lib/types";

const base = process.env.P2_LIVE_API;

test.skip(!base, "Set P2_LIVE_API for an isolated test API.");

test.describe.configure({
  mode: "serial",
});

const login = (request: APIRequestContext, email: string) =>
  loginApi(request, email);

async function browserAuth(page: Page, token: string) {
  await page.addInitScript((accessToken) => {
    localStorage.setItem("sporthub.accessToken", accessToken);

    localStorage.setItem("sporthub_lang", "en");
  }, token);
}

test("paid enrolled class can be cancelled with reviewed refunds without duplicate credits", async ({
  page,
  request,
}) => {
  const manager = await login(request, "manager@sporthub.vn");

  const member = await login(request, "an.member@sporthub.vn");

  const headers = {
    Authorization: `Bearer ${manager.accessToken}`,
  };

  const memberHeaders = {
    Authorization: `Bearer ${member.accessToken}`,
  };

  const sports = await (await request.get(`${base}/api/sports`)).json();

  const sport = sports.find(
    (s: {
      services: {
        serviceType: string;
        isEnabled: boolean;
      }[];
    }) =>
      s.services.some((x) => x.serviceType === "GROUP_COURSE" && x.isEnabled),
  );

  expect(sport).toBeTruthy();

  const coaches = await (
    await request.get(`${base}/api/coaches?sportId=${sport.sportId}`, {
      headers,
    })
  ).json();

  expect(coaches.length).toBeGreaterThan(0);

  const template = (
    await (
      await request.get(`${base}/api/classes?sportId=${sport.sportId}`)
    ).json()
  ).items[0];

  expect(template).toBeTruthy();

  const date = new Date();

  date.setUTCDate(date.getUTCDate() + 360);

  const created = await request.post(`${base}/api/manager/classes`, {
    headers,
    data: {
      code: `P2-cancel-${Date.now()}`,

      name: "P2 live enrolled cancellation refund",

      sportId: sport.sportId,

      coachId: coaches[0].userId,

      defaultRoomId: template.defaultRoomId,

      startDate: date.toISOString().slice(0, 10),

      numSessions: 3,

      capacity: 8,

      price: 100000,

      costAmount: 100000,

      scheduleRules: [
        {
          dayOfWeek: date.getUTCDay(),

          startTimeLocal: "10:00",
        },
      ],
    },
  });

  expect(created.ok(), await created.text()).toBeTruthy();

  const course = await created.json();

  const publish = await request.post(
    `${base}/api/manager/classes/${course.classId}/publish`,
    {
      headers,
      data: {},
    },
  );

  expect(publish.ok(), await publish.text()).toBeTruthy();

  expect((await publish.json()).enrollmentOpen).toBe(true);

  const before = await (
    await request.get(`${base}/api/wallet/me`, {
      headers: memberHeaders,
    })
  ).json();

  const checkout = await request.post(`${base}/api/checkouts/class`, {
    headers: {
      ...memberHeaders,
      "Idempotency-Key": crypto.randomUUID(),
    },

    data: {
      classId: course.classId,
    },
  });

  expect(checkout.ok(), await checkout.text()).toBeTruthy();

  const { invoiceId } = await checkout.json();

  const selection = await request.post(
    `${base}/api/wallet/me/checkouts/${invoiceId}/points`,
    {
      headers: memberHeaders,

      data: {
        points: 100,
      },
    },
  );

  expect(selection.ok(), await selection.text()).toBeTruthy();

  const paid = await request.post(
    `${base}/api/checkouts/${invoiceId}/confirm-points`,
    {
      headers: memberHeaders,
    },
  );

  expect(paid.ok(), await paid.text()).toBeTruthy();

  async function readJson<T>(
    path: string,
    auth: Record<string, string>,
  ): Promise<T> {
    const response = await request.get(base + path, { headers: auth });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<T>;
  }
  const classPath = `/api/manager/classes/${course.classId}`;
  const sessionsPath = `/api/classes/${course.classId}/sessions`;
  const enrollmentPath = "/api/members/me/enrollments?pageSize=100";
  const walletAfterPayment = await readJson<WalletBalanceDto>(
    "/api/wallet/me",
    memberHeaders,
  );
  expect(walletAfterPayment.availablePoints).toBe(before.availablePoints - 100);
  expect(walletAfterPayment.heldPoints).toBe(before.heldPoints);
  const ledgerBefore = await readJson(
    "/api/wallet/me/ledger?pageSize=100",
    memberHeaders,
  );
  const classBefore = await readJson<ManagerCourseDto>(classPath, headers);
  const sessionsBefore = await readJson<CourseSessionDto[]>(
    sessionsPath,
    headers,
  );
  const enrollments = await readJson<{ items: CourseEnrollmentDto[] }>(
    enrollmentPath,
    memberHeaders,
  );
  const enrollmentBefore = enrollments.items.find(
    (e) => e.classId === course.classId,
  );
  expect(classBefore.status).toBe("PUBLISHED");
  expect(classBefore.confirmedCount).toBe(1);
  expect(enrollmentBefore).toMatchObject({
    status: "CONFIRMED",
    endedAt: null,
  });
  expect(sessionsBefore).toHaveLength(3);

  await browserAuth(page, manager.accessToken);

  await page.goto(`/manager/classes/${course.classId}?tab=management`);
  await expect(
    page.getByRole("button", {
      name: en.classWorkspace.cancelAndRefund,
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: en.managerOperations.closeEnrollment,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: en.managerOperations.reopenEnrollment,
      exact: true,
    }),
  ).toHaveCount(0);

  const preview = await readJson<{
    canCancel: boolean;
    confirmedCount: number;
    refundPoints: number;
    previewToken: string;
    members: { enrollmentId: string; refundPoints: number }[];
  }>(classPath + "/cancellation-preview", headers);
  expect(preview).toMatchObject({
    canCancel: true,
    confirmedCount: 1,
    refundPoints: 100,
  });
  expect(preview.members).toEqual([
    expect.objectContaining({
      enrollmentId: enrollmentBefore!.enrollmentId,
      refundPoints: 100,
    }),
  ]);
  // Paid enrollments require an explicit refund decision before cancellation.
  const missingRefunds = await request.post(base + classPath + "/cancel", {
    headers,
    data: {
      reason: "Cancel the paid enrolled class",
      previewToken: preview.previewToken,
    },
  });
  expect(missingRefunds.status(), await missingRefunds.text()).toBe(400);
  expect(await missingRefunds.json()).toMatchObject({
    error: "class_refund_members_invalid",
  });
  const first = sessionsBefore[0];
  const makeup = await request.post(
    `${base}/api/class-sessions/${first.sessionId}/cancel`,
    {
      headers,
      data: {
        reason: "Attempt to cancel an enrolled session",
        makeup: {
          startAtUtc: new Date(
            Date.parse(first.startAtUtc) + 86400000,
          ).toISOString(),
          roomId: first.roomId,
          coachId: first.coachId,
        },
      },
    },
  );
  expect(makeup.status(), await makeup.text()).toBe(409);
  expect(await makeup.json()).toMatchObject({ error: "class_has_enrollments" });

  await page.goto(`/manager/classes/${course.classId}?tab=sessions`);
  await page
    .getByRole("button", { name: en.operations.edit, exact: true })
    .first()
    .click();
  const editor = page.getByRole("dialog", {
    name: en.classWorkspace.editSession,
    exact: true,
  });
  await expect(
    editor.getByLabel(en.operations.start, { exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByLabel(en.operations.room, { exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByLabel(en.operations.coach, { exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole("option", { name: en.operations.makeup, exact: true }),
  ).toHaveCount(0);
  await editor
    .getByRole("button", { name: en.common.close, exact: true })
    .click();

  const classAfter = await readJson<ManagerCourseDto>(classPath, headers);
  expect(classAfter.status).toBe(classBefore.status);
  expect(classAfter.confirmedCount).toBe(classBefore.confirmedCount);
  expect(classAfter.reservedCount).toBe(classBefore.reservedCount);
  expect(await readJson(sessionsPath, headers)).toEqual(sessionsBefore);
  const remaining = await readJson<{ items: CourseEnrollmentDto[] }>(
    enrollmentPath,
    memberHeaders,
  );
  expect(remaining.items.find((e) => e.classId === course.classId)).toEqual(
    enrollmentBefore,
  );
  expect(await readJson("/api/wallet/me", memberHeaders)).toEqual(
    walletAfterPayment,
  );
  expect(
    await readJson("/api/wallet/me/ledger?pageSize=100", memberHeaders),
  ).toEqual(ledgerBefore);
  const invoice = await readJson<{
    invoiceStatus: string;
    fulfillmentOutcome: string;
  }>(`/api/checkouts/${invoiceId}`, memberHeaders);
  expect(invoice).toMatchObject({
    invoiceStatus: "PAID",
    fulfillmentOutcome: "FULFILLED",
  });

  await page.goto(`/manager/classes/${course.classId}?tab=management`);
  await page
    .getByRole("button", {
      name: en.classWorkspace.cancelAndRefund,
      exact: true,
    })
    .click();
  const cancellation = page.getByRole("dialog", {
    name: en.classWorkspace.cancelClass,
    exact: true,
  });
  const reason = "Cancel the paid enrolled class";
  await cancellation
    .getByLabel(en.operations.reason, { exact: true })
    .fill(reason);
  await cancellation
    .getByRole("button", {
      name: en.operations.cancellationPreview,
      exact: true,
    })
    .click();
  const confirm = cancellation.getByRole("button", {
    name: en.operations.confirm,
    exact: true,
  });
  await expect(
    cancellation.getByRole("region", {
      name: en.classCancellationRefund.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(confirm).toBeDisabled();
  await cancellation
    .getByRole("textbox", {
      name: new RegExp(en.classCancellationRefund.points),
    })
    .fill("100");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(cancellation).toHaveCount(0);

  // A successful retry must not repeat the cancellation or credit the wallet.
  const retry = await request.post(base + classPath + "/cancel", {
    headers,
    data: {
      reason,
      previewToken: preview.previewToken,
      refunds: preview.members.map((m) => ({
        enrollmentId: m.enrollmentId,
        points: m.refundPoints,
      })),
    },
  });
  expect(retry.ok(), await retry.text()).toBeTruthy();
  expect(await readJson<ManagerCourseDto>(classPath, headers)).toMatchObject({
    status: "CANCELLED",
    confirmedCount: 0,
    reservedCount: 0,
  });
  const cancelledSessions = await readJson<CourseSessionDto[]>(
    sessionsPath,
    headers,
  );
  expect(cancelledSessions).toHaveLength(sessionsBefore.length);
  expect(cancelledSessions.map((s) => s.sessionId).sort()).toEqual(
    sessionsBefore.map((s) => s.sessionId).sort(),
  );
  for (const session of cancelledSessions)
    expect(session.status).toBe("CANCELLED");
  const cancelledEnrollments = await readJson<{ items: CourseEnrollmentDto[] }>(
    enrollmentPath,
    memberHeaders,
  );
  expect(
    cancelledEnrollments.items.find((e) => e.classId === course.classId),
  ).toMatchObject({
    enrollmentId: enrollmentBefore!.enrollmentId,
    status: "CANCELLED_BY_CENTER",
    endedAt: expect.any(String),
  });
  // Points remain unchanged until the member chooses the offered refund.
  expect(await readJson("/api/wallet/me", memberHeaders)).toEqual(
    walletAfterPayment,
  );
  expect(
    await readJson("/api/wallet/me/ledger?pageSize=100", memberHeaders),
  ).toEqual(ledgerBefore);
  const offers = await readJson<
    { invoiceItemId: string; refundPoints: number; status: string }[]
  >("/api/refunds/center-cancellations/mine", memberHeaders);
  expect(
    offers.filter((o) => o.invoiceItemId === enrollmentBefore!.invoiceItemId),
  ).toEqual([expect.objectContaining({ refundPoints: 100, status: "Offer" })]);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: en.classWorkspace.cancelAndRefund,
      exact: true,
    }),
  ).toHaveCount(0);

  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test.skip("manual notice UI uses a real receipt and restores delivery after F5", async ({
  page,
  request,
}) => {
  const manager = await login(request, "manager@sporthub.vn");

  await browserAuth(page, manager.accessToken);

  await page.goto("/manager/notices");

  await page
    .getByRole("checkbox", {
      name: "Phạm Minh Cầu Lông",
    })
    .check();

  await page
    .getByLabel("Subject", {
      exact: true,
    })
    .fill("P2 isolated notice");

  await page
    .getByLabel("Message", {
      exact: true,
    })
    .fill("Test the real in-app notification receipt.");

  await page
    .getByRole("checkbox", {
      name: "Send email",
      exact: true,
    })
    .uncheck();

  await page
    .getByRole("button", {
      name: "Review",
      exact: true,
    })
    .click();

  await page
    .getByRole("button", {
      name: "Send notice",
      exact: true,
    })
    .click();

  await expect(page).toHaveURL(/noticeId=/);

  const noticeId = new URL(page.url()).searchParams.get("noticeId");

  expect(noticeId).toBeTruthy();

  if (!noticeId) {
    throw new Error("Notice id missing");
  }

  const receipt = await request.get(`${base}/api/manager/notices/${noticeId}`, {
    headers: {
      Authorization: `Bearer ${manager.accessToken}`,
    },
  });

  expect(receipt.ok(), await receipt.text()).toBeTruthy();

  expect((await receipt.json()).delivery.total).toBe(1);

  await page.reload();

  await expect(
    page.getByRole("heading", {
      name: "Notification delivery",
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("columnheader", {
      name: "Failed",
      exact: true,
    }),
  ).toBeVisible();

  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
