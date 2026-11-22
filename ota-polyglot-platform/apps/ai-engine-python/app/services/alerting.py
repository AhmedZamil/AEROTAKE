"""Slack + email alerts for genuinely unhandled exceptions.

Deliberately narrow trigger: expected control flow (malformed events skipped,
outbox-poller backoff while Postgres is still coming up) is logged where it
happens and does *not* page anyone. Only true crashes/unhandled exceptions
land here.

Both channels are optional — unset SLACK_WEBHOOK_URL / SMTP_HOST and this
no-ops with a one-time warning, so local dev without real credentials still
works. Delivery failures are swallowed: an alerting outage must never mask or
replace the original exception.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import time
import traceback
from email.message import EmailMessage

import httpx

from app.config import settings

logger = logging.getLogger("ai-engine.alerting")

_THROTTLE_WINDOW_SECONDS = 5 * 60
_last_sent: dict[str, float] = {}
_warned_slack_unconfigured = False
_warned_smtp_unconfigured = False


def _throttled(key: str) -> bool:
    now = time.monotonic()
    last = _last_sent.get(key)
    if last is not None and now - last < _THROTTLE_WINDOW_SECONDS:
        return True
    _last_sent[key] = now
    return False


def _format_body(title: str, exc: BaseException, context: dict[str, str] | None) -> str:
    lines = [
        "Service: ai-engine",
        f"Title: {title}",
        f"Exception: {type(exc).__module__}.{type(exc).__qualname__}: {exc}",
    ]
    if context:
        lines.append("Context:")
        lines.extend(f"  {k} = {v}" for k, v in context.items())
    lines.append("Traceback:")
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    lines.append(tb[:2000] + ("…(truncated)" if len(tb) > 2000 else ""))
    return "\n".join(lines)


async def _send_slack(title: str, body: str) -> None:
    global _warned_slack_unconfigured
    if not settings.slack_webhook_url:
        if not _warned_slack_unconfigured:
            logger.warning("SLACK_WEBHOOK_URL not set — Slack alerts disabled.")
            _warned_slack_unconfigured = True
        return

    try:
        text = f":rotating_light: *ai-engine* — {title}\n```{body[:2800]}```"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(settings.slack_webhook_url, json={"text": text})
            if response.status_code >= 300:
                logger.error("Slack alert failed: %s %s", response.status_code, response.text[:200])
    except Exception:
        logger.exception("Failed to deliver Slack alert.")


def _send_email_sync(title: str, body: str) -> None:
    message = EmailMessage()
    message["Subject"] = f"[ALERT] ai-engine — {title}"
    message["From"] = settings.smtp_from
    message["To"] = settings.smtp_to
    message.set_content(body)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as client:
        client.ehlo()
        if client.has_extn("STARTTLS"):
            client.starttls()
            client.ehlo()
        if settings.smtp_user:
            client.login(settings.smtp_user, settings.smtp_password or "")
        client.send_message(message)


async def _send_email(title: str, body: str) -> None:
    global _warned_smtp_unconfigured
    if not settings.smtp_host:
        if not _warned_smtp_unconfigured:
            logger.warning("SMTP_HOST not set — email alerts disabled.")
            _warned_smtp_unconfigured = True
        return

    try:
        # smtplib is blocking; keep it off the event loop.
        await asyncio.to_thread(_send_email_sync, title, body)
    except Exception:
        logger.exception("Failed to deliver email alert.")


async def notify(title: str, exc: BaseException, context: dict[str, str] | None = None) -> None:
    throttle_key = f"{title}:{type(exc).__qualname__}"
    if _throttled(throttle_key):
        logger.debug("Alert throttled (%s)", throttle_key)
        return

    body = _format_body(title, exc, context)
    await asyncio.gather(_send_slack(title, body), _send_email(title, body))
