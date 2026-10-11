def build_user_prompt(
    runtime_context: str,
) -> str:
    return f"""
SPORT_HUB_CONTEXT

{runtime_context}

END_SPORT_HUB_CONTEXT

TASK

Analyze the current Manager class scheduling operation.

Return exactly one schedule suggestion.

Use:
- selectedEntities;
- persistedEntity;
- proposedEntity;
- availabilityContext;
- retryContext when supplied.

CRUD RULES

If operation is CREATE:
- treat proposedEntity as an unsaved class draft.

If operation is UPDATE:
- persistedEntity is the current database state;
- proposedEntity is the current unsaved Manager form state;
- understand the difference before suggesting a schedule.

LOCKED FIELDS

Only propose changes to fields declared in editableFields.

Never modify fields declared in lockedFields.

Never silently change:
- sportId;
- coachId;
- defaultRoomId;
- capacity;
- price;
- costAmount.

AVAILABILITY

Use availabilityContext to avoid known room and coach busy intervals.

Availability context is advisory.

SportHub backend validation remains authoritative.

AUTO RETRY

If retryContext exists:

- the previous AI suggestion failed backend validation;
- inspect retryContext.conflicts;
- understand which generated sessions conflicted;
- inspect the conflict reasons;
- propose a materially different recurring schedule;
- do not repeat the same failing recurrence rule;
- prefer a different time and/or weekday that avoids known conflicts;
- preserve every locked field;
- do not claim that the new schedule is confirmed available.

Do not invent:
- application records;
- IDs;
- names;
- rooms;
- coaches;
- capacities;
- statuses.

Do not claim that:
- the class was saved;
- the class was published;
- the class was cancelled;
- a database mutation succeeded;
- room availability is finally confirmed;
- coach availability is finally confirmed.

RATIONALE

The rationale should briefly explain:
- the CRUD operation;
- selected sport;
- selected coach;
- selected room;
- proposed recurrence;
- how known busy intervals or retry conflicts influenced the choice.

Return valid JSON only.

Do not include markdown fences.
"""