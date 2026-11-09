# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: manager-operations.spec.ts >> threshold and capacity guards stop invalid drafts
- Location: tests\manager-operations.spec.ts:730:5

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Next', exact: true })
    - locator resolved to <button disabled title="Next" aria-label="Next" data-direction="next" aria-describedby="_r_1_" class="btn course-editor-module__gFdgfq__arrowButton">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    82 × waiting for element to be visible, enabled and stable
       - element is not enabled
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - link "Skip to main content" [ref=e5] [cursor=pointer]:
        - /url: "#main-content"
      - banner [ref=e6]:
        - generic [ref=e7]:
          - link "Sport Hub" [ref=e8] [cursor=pointer]:
            - /url: /manager
            - generic [ref=e9]:
              - text: Sport
              - generic [ref=e10]: Hub
          - generic [ref=e11]:
            - button "Notifications (0)" [ref=e13] [cursor=pointer]
            - button "Manager" [ref=e19] [cursor=pointer]
            - button "Open navigation menu" [ref=e24] [cursor=pointer]
      - main [ref=e26]:
        - heading "Create class" [level=1] [ref=e28]
        - generic [ref=e30]:
          - link "Back to list" [ref=e31] [cursor=pointer]:
            - /url: /manager/classes
          - generic [ref=e33]:
            - list "Class setup progress" [ref=e34]:
              - listitem [ref=e35]: 1. Class information
              - listitem [ref=e36]: 2. Coach, room & schedule
              - listitem [ref=e37]: 3. Tuition & cost
              - listitem [ref=e38]: 4. Review generated sessions
            - generic [ref=e39]:
              - group [ref=e40]:
                - generic [ref=e41]:
                  - generic [ref=e42]:
                    - generic [ref=e43]:
                      - text: Coach *
                      - generic [ref=e44]: (required)
                    - combobox "Coach" [ref=e45]:
                      - option "—"
                      - option "Coach Linh" [selected]
                  - generic [ref=e46]:
                    - generic [ref=e47]:
                      - text: Room *
                      - generic [ref=e48]: (required)
                    - combobox "Room" [ref=e49]:
                      - option "—"
                      - option "Court A" [selected]
                    - generic [ref=e50]:
                      - text: Choose an active room. Rooms are shared across sports.
                      - link "Manage rooms" [ref=e51] [cursor=pointer]:
                        - /url: /manager/facilities
                  - generic [ref=e52]:
                    - generic [ref=e53]:
                      - text: Capacity *
                      - generic [ref=e54]: (required)
                    - spinbutton "Capacity" [ref=e55]
                  - generic [ref=e56]:
                    - generic [ref=e57]:
                      - text: Course start date *
                      - generic [ref=e58]: (required)
                    - textbox "Course start date" [active] [ref=e59]: 2030-10-03
                    - generic [ref=e60]: Choose an opening date within one year from today (Vietnam time).
                  - generic [ref=e61]:
                    - generic [ref=e62]:
                      - text: Number of sessions *
                      - generic [ref=e63]: (required)
                    - spinbutton "Number of sessions" [ref=e64]: "2"
                - group "Weekly schedule" [ref=e65]:
                  - generic [ref=e67]:
                    - generic [ref=e68]:
                      - generic [ref=e69]: Day
                      - combobox "Day" [ref=e70]:
                        - option "Sunday"
                        - option "Monday"
                        - option "Tuesday"
                        - option "Wednesday"
                        - option "Thursday" [selected]
                        - option "Friday"
                        - option "Saturday"
                    - generic [ref=e71]:
                      - generic [ref=e72]:
                        - text: Start *
                        - generic [ref=e73]: (required)
                      - textbox "Start" [ref=e74]
                    - button "Remove" [disabled] [ref=e75]
                  - button "Add" [ref=e76] [cursor=pointer]
                - alert [ref=e77]:
                  - strong [ref=e81]: Couldn’t load scheduling settings. Try again.
                  - button "Retry" [ref=e82] [cursor=pointer]
                - region "Existing schedule" [ref=e83]:
                  - generic [ref=e84]:
                    - generic [ref=e85]:
                      - heading "Existing schedule" [level=3] [ref=e86]
                      - paragraph [ref=e87]: 30/09/2030 – 06/10/2030
                    - group "Week navigation" [ref=e88]:
                      - button "Previous week" [ref=e89] [cursor=pointer]
                      - button "Current week" [ref=e92] [cursor=pointer]
                      - button "Next week" [ref=e93] [cursor=pointer]
                  - region "Calendar event details" [ref=e96]:
                    - generic "Calendar event details" [ref=e97]:
                      - generic [ref=e98]:
                        - strong [ref=e100]:
                          - time [ref=e101]: Mon (30-09)
                        - paragraph [ref=e103]: No activities
                      - generic [ref=e104]:
                        - strong [ref=e106]:
                          - time [ref=e107]: Tue (01-10)
                        - paragraph [ref=e109]: No activities
                      - generic [ref=e110]:
                        - strong [ref=e112]:
                          - time [ref=e113]: Wed (02-10)
                        - paragraph [ref=e115]: No activities
                      - generic [ref=e116]:
                        - strong [ref=e118]:
                          - time [ref=e119]: Thu (03-10)
                        - generic [ref=e120]:
                          - article "Badminton autumn" [ref=e121]:
                            - generic [ref=e122]: Class
                            - generic [ref=e124]:
                              - generic [ref=e125]: 18:00–19:30
                              - generic [ref=e126]: Coach Linh
                            - generic [ref=e127]: Scheduled
                          - article "Rental by An" [ref=e128]:
                            - generic [ref=e129]: Court rental
                            - generic [ref=e131]: 20:00–21:00
                            - generic [ref=e133]: Confirmed
                      - generic [ref=e134]:
                        - strong [ref=e136]:
                          - time [ref=e137]: Fri (04-10)
                        - paragraph [ref=e139]: No activities
                      - generic [ref=e140]:
                        - strong [ref=e142]:
                          - time [ref=e143]: Sat (05-10)
                        - paragraph [ref=e145]: No activities
                      - generic [ref=e146]:
                        - strong [ref=e148]:
                          - time [ref=e149]: Sun (06-10)
                        - paragraph [ref=e151]: No activities
              - generic [ref=e152]:
                - button "Previous" [ref=e153] [cursor=pointer]
                - button "Next" [disabled] [ref=e156]
                - button "Cancel" [ref=e159] [cursor=pointer]
    - contentinfo "Footer" [ref=e160]:
      - generic [ref=e161]:
        - generic [ref=e162]:
          - paragraph [ref=e163]: SportHub
          - paragraph [ref=e164]: A training home for badminton, basketball and gym.
        - region [ref=e165]:
          - heading "Sports" [level=2] [ref=e166]
          - list [ref=e167]:
            - listitem [ref=e168]: Badminton
            - listitem [ref=e169]: Basketball
            - listitem [ref=e170]: Gym & conditioning
        - region [ref=e171]:
          - heading "Contact" [level=2] [ref=e172]
          - list [ref=e173]:
            - listitem [ref=e174]:
              - generic [ref=e177]:
                - generic [ref=e178]: Phone
                - link "+84 28 0000 0000" [ref=e179] [cursor=pointer]:
                  - /url: tel:+842800000000
            - listitem [ref=e180]:
              - generic [ref=e184]:
                - generic [ref=e185]: Email
                - link "contact@sporthub.example" [ref=e186] [cursor=pointer]:
                  - /url: mailto:contact@sporthub.example
            - listitem [ref=e187]:
              - generic [ref=e191]:
                - generic [ref=e192]: Visit us
                - text: 123 Sports Avenue, District 1, Ho Chi Minh City
            - listitem [ref=e193]:
              - generic [ref=e197]:
                - generic [ref=e198]: Opening hours
                - text: Daily · 06:00 – 22:00
      - paragraph [ref=e199]: © 2026 SportHub
  - alert [ref=e200]
