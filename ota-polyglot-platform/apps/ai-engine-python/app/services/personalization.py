"""Personalization primitives: profile store + itinerary heuristics.

The profile store is in-memory for the boilerplate; swap for Redis/pgvector in
production. The itinerary generator is a deterministic heuristic pipeline with
a clean seam (`ItineraryEngine.generate`) where an LLM or ranking model plugs in.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta


# --------------------------- Profile store ----------------------------------

@dataclass
class SubjectProfile:
    bookings: int = 0
    total_spend: float = 0.0
    currency: str = "USD"
    suppliers: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    @property
    def avg_ticket(self) -> float:
        return self.total_spend / self.bookings if self.bookings else 0.0

    @property
    def budget_band(self) -> str:
        if self.avg_ticket >= 800:
            return "premium"
        if self.avg_ticket >= 300:
            return "comfort"
        return "value"


class ProfileStore:
    """Tenant-partitioned profile store. Keys: (tenant_id, subject_id)."""

    def __init__(self) -> None:
        self._profiles: dict[tuple[str, str], SubjectProfile] = {}

    def record_booking(self, tenant_id: str, subject_id: str,
                       offer_id: str, price: float, currency: str) -> None:
        profile = self._profiles.setdefault((tenant_id, subject_id), SubjectProfile())
        profile.bookings += 1
        profile.total_spend += price
        profile.currency = currency
        supplier = offer_id.split("-")[0] if offer_id else "UNKNOWN"
        profile.suppliers[supplier] += 1

    def get(self, tenant_id: str, subject_id: str) -> SubjectProfile:
        return self._profiles.get((tenant_id, subject_id), SubjectProfile())


profile_store = ProfileStore()


# --------------------------- Itinerary engine -------------------------------

_THEMES = {
    "premium": ["Private heritage tour", "Fine-dining tasting menu", "Spa & wellness afternoon"],
    "comfort": ["Guided old-town walk", "River cruise at sunset", "Local cooking class"],
    "value": ["Self-guided street-food crawl", "Free walking tour", "Public-market morning"],
}

_DYNAMIC_PRICING_FACTORS = {
    "premium": 1.00,   # no discount pressure
    "comfort": 0.97,   # light incentive
    "value": 0.94,     # aggressive conversion incentive
}


@dataclass
class ItineraryDay:
    day: int
    date: str
    title: str
    activities: list[str]


class ItineraryEngine:
    """Deterministic per-(subject, destination) generation so responses are
    stable and testable. Replace `generate` internals with an LLM call while
    keeping this contract."""

    def generate(self, *, tenant_id: str, subject_id: str, destination: str,
                 start: date, nights: int) -> dict:
        profile = profile_store.get(tenant_id, subject_id)
        band = profile.budget_band
        themes = _THEMES[band]

        seed = int(hashlib.sha256(f"{subject_id}:{destination}".encode()).hexdigest(), 16)
        days: list[ItineraryDay] = []
        for i in range(max(1, min(nights, 14))):
            theme = themes[(seed + i) % len(themes)]
            days.append(ItineraryDay(
                day=i + 1,
                date=(start + timedelta(days=i)).isoformat(),
                title=f"Day {i + 1} in {destination}",
                activities=[theme, f"Evening: neighborhood dinner ({band} picks)"],
            ))

        return {
            "destination": destination,
            "budget_band": band,
            "based_on_bookings": profile.bookings,
            "dynamic_price_factor": _DYNAMIC_PRICING_FACTORS[band],
            "days": [d.__dict__ for d in days],
        }


itinerary_engine = ItineraryEngine()
