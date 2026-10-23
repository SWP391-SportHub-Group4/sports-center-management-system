import { expect, test } from "@playwright/test";

const coach = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const member = "33333333-3333-4333-8333-333333333333";

for (const width of [1440, 390])
  test(`coach handles an assigned support request at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    let status = "ASSIGNED",
      note = "";
    const writes: string[] = [],
      privateReads: string[] = [];
    await page.addInitScript(() =>
      localStorage.setItem("sporthub.accessToken", "fixture"),
    );
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (value: unknown) => route.fulfill({ json: value });
      const row = {
        requestId,
        memberId: member,
        memberName: "Member An",
        memberEmail: "an@example.test",
        recordedByUserId: "manager",
        category: "CLASS",
        subject: "Training plan assistance",
        description:
          "Please help the member adjust their badminton training plan.",
        status,
        progressNote: note,
        assignedToUserId: coach,
        assignedToName: "Coach Linh",
        channel: "COUNTER",
        createdAt: "2026-10-23T02:00:00Z",
        attachments: [],
      };
      if (path === "/api/users/me")
        return json({
          userId: coach,
          role: "COACH",
          fullName: "Coach Linh",
          email: "coach@example.test",
          sportIds: [3],
        });
      if (path.includes("notifications"))
        return json(path.endsWith("unread-count") ? { count: 0 } : []);
      if (path === "/api/member-support-requests/stats")
        return json({
          open: 0,
          assigned: status === "ASSIGNED" ? 1 : 0,
          inProgress: status === "IN_PROGRESS" ? 1 : 0,
          done: status === "DONE" ? 1 : 0,
          rejected: 0,
        });
      if (path === "/api/member-support-requests/queue")
        return json({ items: [row], totalCount: 1, page: 1, pageSize: 20 });
      if (path === `/api/member-support-requests/${requestId}`)
        return json(row);
      if (path.endsWith("/events"))
        return json([
          {
            eventId: "event",
            type: "ASSIGNED",
            note: "Review the training plan",
            actorName: "Manager Alex",
            actorRole: "CenterManager",
            targetName: "Coach Linh",
            createdAt: row.createdAt,
          },
        ]);
      if (path.endsWith("/progress") || path.endsWith("/done")) {
        writes.push(path);
        const body = route.request().postDataJSON();
        status = path.endsWith("/done") ? "DONE" : "IN_PROGRESS";
        note = body.note ?? body.reason;
        return json({ ...row, status, progressNote: note });
      }
      if (
        path.includes("/packages") ||
        path === `/api/users/${member}` ||
        path.endsWith("/assignees")
      )
        privateReads.push(path);
      return json([]);
    });
    await page.goto(`/coach/support?request=${requestId}`);
    await expect(
      page.getByRole("heading", {
        name: "Training plan assistance",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Please help the member adjust their badminton training plan.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Manager Alex assigned it to Coach Linh", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Record a request for member",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Routing and escalation", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "View profile", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Update", exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel("Progress note", { exact: true })
      .fill("Reviewed the member's schedule.");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(
      page.getByText("Progress updated.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`coach-support-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("tab", { name: "Mark as done", exact: true }).click();
    await page
      .getByLabel("Resolution note", { exact: true })
      .fill("Updated the training plan with the member.");
    await page
      .getByRole("button", { name: "Mark as done", exact: true })
      .click();
    expect(writes).toHaveLength(1);
    await page
      .getByRole("button", { name: "Confirm done", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Final note", exact: true }),
    ).toContainText("Updated the training plan with the member.");
    expect(writes).toHaveLength(2);
    expect(privateReads).toEqual([]);
  });

test("manager can route a support request to the Coach department", async ({
  page,
}) => {
  const writes: unknown[] = [];
  await page.addInitScript(() =>
    localStorage.setItem("sporthub.accessToken", "fixture"),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (value: unknown) => route.fulfill({ json: value });
    const row = {
      requestId,
      memberId: member,
      memberName: "Member An",
      category: "CLASS",
      subject: "Training assistance",
      description: "Please review this training plan.",
      status: "OPEN",
      assignedToUserId: null,
      createdAt: "2026-10-23T02:00:00Z",
    };
    if (path === "/api/users/me")
      return json({
        userId: "manager",
        role: "CENTER_MANAGER",
        fullName: "Manager",
        sportIds: [],
      });
    if (path.includes("notifications"))
      return json(path.endsWith("unread-count") ? { count: 0 } : []);
    if (path.endsWith("/assignees"))
      return json([
        {
          userId: coach,
          name: "Coach Linh",
          role: "Coach",
          email: "coach@example.test",
        },
      ]);
    if (path.endsWith("/stats"))
      return json({
        open: 1,
        assigned: 0,
        inProgress: 0,
        done: 0,
        rejected: 0,
      });
    if (path.endsWith("/queue"))
      return json({ items: [row], totalCount: 1, page: 1, pageSize: 20 });
    if (path.endsWith("/assign")) {
      writes.push(route.request().postDataJSON());
      return json(row);
    }
    if (path === "/api/manager/requests/summary") return json({ support: 1 });
    if (path === `/api/users/${member}`) return json({ fullName: "Member An" });
    return json([]);
  });
  await page.goto("/manager/requests?type=support");
  await page.getByLabel("Department", { exact: true }).selectOption("coach");
  await page.getByLabel("Staff member", { exact: true }).selectOption(coach);
  await page
    .getByRole("button", { name: "Transfer request", exact: true })
    .click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ assigneeUserId: coach });
});
