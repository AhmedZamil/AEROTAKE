"""Async Postgres outbox poller for `booking-created` events.

Replaces the Kafka consumer: core-engine now writes events into the
messaging.OutboxEvents table (see its AddOutboxEvents and ModuleSchemas migrations) atomically with the
domain change they announce, instead of publishing to a broker. This poller
reads that table directly via raw SQL — it is coupled to that table's column
names, not to a wire-format API contract.

Resilient by design, mirroring the old kafka_consumer.py's approach:
connection failures — including the table not existing yet, if this service
starts before core-engine has applied its migration against a fresh
database — retry with backoff instead of crashing the API process.

Two connections, two lifecycles:
  * a small pool used for the actual poll query (the authoritative read);
  * a single dedicated (non-pooled) connection used only for
    `LISTEN outbox_events`, with its own reconnect loop — Postgres does not
    auto-resubscribe a listener after a dropped connection, and a pooled
    connection must never be used for LISTEN since the pool can hand it to
    something else or close it out from under the callback.
NOTIFY is purely a latency optimization (it just wakes the poll loop early);
the periodic poll below is the actual delivery guarantee, since a NOTIFY is
fire-and-forget and not persisted — a missed one must never mean a missed
event.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

import asyncpg

from app.services import alerting
from app.services.personalization import profile_store

logger = logging.getLogger("ai-engine.outbox")

_POLL_INTERVAL_SECONDS = 5.0
_UNDEFINED_TABLE = "42P01"  # Postgres SQLSTATE: relation does not exist

# The outbox lives in core-engine's `messaging` schema (its ModuleSchemas migration moved it out of `public`). These two statements
# are the whole contract between the services, kept as plain constants so core-engine's OutboxPollerContractTests can read them from
# this file and check them against a real migrated database — a schema or column change that breaks them fails core-engine's build.
SELECT_PENDING_SQL = """SELECT "Id", "Topic", "Payload" FROM "messaging"."OutboxEvents" WHERE "Topic" = $1 AND "ProcessedAt" IS NULL ORDER BY "CreatedAt" LIMIT 100 FOR UPDATE SKIP LOCKED"""
MARK_PROCESSED_SQL = """UPDATE "messaging"."OutboxEvents" SET "ProcessedAt" = now() WHERE "Id" = ANY($1::uuid[])"""


class OutboxPoller:
    def __init__(self, database_url: str, topic: str) -> None:
        self._database_url = database_url
        self._topic = topic
        self._pool: asyncpg.Pool | None = None
        self._wake = asyncio.Event()
        self._stopping = asyncio.Event()
        self.is_connected = False
        self.events_processed = 0

    async def run_forever(self) -> None:
        listen_task = asyncio.create_task(self._listen_loop(), name="outbox-listen")
        try:
            await self._poll_loop()
        finally:
            listen_task.cancel()
            try:
                await listen_task
            except asyncio.CancelledError:
                pass

    async def stop(self) -> None:
        self._stopping.set()
        self._wake.set()
        if self._pool is not None:
            await self._pool.close()

    # -- poll loop (authoritative) -------------------------------------------

    async def _poll_loop(self) -> None:
        backoff = 2.0
        while not self._stopping.is_set():
            try:
                if self._pool is None:
                    self._pool = await asyncpg.create_pool(self._database_url, min_size=1, max_size=2)
                await self._drain_once()
                self.is_connected = True
                backoff = 2.0
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — keep the loop alive
                self.is_connected = False
                if getattr(exc, "sqlstate", None) == _UNDEFINED_TABLE:
                    logger.warning(
                        "messaging.OutboxEvents table not found yet (migration pending?); retrying in %.0fs", backoff,
                    )
                else:
                    logger.exception("Outbox poll failed; retrying in %.0fs", backoff)
                    await alerting.notify(
                        "AI-engine outbox poller crashed", exc, {"topic": self._topic},
                    )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
                continue

            if self._stopping.is_set():
                break
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=_POLL_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass
            self._wake.clear()

    async def _drain_once(self) -> None:
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                rows = await conn.fetch(SELECT_PENDING_SQL, self._topic)
                if not rows:
                    return

                processed_ids: list[uuid.UUID] = []
                for row in rows:
                    self._handle(row["Id"], row["Payload"])
                    processed_ids.append(row["Id"])
                    self.events_processed += 1

                await conn.execute(MARK_PROCESSED_SQL, processed_ids)

    def _handle(self, event_id: uuid.UUID, raw: str) -> None:
        try:
            event = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            # A malformed row would never parse on a later retry either —
            # still mark it processed (above) so it doesn't loop forever.
            logger.warning("Skipping malformed outbox payload %s: %r", event_id, raw[:200])
            return

        tenant_id = event.get("tenantId")
        subject = event.get("agentId") or event.get("subAgentId") or "b2c-anonymous"
        if not tenant_id:
            logger.warning("booking-created event %s missing tenantId; skipped", event_id)
            return

        profile_store.record_booking(
            tenant_id=tenant_id,
            subject_id=subject,
            offer_id=event.get("offerId", ""),
            price=float(event.get("finalPrice", 0.0)),
            currency=event.get("currency", "USD"),
        )
        logger.info(
            "Ingested booking %s (tenant=%s, subject=%s)",
            event.get("pnr", "?"), tenant_id, subject,
        )

    # -- listen loop (latency optimization only) -----------------------------

    async def _listen_loop(self) -> None:
        backoff = 2.0
        while not self._stopping.is_set():
            conn: asyncpg.Connection | None = None
            try:
                conn = await asyncpg.connect(self._database_url)
                await conn.add_listener("outbox_events", self._on_notify)
                logger.info("Listening on outbox_events")
                backoff = 2.0
                while not self._stopping.is_set() and not conn.is_closed():
                    await asyncio.sleep(5)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — this connection is a latency
                # optimization only; the poll loop keeps working without it.
                logger.warning("Outbox LISTEN connection lost (%s); reconnecting in %.0fs", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
            finally:
                if conn is not None and not conn.is_closed():
                    await conn.remove_listener("outbox_events", self._on_notify)
                    await conn.close()

    def _on_notify(self, connection, pid, channel, payload) -> None:
        self._wake.set()
