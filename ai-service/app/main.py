from fastapi import FastAPI

from app.api.manager import (
    router as manager_router,
)
from app.api.member import (
    router as member_router,
)


app = FastAPI(
    title="SportHub AI Service",
    version="1.0.0",
)


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


app.include_router(
    manager_router
)

app.include_router(
    member_router
)