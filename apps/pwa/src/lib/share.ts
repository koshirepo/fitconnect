/**
 * Documentation: Sharing a link out of the app.
 *
 * - One way to hand somebody a URL: the device's own share sheet where there is one, the clipboard everywhere else. Callers get back which happened so they can say "Shared" or "Link copied" truthfully rather than guessing.
 * - The share sheet is the right default on a phone, which is where a gym's members actually are — it reaches WhatsApp, where most of this sharing ends up, instead of making them paste into it. Desktop browsers largely lack it, so the clipboard is not a degraded path there, it is the normal one.
 * - A cancelled share sheet is not a failure and must not fall through to the clipboard: the person closed it on purpose, and silently copying instead would be doing something they just declined.
 * - Primary exports: shareLink, ShareOutcome.
 */

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

/**
 * Offer a URL through the share sheet, falling back to the clipboard.
 *
 * Never throws — every caller of this is a button whose job is to give
 * feedback, and an exception would leave it stuck mid-action.
 */
export async function shareLink(input: {
  url: string;
  title?: string;
  text?: string;
}): Promise<ShareOutcome> {
  const { url, title, text } = input;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, ...(title ? { title } : {}), ...(text ? { text } : {}) });
      return "shared";
    } catch (error) {
      // The share sheet reports a user closing it as an AbortError. That is a
      // decision, not a problem, so it stops here rather than copying instead.
      if (error instanceof DOMException && error.name === "AbortError") return "dismissed";
      // Anything else — a browser that claims support and refuses, an insecure
      // context — falls through to the clipboard below.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    // The async Clipboard API is permission-gated and plenty of real contexts
    // refuse it — the in-app browsers inside WhatsApp and Instagram most of
    // all, which is precisely where a shared gym link gets opened.
    return copyViaSelection(url) ? "copied" : "failed";
  }
}

/**
 * Copy by selecting text in a throwaway element.
 *
 * The pre-Clipboard-API way, kept as the last resort because it needs no
 * permission — only a user gesture, which a button click already is.
 */
function copyViaSelection(value: string): boolean {
  if (typeof document === "undefined") return false;

  const field = document.createElement("textarea");
  field.value = value;
  // Off-screen rather than hidden: `display: none` cannot be selected, and a
  // visible flash of the URL would be worse than the copy failing.
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-9999px";
  field.style.opacity = "0";
  document.body.appendChild(field);

  try {
    field.select();
    field.setSelectionRange(0, value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(field);
  }
}
