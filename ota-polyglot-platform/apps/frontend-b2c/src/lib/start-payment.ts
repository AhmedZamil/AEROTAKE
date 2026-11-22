export type PayMethod = "sslcommerz" | "wallet";

function storageKeyFor(bookingId: string, method: PayMethod) {
  return `aerotake-pay-idem:${bookingId}:${method}`;
}

/** Same key while a checkout is in flight, so a double-click reopens that session instead of starting a second charge. */
export function payIdempotencyKey(bookingId: string, method: PayMethod = "sslcommerz"): string {
  if (typeof sessionStorage === "undefined") return `pay-${bookingId}-${method}`;
  const storageKey = storageKeyFor(bookingId, method);
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(storageKey, next);
  return next;
}

/** After a declined, cancelled, or failed checkout the old session is dead. The next try must be a new payment. */
export function replacePayIdempotencyKey(bookingId: string, method: PayMethod = "sslcommerz"): string {
  const next = crypto.randomUUID();
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKeyFor(bookingId, method), next);
  return next;
}

export type StartPaymentResult =
  | { ok: true; gatewayUrl: string; paymentId: string; tranId: string; replayed: boolean; paid: boolean; bookingStatus?: string }
  | { ok: false; message: string; status: number; code?: string };

type PayBody = {
  gatewayUrl?: string;
  paymentId?: string;
  tranId?: string;
  replayed?: boolean;
  paid?: boolean;
  method?: string;
  bookingStatus?: string;
  message?: string;
  error?: string;
};

async function postPay(bookingId: string, method: PayMethod): Promise<{ res: Response; body: PayBody }> {
  const res = await fetch(`/api/bookings/${bookingId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idempotencyKey: payIdempotencyKey(bookingId, method), method }),
  });
  const body = (await res.json().catch(() => ({}))) as PayBody;
  return { res, body };
}

function failed(res: Response, body: PayBody): StartPaymentResult {
  return {
    ok: false,
    status: res.status,
    code: body.error,
    message:
      body.message ??
      (res.status === 409
        ? "Payment isn’t available for this booking right now."
        : "We couldn’t start payment. Please try again."),
  };
}

/**
 * Calls the BFF to start SSLCommerz checkout. Caller redirects to gatewayUrl on success.
 * `fresh` drops the previous key (fail/cancel return). A dead key (`payment_retry_required`) is replaced once and retried.
 */
export async function startPayment(bookingId: string, opts?: { fresh?: boolean; method?: PayMethod }): Promise<StartPaymentResult> {
  const method = opts?.method ?? "sslcommerz";
  if (opts?.fresh) replacePayIdempotencyKey(bookingId, method);
  let { res, body } = await postPay(bookingId, method);
  if (res.status === 409 && body.error === "payment_retry_required") {
    replacePayIdempotencyKey(bookingId, method);
    ({ res, body } = await postPay(bookingId, method));
  }
  if (!res.ok) return failed(res, body);
  if (body.paid) {
    return {
      ok: true,
      gatewayUrl: "",
      paymentId: body.paymentId ?? "",
      tranId: body.tranId ?? "",
      replayed: Boolean(body.replayed),
      paid: true,
      bookingStatus: body.bookingStatus,
    };
  }
  if (!body.gatewayUrl) return failed(res, body);
  return {
    ok: true,
    gatewayUrl: body.gatewayUrl,
    paymentId: body.paymentId ?? "",
    tranId: body.tranId ?? "",
    replayed: Boolean(body.replayed),
    paid: false,
  };
}
