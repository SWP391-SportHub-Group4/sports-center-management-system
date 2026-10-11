import json
from typing import Any


def build_runtime_context(
    *,
    request: Any,
) -> str:
    """
    Build the runtime context sent to the LLM.

    This context contains:
    - the current form values;
    - the SportHub context enriched by the .NET backend;
    - selected Sport / Coach / Room;
    - CRUD operation information;
    - editable and locked fields.

    The returned value is already a JSON string.
    Do NOT json.dumps() it again in the caller.
    """

    context = {
        "sportId": request.sportId,
        "coachId": request.coachId,
        "defaultRoomId": request.defaultRoomId,
        "currentPreferences": {
            "startDate": request.startDate.isoformat(),
            "numSessions": request.numSessions,
            "scheduleRules": [
                rule.model_dump()
                for rule in request.scheduleRules
            ],
        },
        "sportHubContext": request.context,
    }

    return json.dumps(
        context,
        ensure_ascii=False,
        indent=2,
        default=str,
    )