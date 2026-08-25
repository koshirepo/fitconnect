/**
 * Documentation: Razorpay checkout widget loader.
 *
 * - Loads `checkout.js` on demand and opens it, so the vendor script is fetched the first time someone actually pays rather than on every app boot.
 * - Wraps the widget's callback API in a promise that settles exactly once: paid, dismissed, or failed. The widget itself will happily fire `ondismiss` after a success, which is what makes the guard here necessary.
 * - Nothing secret passes through this module. The key id is public and the order was created server-side; the signature the widget returns is only meaningful once the API verifies it.
 * - Primary exports: openRazorpayCheckout, CheckoutResult.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const SCRIPT_ID = "razorpay-checkout-js";

type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayFailure = {
  error?: { description?: string; reason?: string };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (payload: RazorpayFailure) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export type CheckoutResult =
  | { status: "paid"; orderId: string; paymentId: string; signature: string }
  | { status: "dismissed" }
  | { status: "failed"; message: string };

/** Shared across calls so the second payment in a session does not re-download. */
let loader: Promise<void> | null = null;

function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        // Let the next attempt retry rather than caching the failure forever —
        // this is usually a flaky network, not a permanent condition.
        loader = null;
        script.remove();
        reject(new Error("Could not load the payment window. Check your connection."));
      },
      { once: true },
    );

    if (!existing) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return loader;
}

/**
 * Open Razorpay checkout for an order the API already created.
 *
 * Resolves rather than rejects on dismissal and on payment failure: neither is
 * an exception, and callers need to tell them apart to decide what to say.
 */
export async function openRazorpayCheckout(input: {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  themeColor?: string;
}): Promise<CheckoutResult> {
  await loadScript();

  const Razorpay = window.Razorpay;
  if (!Razorpay) {
    throw new Error("Could not load the payment window. Check your connection.");
  }

  return new Promise<CheckoutResult>((resolve) => {
    // The widget can call both `handler` and `ondismiss`; whichever lands first
    // is the real outcome.
    let settled = false;
    const settle = (result: CheckoutResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const instance = new Razorpay({
      key: input.keyId,
      order_id: input.orderId,
      amount: input.amount,
      currency: input.currency,
      name: input.name,
      description: input.description,
      prefill: input.prefill,
      theme: input.themeColor ? { color: input.themeColor } : undefined,
      handler: (response: RazorpaySuccess) =>
        settle({
          status: "paid",
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }),
      modal: {
        ondismiss: () => settle({ status: "dismissed" }),
      },
    });

    instance.on("payment.failed", (payload) =>
      settle({
        status: "failed",
        message:
          payload.error?.description ?? "The payment did not go through. No money was taken.",
      }),
    );

    instance.open();
  });
}
