from fastapi import (
    APIRouter,
    HTTPException,
)

from app.schemas.manager import (
    ManagerScheduleRequest,
    ManagerScheduleResponse,
)
from app.services.manager_schedule_service import (
    ManagerScheduleService,
)


router = APIRouter(
    prefix="/manager",
    tags=["Manager AI"],
)

service = ManagerScheduleService()


@router.post(
    "/schedule-suggestions",
    response_model=ManagerScheduleResponse,
)
def suggest_schedule(
    request: ManagerScheduleRequest,
) -> ManagerScheduleResponse:

    try:
        return service.suggest(
            request
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="AI generation failed.",
        ) from exc