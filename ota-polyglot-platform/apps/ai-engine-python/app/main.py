"""OTA AI & Personalization Engine.

FastAPI service that:
  * polls the core engine's Postgres OutboxEvents table for `booking-created`
    events to keep per-user / per-agent preference profiles warm;
  * serves itinerary recommendations tailored by tenant channel and profile;
  * exposes dynamic-pricing heuristics for the core engine to consult.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.outbox_poller import OutboxPoller
from app.routers import recommendations
from app.services import alerting

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("ai-engine")


@asynccontextmanager
async def lifespan(app: FastAPI):
    poller = OutboxPoller(
        database_url=settings.database_url,
        topic=settings.booking_created_topic,
    )
    task = asyncio.create_task(poller.run_forever(), name="outbox-poller")
    app.state.outbox_poller = poller
    logger.info("AI engine started (outbox database=%s)", settings.database_url)
    try:
        yield
    finally:
        await poller.stop()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        logger.info("AI engine shut down cleanly")


app = FastAPI(
    title="OTA AI & Personalization Engine",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(recommendations.router, prefix="/api/v1/recommendations", tags=["recommendations"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    await alerting.notify(
        f"Unhandled exception on {request.url.path}", exc,
        {"method": request.method, "path": request.url.path},
    )
    return JSONResponse(
        status_code=500,
        content={"error": "internal_error", "message": "The error has been logged and the on-call channel notified."},
    )


@app.get("/healthz")
async def healthz() -> dict:
    poller: OutboxPoller = app.state.outbox_poller
    return {
        "status": "ok",
        "outbox_connected": poller.is_connected,
        "events_processed": poller.events_processed,
    }
