"""Recommendation endpoints, tenant-aware via the propagated headers."""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.services import alerting
from app.services.personalization import itinerary_engine, profile_store

logger = logging.getLogger("ai-engine.recommendations")

router = APIRouter()


class ItineraryRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=80, examples=["Kyoto"])
    start_date: date
    nights: int = Field(ge=1, le=14, default=3)
    user_id: str | None = Field(default=None, description="B2C user id")
    agent_id: str | None = Field(default=None, description="B2B agent id (overrides user)")


@router.post("/itinerary")
async def generate_itinerary(
    body: ItineraryRequest,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_channel: str = Header("B2C", alias="X-Channel"),
) -> dict:
    subject = body.agent_id or body.user_id or "b2c-anonymous"

    try:
        itinerary = itinerary_engine.generate(
            tenant_id=x_tenant_id,
            subject_id=subject,
            destination=body.destination.strip().title(),
            start=body.start_date,
            nights=body.nights,
        )
    except Exception as exc:  # pragma: no cover — defensive boundary
        logger.exception("Itinerary generation failed for tenant=%s subject=%s", x_tenant_id, subject)
        await alerting.notify(
            "Itinerary generation failed", exc,
            {"tenant_id": x_tenant_id, "subject_id": subject, "destination": body.destination},
        )
        raise HTTPException(status_code=500, detail="Itinerary generation failed.") from exc

    return {
        "tenant_id": x_tenant_id,
        "channel": x_channel,
        "subject_id": subject,
        "itinerary": itinerary,
    }


@router.get("/profile/{subject_id}")
async def get_profile(
    subject_id: str,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
) -> dict:
    profile = profile_store.get(x_tenant_id, subject_id)
    return {
        "subject_id": subject_id,
        "bookings": profile.bookings,
        "total_spend": round(profile.total_spend, 2),
        "avg_ticket": round(profile.avg_ticket, 2),
        "budget_band": profile.budget_band,
        "top_suppliers": dict(sorted(profile.suppliers.items(), key=lambda kv: -kv[1])[:3]),
    }
