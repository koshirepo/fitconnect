/**
 * Documentation: Razorpay REST client for the Workers runtime.
 *
 * - Razorpay's official Node SDK depends on `https` and `crypto`, neither of which is available here, so this module talks to the REST API with `fetch` and does its signing with WebCrypto.
 * - Every call takes the credentials explicitly rather than reading env: which account a payment lands in depends on the gym, and that decision belongs to `gateway.service`, not here.
 * - Signature checks compare in constant time. A leaky comparison on a payment signature is a forgery oracle.
 * - Primary exports: createOrder, fetchPayment, verifyCheckoutSignature, verifyWebhookSignature, RazorpayCredentials, RazorpayError.
 */

const API_BASE = "https://api.razorpay.com/v1";

export type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

export class RazorpayError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "RazorpayError";
    this.status = status;
    this.code = code;
  }
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  receipt: string | null;
  status: string;
};

export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string | null;
  captured: boolean;
  error_description: string | null;
  notes: Record<string, string> | null;
};

function authHeader({ keyId, keySecret }: RazorpayCredentials) {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function request<T>(
  credentials: RazorpayCredentials,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(credentials),
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch (cause) {
    // A network failure here is not the caller's fault and must not read as a
    // declined payment.
    throw new RazorpayError(
      `Could not reach Razorpay: ${(cause as Error)?.message ?? "network error"}`,
      502,
    );
  }

  const body = (await response.json().catch(() => null)) as {
    error?: { description?: string; code?: string };
  } | null;

  if (!response.ok) {
    throw new RazorpayError(
      body?.error?.description ?? `Razorpay returned ${response.status}.`,
      response.status,
      body?.error?.code,
    );
  }

  return body as T;
}

/**
 * Create an order — the object the checkout widget is opened against.
 *
 * `amount` is in rupees, the way plans, charges, and payment rows are stored
 * and displayed everywhere else in this codebase. Razorpay wants the smallest
 * currency unit, so the conversion to paise happens here, at the boundary —
 * the one place that talks to Razorpay — rather than at each call site where
 * forgetting it would silently charge a hundredth of the real price.
 */
export async function createOrder(
  credentials: RazorpayCredentials,
  input: {
    /** Rupees. */
    amount: number;
    currency?: string;
    receipt?: string;
    notes?: Record<string, string>;
  },
) {
  return request<RazorpayOrder>(credentials, "/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: Math.round(input.amount * 100),
      currency: input.currency ?? "INR",
      receipt: input.receipt,
      notes: input.notes,
    }),
  });
}

export async function fetchPayment(
  credentials: RazorpayCredentials,
  paymentId: string,
) {
  return request<RazorpayPayment>(
    credentials,
    `/payments/${encodeURIComponent(paymentId)}`,
  );
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent, value-independent comparison. */
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify the signature the checkout widget hands back to the browser.
 *
 * This is what proves the browser is not simply claiming a payment succeeded:
 * only someone holding the key secret can produce it.
 */
export async function verifyCheckoutSignature(
  keySecret: string,
  input: { orderId: string; paymentId: string; signature: string },
) {
  const expected = await hmacSha256Hex(
    keySecret,
    `${input.orderId}|${input.paymentId}`,
  );
  return timingSafeEqual(expected, input.signature.toLowerCase());
}

/**
 * Verify a webhook delivery against the raw request body.
 *
 * The body must be the exact bytes Razorpay sent — re-serializing parsed JSON
 * changes key order and whitespace and will never match.
 */
export async function verifyWebhookSignature(
  webhookSecret: string,
  rawBody: string,
  signature: string,
) {
  const expected = await hmacSha256Hex(webhookSecret, rawBody);
  return timingSafeEqual(expected, signature.toLowerCase());
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export type RazorpayWebhook = {
  id: string;
  url: string;
  active: boolean;
  events: Record<string, boolean> | string[];
};

/** The three this app acts on. Anything else is noise and retry traffic. */
export const WEBHOOK_EVENTS = ["payment.captured", "order.paid", "payment.failed"];

/**
 * Register a webhook for one gym, or update the one already registered.
 *
 * The delivery url carries a tenant id, so a gym needs its own webhook rather
 * than sharing one. Doing that by hand does not scale and does not get done —
 * a gym that is missed has members whose payments sit pending whenever a
 * browser closes mid-payment.
 *
 * `webhookId` is what makes this idempotent: with it the existing webhook is
 * updated, without it a new one is created. Registering twice without it would
 * leave two webhooks delivering the same event.
 */
export async function upsertWebhook(
  credentials: RazorpayCredentials,
  input: { url: string; secret: string; webhookId?: string | null },
) {
  const body = JSON.stringify({
    url: input.url,
    secret: input.secret,
    events: WEBHOOK_EVENTS,
    active: true,
  });

  return request<RazorpayWebhook>(
    credentials,
    input.webhookId ? `/webhooks/${encodeURIComponent(input.webhookId)}` : "/webhooks",
    // Razorpay takes a PATCH to change one and a POST to create one.
    { method: input.webhookId ? "PATCH" : "POST", body },
  );
}

/** What this account already has registered, for reconciling by url. */
export async function listWebhooks(credentials: RazorpayCredentials) {
  const response = await request<{ items?: RazorpayWebhook[] }>(
    credentials,
    "/webhooks",
  );
  return response.items ?? [];
}
