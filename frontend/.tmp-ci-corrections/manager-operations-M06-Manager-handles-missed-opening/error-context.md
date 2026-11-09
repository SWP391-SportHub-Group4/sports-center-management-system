# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: manager-operations.spec.ts >> M06 Manager handles missed opening
- Location: tests\manager-operations.spec.ts:525:7

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator: getByRole('button', { name: 'Cancel class', exact: true })
Expected: enabled
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeEnabled" getByRole('button', { name: 'Cancel class', exact: true }) with timeout 8000ms
  - waiting for getByRole('button', { name: 'Cancel class', exact: true })

```

```yaml
- link "Skip to main content":
  - /url: "#main-content"
- banner:
  - link "Sport Hub":
    - /url: /manager
  - button "Notifications (0)"
  - button "Manager"
  - button "Open navigation menu"
- main:
  - heading "Class details" [level=1]
  - link "Back to list":
    - /url: /manager/classes
  - heading "Badminton autumn" [level=2]
  - paragraph: BAD-01
  - text: Published
  - button "Edit class"
  - link "View class schedule":
    - /url: /manager/schedule?classId=1
  - term: Sport
  - definition: Badminton
  - term: Coach
  - definition: Coach Linh
  - term: Room
  - definition: Court A
  - figure "Class capacity":
    - strong: 4/12
    - text: Enrolled
    - heading "Class capacity" [level=3]
    - term: Enrolled
    - definition: "4"
    - term: Seat holds
    - definition: "6"
    - term: Available seats
    - definition: "2"
  - tablist "Details":
    - tab "Overview"
    - tab "Sessions"
    - tab "Students"
    - tab "Management" [selected]
  - tabpanel "Management":
    - group "Management":
      - button "Enrollment"
      - button "Opening conditions" [pressed]
      - button "History"
    - heading "Opening conditions" [level=2]
    - paragraph:
      - text: "Paid enrollments:"
      - strong: 4 / 6
    - text: At risk
    - term: Deadline
    - definition: 03/10/2030, 00:00
    - term: Tuition per student (VND)
    - definition: 300,000 ₫
    - term: Total class cost (VND)
    - definition: 1,800,000 ₫
    - button "Edit pricing"
    - region "Cancel class":
      - heading "Cancel class" [level=3]
      - button "Cancel class and notify members"
- contentinfo "Footer":
  - paragraph: SportHub
  - paragraph: A training home for badminton, basketball and gym.
  - region "Sports":
    - heading "Sports" [level=2]
    - list:
      - listitem: Badminton
      - listitem: Basketball
      - listitem: Gym & conditioning
  - region "Contact":
    - heading "Contact" [level=2]
    - list:
      - listitem:
        - text: Phone
        - link "+84 28 0000 0000":
          - /url: tel:+842800000000
      - listitem:
        - text: Email
        - link "contact@sporthub.example":
          - /url: mailto:contact@sporthub.example
      - listitem: Visit us 123 Sports Avenue, District 1, Ho Chi Minh City
      - listitem: Opening hours Daily · 06:00 – 22:00
  - paragraph: © 2026 SportHub
