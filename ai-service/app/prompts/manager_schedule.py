MANAGER_SCHEDULE_PROMPT = """
TASK:
Suggest a recurring schedule for a SportHub group course.

You may suggest changes to:
- startDate
- numSessions
- scheduleRules

You must NOT change:
- sportId
- coachId
- defaultRoomId

Rules:

1. numSessions must be between 1 and 100.
2. dayOfWeek:
   0 = Sunday
   1 = Monday
   2 = Tuesday
   3 = Wednesday
   4 = Thursday
   5 = Friday
   6 = Saturday
3. startTimeLocal must use HH:mm.
4. Do not return duplicate schedule rules.
5. startDate must fall on one of the proposed weekdays.
6. Suggest practical class times.
7. Do not claim that availability is confirmed.
8. Return valid JSON only.
9. Do not include markdown fences.

Required output:

{
  "startDate": "YYYY-MM-DD",
  "numSessions": 12,
  "scheduleRules": [
    {
      "dayOfWeek": 1,
      "startTimeLocal": "18:00"
    }
  ],
  "rationale": "Short explanation"
}
"""