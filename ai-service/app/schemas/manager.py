from datetime import date
from pydantic import BaseModel, Field, field_validator


class ScheduleRule(BaseModel):
    dayOfWeek: int = Field(ge=0, le=6)
    startTimeLocal: str

    @field_validator("startTimeLocal")
    @classmethod
    def validate_time(cls, value: str) -> str:
        import re

        if not re.match(
            r"^(?:[01]\d|2[0-3]):[0-5]\d$",
            value,
        ):
            raise ValueError(
                "startTimeLocal must use HH:mm"
            )

        return value


class ManagerScheduleRequest(BaseModel):
    sportId: int = Field(gt=0)
    coachId: str | None = None
    defaultRoomId: int = Field(gt=0)

    startDate: date

    numSessions: int = Field(
        ge=1,
        le=100,
    )

    scheduleRules: list[ScheduleRule]

    context: dict


class ManagerScheduleResponse(BaseModel):
    startDate: date

    numSessions: int = Field(
        ge=1,
        le=100,
    )

    scheduleRules: list[ScheduleRule]

    rationale: str