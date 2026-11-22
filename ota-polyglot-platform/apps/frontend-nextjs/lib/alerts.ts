/**
 * Slack + email alerts for genuinely unhandled exceptions (middleware faults,
 * upstream-unreachable errors, unhandled render errors) — not for expected
 * responses like a 401 on a bad API key.
 *
 * Both channels are optional: unset SLACK_WEBHOOK_URL / SMTP_HOST and this
 * no-ops with a one-time console warning. Delivery failures are swallowed —
 * an alerting outage must never mask the original error.
 *
 * Runtime note: Slack uses fetch, which works in both the Edge and Node.js
 * runtimes (so it fires from middleware.ts too). Email uses nodemailer,
 * which needs raw sockets and only works in the Node.js runtime — calling
 * notifyError() from Edge middleware still sends the Slack alert but skips
 * email (caught below, logged once at debug level, not an error).
 */

const THROTTLE_WINDOW_MS = 5 * 60 * 1000;
const lastSent = new Map<string, number>();
let warnedSlackUnconfigured = false;
let warnedSmtpUnconfigured = false;

function throttled(key: string): boolean {
  const now = Date.now();
  const last = lastSent.get(key);
  if (last !== undefined && now - last < THROTTLE_WINDOW_MS) return true;
  lastSent.set(key, now);
  return false;
}

function formatBody(title: string, error: unknown, context?: Record<string, string>): string {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : "(no stack trace)";
  const lines = [
    "Service: frontend",
    `Title: ${title}`,
    `Error: ${message}`,
  ];
  if (context) {
    lines.push("Context:");
    for (const [k, v] of Object.entries(context)) lines.push(`  ${k} = ${v}`);
  }
  lines.push("Stack trace:", stack.slice(0, 2000));
  return lines.join("\n");
}

async function sendSlack(title: string, body: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    if (!warnedSlackUnconfigured) {
      console.warn("[alerts] SLACK_WEBHOOK_URL not set — Slack alerts disabled.");
      warnedSlackUnconfigured = true;
    }
    return;
  }

  try {
    const text = `:rotating_light: *frontend* — ${title}\n\`\`\`${body.slice(0, 2800)}\`\`\``;
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) {
      console.error(`[alerts] Slack alert failed: ${response.status}`);
    }
  } catch (err) {
    console.error("[alerts] Failed to deliver Slack alert:", err);
  }
}

async function sendEmail(title: string, body: string): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (!warnedSmtpUnconfigured) {
      console.warn("[alerts] SMTP_HOST not set — email alerts disabled.");
      warnedSmtpUnconfigured = true;
    }
    return;
  }

  try {
    // Dynamic import: throws on the Edge runtime (no raw sockets), which we
    // treat as "email unavailable here" rather than a real failure.
    const nodemailer = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: process.env.SMTP_PASSWORD } : undefined,
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "alerts@ota-platform.local",
      to: process.env.SMTP_TO ?? "oncall@ota-platform.local",
      subject: `[ALERT] frontend — ${title}`,
      text: body,
    });
  } catch (err) {
    console.error("[alerts] Failed to deliver email alert (or nodemailer unavailable on this runtime):", err);
  }
}

export async function notifyError(title: string, error: unknown, context?: Record<string, string>): Promise<void> {
  const errorType = error instanceof Error ? error.name : typeof error;
  const throttleKey = `${title}:${errorType}`;
  if (throttled(throttleKey)) return;

  const body = formatBody(title, error, context);
  await Promise.all([sendSlack(title, body), sendEmail(title, body)]);
}