- alert
```

# Test source

```ts
  484 |   });
  485 |   await page.route("**/api/manager/incidents?*", (route) =>
  486 |     route.fulfill({
  487 |       json: paged([
  488 |         {
  489 |           incidentId: noticeId,
  490 |           scope: "ROOM",
  491 |           roomId: 7,
  492 |           roomName: "Court A",
  493 |           reason: "Audit incident",
  494 |           startAtUtc: session.startAtUtc,
  495 |           endAtUtc: session.endAtUtc,
  496 |           createdAtUtc: "2030-10-01T00:00:00Z",
  497 |           cancelledAtUtc: null,
  498 |         },
  499 |       ]),
  500 |     }),
  501 |   );
  502 |   await page.goto("/manager/incidents");
  503 |   await expect(
  504 |     page.getByRole("button", { name: "Abandon and undo", exact: true }),
  505 |   ).toHaveCount(0);
  506 |   await page
  507 |     .getByRole("button", { name: "Incident history", exact: true })
  508 |     .click();
  509 |   const dialog = page.getByRole("dialog", {
  510 |     name: "Incident history",
  511 |     exact: true,
  512 |   });
  513 |   await expect(
  514 |     dialog.getByText("Audit incident", { exact: true }),
  515 |   ).toBeVisible();
  516 |   await expect(
  517 |     dialog.getByRole("link", { name: en.operations.details, exact: true }),
  518 |   ).toHaveAttribute("href", "/manager/incidents/" + noticeId);
  519 |   await page.keyboard.press("Escape");
  520 |   await expect(dialog).toHaveCount(0);
  521 |   expect(legacyRequests).toBe(0);
  522 | });
  523 | 
  524 | for (const late of [false, true]) {
  525 |   test(`M06 Manager handles ${late ? "missed opening" : "response deadline and waiver"}`, async ({
  526 |     page,
  527 |   }) => {
  528 |     let waivers = 0;
  529 |     await page.route("**/api/manager/classes/1", (route) =>
  530 |       route.fulfill({
  531 |         json: {
  532 |           ...course,
  533 |           status: "PUBLISHED",
  534 |           thresholdStatus: waivers ? "WAIVED_BY_MANAGER" : "AT_RISK",
  535 |           firstSessionStartUtc: late
  536 |             ? "2020-10-01T02:00:00Z"
  537 |             : "2030-10-03T11:00:00Z",
  538 |           thresholdResponseDeadlineUtc: late ? null : "2030-10-02T11:00:00Z",
  539 |         },
  540 |       }),
  541 |     );
  542 |     await page.route("**/api/manager/classes/1/threshold/waive", (route) => {
  543 |       expect(route.request().postDataJSON()).toEqual({
  544 |         reason: "Run this class with fewer members",
  545 |       });
  546 |       waivers++;
  547 |       return route.fulfill({ status: 204 });
  548 |     });
  549 |     if (late)
  550 |       await page.route(
  551 |         "**/api/manager/classes/1/cancellation-preview",
  552 |         (route) =>
  553 |           route.fulfill({
  554 |             json: {
  555 |               canCancel: true,
  556 |               refundsImmediately: true,
  557 |               previewToken: "missed-opening",
  558 |               members: [],
  559 |               totalSessions: 2,
  560 |               sessionsNotProvided: 2,
  561 |               confirmedCount: 4,
  562 |               activeHoldCount: 0,
  563 |               refundPoints: 0,
  564 |             },
  565 |           }),
  566 |       );
  567 |     await page.goto("/manager/classes/1?tab=threshold");
  568 |     await expect(
  569 |       page
  570 |         .locator("summary")
  571 |         .filter({ hasText: "How opening conditions work" }),
  572 |     ).toHaveCount(0);
  573 |     const waive = page.getByRole("button", {
  574 |       name: "Approve below threshold",
  575 |       exact: true,
  576 |     });
  577 |     if (late) {
  578 |       await expect(waive).toHaveCount(0);
  579 |       await expect(
  580 |         page.getByRole("button", {
  581 |           name: en.classWorkspace.cancelClass,
  582 |           exact: true,
  583 |         }),
> 584 |       ).toBeEnabled();
      |         ^ Error: expect(locator).toBeEnabled() failed
  585 |     } else {
  586 |       await expect(
  587 |         page.getByText(/refunds remaining enrollments/),
  588 |       ).toBeVisible();
  589 |       await waive.click();
  590 |       const dialog = page.getByRole("dialog", {
  591 |         name: "Approve below threshold",
  592 |         exact: true,
  593 |       });
  594 |       await dialog
  595 |         .getByLabel(en.operations.reason, { exact: true })
  596 |         .fill("Run this class with fewer members");
  597 |       await dialog
  598 |         .getByRole("button", { name: "Approve below threshold", exact: true })
  599 |         .click();
  600 |       await expect(dialog).toHaveCount(0);
  601 |       expect(waivers).toBe(1);
  602 |     }
  603 |     await page.setViewportSize({ width: 390, height: 844 });
  604 |     expect(
  605 |       await page
  606 |         .locator("main")
  607 |         .last()
  608 |         .evaluate((el) => el.scrollWidth <= el.clientWidth),
  609 |     ).toBe(true);
  610 |     await page.screenshot({
  611 |       path: `test-results/m06-manager-${late}.png`,
  612 |       fullPage: true,
  613 |     });
  614 |   });
  615 | }
  616 | 
  617 | test("M06 public course distinguishes enrollment from confirmation to run", async ({
  618 |   page,
  619 | }) => {
  620 |   let confirmed = false;
  621 |   await page.route("**/api/classes/1", (route) =>
  622 |     route.fulfill({
  623 |       json: {
  624 |         ...course,
  625 |         status: "PUBLISHED",
  626 |         enrollmentOpen: true,
  627 |         firstSessionStartUtc: "2030-10-03T11:00:00Z",
  628 |         openingConfirmed: confirmed,
  629 |       },
  630 |     }),
  631 |   );
  632 |   await page.route("**/api/classes/1/public-sessions", (route) =>
  633 |     route.fulfill({ json: [] }),
  634 |   );
  635 |   await page.goto("/courses/1");
  636 |   await expect(
  637 |     page.getByText("Opening not confirmed", { exact: true }),
  638 |   ).toBeVisible();
  639 |   await expect(page.getByText(/center is reviewing enrollment/)).toBeVisible();
  640 |   confirmed = true;
  641 |   await page.reload();
  642 |   await expect(
  643 |     page.getByText("Confirmed to run", { exact: true }),
  644 |   ).toBeVisible();
  645 |   await expect(
  646 |     page.getByText("Opening not confirmed", { exact: true }),
  647 |   ).toHaveCount(0);
  648 | });
  649 | 
  650 | test("class filters survive reload and reset pagination", async ({ page }) => {
  651 |   await page.goto("/manager/classes?page=3");
  652 |   await page
  653 |     .getByRole("combobox", { name: en.operations.status, exact: true })
  654 |     .selectOption("PUBLISHED");
  655 |   await page
  656 |     .getByRole("combobox", { name: en.operations.thresholdFilter, exact: true })
  657 |     .selectOption("AT_RISK");
  658 |   await expect(page).toHaveURL(/status=PUBLISHED/);
  659 |   await expect(page).toHaveURL(/thresholdStatus=AT_RISK/);
  660 |   await expect(page).not.toHaveURL(/page=3/);
  661 |   await page.reload();
  662 |   await expect(
  663 |     page.getByRole("combobox", {
  664 |       name: en.operations.thresholdFilter,
  665 |       exact: true,
  666 |     }),
  667 |   ).toHaveValue("AT_RISK");
  668 |   await expect(page.getByText(en.managerOperations.holdHint)).toHaveCount(0);
  669 | });
  670 | test("draft save is separate from publish and reviews every generated session", async ({
  671 |   page,
  672 | }) => {
  673 |   let creates = 0,
  674 |     publishes = 0;
  675 |   page.on("request", (r) => {
  676 |     if (r.method() === "POST" && r.url().endsWith("/publish")) publishes++;
  677 |   });
  678 |   await page.route("**/api/manager/classes", async (route) => {
  679 |     creates++;
  680 |     expect(route.request().postDataJSON()).toMatchObject({
  681 |       code: "TEST-NEW",
  682 |       sportId: 3,
  683 |       defaultRoomId: 7,
  684 |       numSessions: 2,
```