```

# Test source

```ts
  229 |       )
  230 |     )
  231 |       return route.fulfill({ json: paged([]) });
  232 |     if (p === "/api/class-sessions/" + sessionId)
  233 |       return route.fulfill({ json: session });
  234 |     if (p === "/api/manager/court-schedule")
  235 |       return route.fulfill({ json: schedule });
  236 |     if (p === "/api/audit-logs")
  237 |       return route.fulfill({
  238 |         json: paged([
  239 |           {
  240 |             auditId: noticeId,
  241 |             userId: managerId,
  242 |             actorEmail: "manager@example.com",
  243 |             action: "CREATE_CLASS",
  244 |             targetEntity: "Class",
  245 |             targetId: "1",
  246 |             timestamp: "2030-09-01T00:00:00Z",
  247 |             oldValue: null,
  248 |             newValue: '{"status":"Draft"}',
  249 |           },
  250 |         ]),
  251 |       });
  252 |     if (p === "/api/manager/room-blocks") return route.fulfill({ json: [] });
  253 |     if (p === "/api/manager/people")
  254 |       return route.fulfill({ json: paged([coach]) });
  255 |     if (p === "/api/users")
  256 |       return route.fulfill({
  257 |         json: paged(
  258 |           url.searchParams.get("role") === "COACH"
  259 |             ? [coach]
  260 |             : [
  261 |                 {
  262 |                   userId: memberId,
  263 |                   fullName: "Member An",
  264 |                   email: "an@example.com",
  265 |                   role: "MEMBER",
  266 |                   status: "ACTIVE",
  267 |                 },
  268 |               ],
  269 |         ),
  270 |       });
  271 |     if (p === `/api/manager/notices/${noticeId}`)
  272 |       return route.fulfill({ json: { noticeId, delivery } });
  273 |     if (p === `/api/manager/incidents/${noticeId}/notifications`)
  274 |       return route.fulfill({ json: delivery });
  275 |     if (p === "/api/refunds") return route.fulfill({ json: paged([]) });
  276 |     if (p === "/api/reports/revenue")
  277 |       return route.fulfill({
  278 |         json: {
  279 |           totalCollected: 100000,
  280 |           pointsRedeemedVnd: 200000,
  281 |           pointsIssued: 25,
  282 |           outstandingPoints: 525,
  283 |         },
  284 |       });
  285 |     if (p === "/api/reports/membership-period")
  286 |       return route.fulfill({
  287 |         json: { newMembers: 2, activeMembersAtPeriodEnd: 7 },
  288 |       });
  289 |     if (p === "/api/reports/class-enrollment")
  290 |       return route.fulfill({
  291 |         json: {
  292 |           totalClasses: 1,
  293 |           totalCapacity: 12,
  294 |           totalConfirmed: 4,
  295 |           totalActiveHolds: 6,
  296 |           fillRatio: 1 / 3,
  297 |           classes: [],
  298 |         },
  299 |       });
  300 |     return route.fulfill({
  301 |       status: 404,
  302 |       json: { code: "fixture_missing", message: p },
  303 |     });
  304 |   });
  305 | }
  306 | test.beforeEach(async ({ page }, info) =>
  307 |   fixture(
  308 |     page,
  309 |     info.title.startsWith("Vietnamese copy") ? "vi" : "en",
  310 |     info.title.startsWith("Member cannot") ? "MEMBER" : "CENTER_MANAGER",
  311 |   ),
  312 | );
  313 | async function fillDraft(page: Page, proceed = true) {
  314 |   await page.goto("/manager/classes/new");
  315 |   await page.getByLabel(en.operations.code, { exact: true }).fill("TEST-NEW");
  316 |   await page
  317 |     .getByLabel(en.operations.name, { exact: true })
  318 |     .fill("New badminton course");
  319 |   await page.getByLabel(en.operations.sport, { exact: true }).selectOption("3");
  320 |   await page.getByLabel(en.operations.duration, { exact: true }).fill("90");
  321 |   await page
  322 |     .getByRole("button", { name: en.operations.next, exact: true })
  323 |     .click();
  324 |   await page
  325 |     .getByLabel(en.operations.coach, { exact: true })
  326 |     .selectOption(coachId);
  327 |   await page.getByLabel(en.operations.room, { exact: true }).selectOption("7");
  328 |   await page.getByLabel(en.operations.capacity, { exact: true }).fill("12");
> 329 |   await page.getByLabel(en.operations.numSessions, { exact: true }).fill("2");
      |      ^ Error: locator.click: Test timeout of 45000ms exceeded.
  330 |   await page
  331 |     .getByLabel(en.operations.startDate, { exact: true })
  332 |     .fill("2030-10-03");
  333 |   await page.getByLabel(en.operations.day, { exact: true }).selectOption("4");
  334 |   await page.getByLabel(en.operations.start, { exact: true }).fill("18:00");
  335 |   if (!proceed) return;
  336 |   await page
  337 |     .getByRole("button", { name: en.operations.next, exact: true })
  338 |     .click();
  339 |   await page
  340 |     .getByLabel(en.classWorkspace.price, { exact: true })
  341 |     .fill("300000");
  342 |   await page
  343 |     .getByLabel(en.classWorkspace.cost, { exact: true })
  344 |     .fill("1800000");
  345 | }
  346 | 
  347 | test("M05 deactivated coach details reassign the main class and refresh affected assignments", async ({
  348 |   page,
  349 | }) => {
  350 |   let assigned = false;
  351 |   let writes = 0;
  352 |   await page.route("**/api/manager/classes/1/lead-coach/candidates", (route) =>
  353 |     route.fulfill({
  354 |       json: {
  355 |         version: 1,
  356 |         currentCoachId: memberId,
  357 |         remainingSessionCount: 2,
  358 |         coaches: [{ coachId, fullName: "Coach Linh" }],
  359 |       },
  360 |     }),
  361 |   );
  362 |   await page.route("**/api/manager/classes/1/lead-coach", async (route) => {
  363 |     expect(route.request().postDataJSON()).toEqual({
  364 |       coachId,
  365 |       expectedVersion: 1,
  366 |       reason: "Replacement audit",
  367 |     });
  368 |     assigned = true;
  369 |     writes++;
  370 |     return route.fulfill({ status: 204 });
  371 |   });
  372 |   await page.route("**/api/manager/classes/1", (route) =>
  373 |     route.fulfill({
  374 |       json: {
  375 |         ...course,
  376 |         coachId: memberId,
  377 |         coachName: "Deactivated coach",
  378 |         status: "PUBLISHED",
  379 |       },
  380 |     }),
  381 |   );
  382 |   await page.route("**/api/manager/coach-coverage**", async (route) => {
  383 |     expect(route.request().method()).toBe("GET");
  384 |     return route.fulfill({
  385 |       json: assigned
  386 |         ? []
  387 |         : [
  388 |             {
  389 |               coachId: memberId,
  390 |               coachName: "Deactivated coach",
  391 |               coachEmail: "deactivated@example.com",
  392 |               affectedClasses: 1,
  393 |               futureSessions: 1,
  394 |               activeRelationships: 1,
  395 |               mainClasses: [{ classId: 1, name: course.name, sportId: 3 }],
  396 |               sessions: [],
  397 |             },
  398 |           ],
  399 |     });
  400 |   });
  401 |   await page.route(`**/api/manager/coaches/${memberId}`, (route) =>
  402 |     route.fulfill({
  403 |       json: { ...coach, userId: memberId, status: "DEACTIVATED" },
  404 |     }),
  405 |   );
  406 |   await page.goto(`/manager/coaches/${memberId}`);
  407 |   await page
  408 |     .getByRole("button", { name: "Change Lead Coach", exact: true })
  409 |     .click();
  410 |   await page.getByRole("radio").check();
  411 |   await page
  412 |     .getByRole("textbox", { name: "Reason for change" })
  413 |     .fill("Replacement audit");
  414 |   await page
  415 |     .getByRole("button", { name: "Confirm Change", exact: true })
  416 |     .click();
  417 |   await expect(
  418 |     page.getByText("No assignments need a replacement."),
  419 |   ).toBeVisible();
  420 |   await page.reload();
  421 |   await expect(
  422 |     page.getByText("No assignments need a replacement."),
  423 |   ).toBeVisible();
  424 |   expect(writes).toBe(1);
  425 | });
  426 | 
  427 | test("M05 empty course cancellation confirms directly and cannot repeat after refresh", async ({
  428 |   page,
  429 | }) => {
```