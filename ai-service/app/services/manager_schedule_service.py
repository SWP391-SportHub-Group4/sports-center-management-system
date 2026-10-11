import json

from app.prompts.app_context import (
    APP_CONTEXT_PROMPT,
)
from app.prompts.manager_role import (
    MANAGER_ROLE_PROMPT,
)
from app.prompts.crud_rules import (
    CRUD_GOVERNANCE_PROMPT,
)
from app.prompts.manager_class_crud import (
    MANAGER_CLASS_CRUD_PROMPT,
)
from app.prompts.manager_schedule import (
    MANAGER_SCHEDULE_PROMPT,
)
from app.prompts.runtime_context import (
    build_runtime_context,
)
from app.prompts.user_prompt import (
    build_user_prompt,
)

from app.schemas.manager import (
    ManagerScheduleRequest,
    ManagerScheduleResponse,
)

from app.services.gemini_service import (
    GeminiService,
)


class ManagerScheduleService:
    def __init__(self) -> None:
        self.gemini = GeminiService()

    def suggest(
        self,
        request: ManagerScheduleRequest,
    ) -> ManagerScheduleResponse:
        """
        Generate one Manager schedule suggestion.

        The AI receives:
        1. SportHub application rules;
        2. Manager role restrictions;
        3. CRUD governance;
        4. Class CRUD semantics;
        5. Schedule task rules;
        6. Runtime SportHub context supplied by .NET.

        The result is still advisory.
        Backend validation remains authoritative.
        """

        system_prompt = "\n\n".join(
            [
                APP_CONTEXT_PROMPT,
                MANAGER_ROLE_PROMPT,
                CRUD_GOVERNANCE_PROMPT,
                MANAGER_CLASS_CRUD_PROMPT,
                MANAGER_SCHEDULE_PROMPT,
            ]
        )

        runtime_context = build_runtime_context(
            request=request,
        )
        print("\n========== MANAGER AI RUNTIME CONTEXT ==========")
        print(runtime_context)
        print("================================================\n")

        user_prompt = build_user_prompt(
            runtime_context,
        )

        raw_response = self.gemini.generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        )

        try:
            parsed = json.loads(
                raw_response
            )
        except json.JSONDecodeError as exc:
            raise ValueError(
                "AI returned invalid JSON."
            ) from exc

        try:
            result = ManagerScheduleResponse(
                **parsed
            )
        except Exception as exc:
            raise ValueError(
                "AI returned an invalid schedule response."
            ) from exc

        self._validate_business_shape(
            result
        )

        return result

    @staticmethod
    def _validate_business_shape(
        result: ManagerScheduleResponse,
    ) -> None:
        """
        Validate structural scheduling rules that should
        not be trusted solely to the language model.

        Actual room/coach availability is NOT checked here.
        SportHub backend remains responsible for that.
        """

        if not result.scheduleRules:
            raise ValueError(
                "AI returned no schedule rules."
            )

        unique_rules = {
            (
                rule.dayOfWeek,
                rule.startTimeLocal,
            )
            for rule in result.scheduleRules
        }

        if len(unique_rules) != len(
            result.scheduleRules
        ):
            raise ValueError(
                "AI returned duplicate schedule rules."
            )

        # Python:
        # Monday = 0
        # Tuesday = 1
        # ...
        # Sunday = 6
        #
        # SportHub:
        # Sunday = 0
        # Monday = 1
        # ...
        # Saturday = 6

        python_weekday = (
            result.startDate.weekday()
        )

        sporthub_weekday = (
            python_weekday + 1
        ) % 7

        proposed_weekdays = {
            rule.dayOfWeek
            for rule in result.scheduleRules
        }

        if sporthub_weekday not in proposed_weekdays:
            raise ValueError(
                "startDate does not match "
                "a schedule weekday."
            )