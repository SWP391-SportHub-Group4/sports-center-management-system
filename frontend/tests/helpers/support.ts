import type { Page } from "@playwright/test";

export const requestId = "22222222-2222-4222-8222-222222222222";
export const secondRequestId = "44444444-4444-4444-8444-444444444444";
export const memberId = "11111111-1111-4111-8111-111111111111";
export const meId = "33333333-3333-4333-8333-333333333333";
export const otherStaffId = "55555555-5555-4555-8555-555555555555";
export const coachStaffId = "66666666-6666-4666-8666-666666666666";

export type SupportRole = "CENTER_MANAGER" | "RECEPTIONIST" | "MEMBER";

export interface SupportMockState {
  /** Wire status: OPEN (unassigned), ASSIGNED, IN_PROGRESS, DONE or REJECTED. */
  status: string;
  /** User id of the current handler; empty while unassigned. */
  assigned: string;
  note: string;
  /** Make the queue endpoint fail. */
  error: boolean;
  /** Make every write fail with a 403, like a non-assignee would get. */
  forbidWrites: boolean;
  /** False when the handler is inactive or cannot work requests; staff may then take the request over. */
  assigneeCanAct: boolean;
  empty: boolean;
  multiple: boolean;
  role: SupportRole;
}

const names: Record<string, string> = {
  [meId]: "Desk handler",
  [otherStaffId]: "Other handler",
};

/**
 * Mocks the support API the way the backend behaves: only the current handler may act, and
 * a request moves OPEN -> ASSIGNED -> IN_PROGRESS -> DONE or REJECTED.
 */
export async function installSupport(
  page: Page,
  initial: Partial<SupportMockState> = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem("sporthub.accessToken", "support-test");
    localStorage.setItem("sporthub_lang", "en");
  });
  const state: SupportMockState = {
    status: "OPEN",
    assigned: "",
    note: "",
    error: false,
    forbidWrites: false,
    assigneeCanAct: true,
    empty: false,
    multiple: false,
    role: "CENTER_MANAGER",
    ...initial,
  };
  const queries: URL[] = [];
  const writes: { path: string; body: Record<string, string> }[] = [];

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    const member = {
      userId: memberId,
      fullName: "Member An",
      email: "an@example.com",
      role: "MEMBER",
      status: "ACTIVE",
      sportIds: [],
    };
    const row = {
      requestId,
      memberId,
      memberName: "Member An",
      memberEmail: "an@example.com",
      recordedByUserId: memberId,
      category: "GENERAL",
      subject: "Help with membership",
      description: "Please review my membership.\n<img src=x onerror=alert(1)>",
      status: state.status,
      createdAt: "2026-10-18T03:00:00Z",
      updatedAt: "2026-10-18T04:00:00Z",
      closedAt: ["DONE", "REJECTED"].includes(state.status)
        ? "2026-10-18T05:00:00Z"
        : null,
      assignedToUserId: state.assigned || null,
      assignedToName: state.assigned ? names[state.assigned] : null,
      progressNote: state.note || null,
      channel: "ONLINE",
      assigneeCanAct: state.assigneeCanAct,
    };

    if (path === "/api/users/me")
      return json(
        state.role === "MEMBER"
          ? member
          : {
              userId: meId,
              role: state.role,
              fullName: "Desk handler",
              email: "handler@example.com",
              sportIds: [],
            },
      );
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path === "/api/manager/requests/summary") return json({ support: 1 });

    if (req.method() === "POST" && path.includes("/member-support-requests/")) {
      const body = req.postDataJSON();
      writes.push({ path, body });
      if (
        state.forbidWrites ||
        (state.assigned &&
          state.assigned !== meId &&
          !(path.endsWith("/assign") && !state.assigneeCanAct))
      )
        return route.fulfill({
          status: 403,
          json: {
            error: "support_not_assignee",
            message:
              "Only the staff member assigned to this request can update it.",
          },
        });
      if (path.endsWith("/assign")) {
        state.assigned = body.assigneeUserId;
        state.status = "ASSIGNED";
      }
      if (path.endsWith("/progress")) {
        state.note = body.note;
        state.status = "IN_PROGRESS";
      }
      if (path.endsWith("/done")) {
        state.note = body.reason;
        state.status = "DONE";
      }
      if (path.endsWith("/reject")) {
        state.note = body.reason;
        state.status = "REJECTED";
      }
      return json({ requestId });
    }
    if (req.method() === "POST" && path === "/api/member-support-requests") {
      // Creation is multipart (it can carry up to 3 images); read its text fields into a plain object.
      const raw = req.postData() ?? "";
      const body = (req.headers()["content-type"] ?? "").includes("multipart")
        ? Object.fromEntries(
            [...raw.matchAll(/name="([^"]+)"\r\n\r\n([^\r]*)\r\n/g)].map(
              (m) => [m[1], m[2]],
            ),
          )
        : req.postDataJSON();
      writes.push({ path, body });
      return json({ requestId });
    }

    if (path === "/api/member-support-requests/assignees")
      return json([
        {
          userId: meId,
          name: "Desk handler",
          email: "handler@example.com",
          role:
            state.role === "CENTER_MANAGER" ? "CenterManager" : "Receptionist",
        },
        {
          userId: otherStaffId,
          name: "Other handler",
          email: "other@example.com",
          role: "Receptionist",
        },
        // The backend only offers coaches to managers.
        ...(state.role === "CENTER_MANAGER"
          ? [
              {
                userId: coachStaffId,
                name: "Coach Hao",
                email: "coach@example.com",
                role: "Coach",
              },
            ]
          : []),
      ]);
    if (path === "/api/member-support-requests/stats")
      return json({
        open: 1,
        assigned: 0,
        inProgress: 0,
        done: 0,
        rejected: 0,
      });
    if (path === "/api/member-support-requests/queue") {
      queries.push(url);
      if (state.error)
        return route.fulfill({
          status: 500,
          json: { error: "unavailable", message: "Support unavailable" },
        });
      const second = {
        ...row,
        requestId: secondRequestId,
        subject: "Court booking question",
        memberName: "Member Binh",
        memberEmail: "binh@example.com",
        category: "CLASS",
        status: "OPEN",
        assignedToUserId: null,
        assignedToName: null,
        progressNote: null,
      };
      return json({
        items: state.empty ? [] : state.multiple ? [row, second] : [row],
        totalCount: state.empty ? 0 : 21,
        page: Number(url.searchParams.get("page")),
        pageSize: 20,
      });
    }
    if (path === `/api/member-support-requests/${requestId}`) return json(row);
    if (path === `/api/member-support-requests/${requestId}/events`)
      return json([]);
    if (path === "/api/member-support-requests") return json([]);
    if (path === `/api/users/${memberId}`) return json(member);
    if (path === "/api/users")
      return json({ items: [member], totalCount: 1, page: 1, pageSize: 20 });
    if (path === "/api/support/requests/mine")
      return json([{ ...row, response: state.note || null }]);
    return json([]);
  });
  return { state, queries, writes };
}
