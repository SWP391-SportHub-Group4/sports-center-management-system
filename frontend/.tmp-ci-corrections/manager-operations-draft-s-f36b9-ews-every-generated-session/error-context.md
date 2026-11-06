# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: manager-operations.spec.ts >> draft save is separate from publish and reviews every generated session
- Location: tests\manager-operations.spec.ts:670:5

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: browserContext._wrapApiCall: file data stream has unexpected number of bytes
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