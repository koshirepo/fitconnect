/**
 * Documentation: The box somebody writes feedback in.
 *
 * - One composer for every surface where a person writes something about something else: a comment on a gym's store product, a comment on a review, a full review with a rating and a title. They differed only in which extra fields sat above the text box, so that is the only thing this takes as a slot.
 * - Owns the double-submit guard rather than trusting a `submitting` prop. That bug is why this exists as shared code: the store thread had the guard, the shop review form did not, and a second click while the first write was in flight posted twice.
 * - Clears the draft only once the write resolves. A failed post that wiped the box loses what somebody typed, and they do not type it again.
 * - Errors are rendered here, not thrown at the page. The shop's review list used `alert()` for this, which is a browser dialog in the middle of a shopping flow.
 * - Presentational: it never calls an API. What happens on submit is the caller's business, which keeps the react-query wiring in the hooks where the rest of this app puts it.
 * - Primary exports: FeedbackComposer.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getApiError } from "@/api/client";
import { FEEDBACK_LIMITS } from "@fitconnect/shared/constants";

/**
 * The same number the API validates against, imported rather than repeated —
 * a counter that disagrees with the server tells somebody their comment fits
 * and then loses it on submit.
 */
export const FEEDBACK_MAX_LENGTH = FEEDBACK_LIMITS.COMMENT_MAX_LENGTH;

export function FeedbackComposer({
  onSubmit,
  placeholder = "Write a comment...",
  submitLabel = "Post comment",
  busyLabel = "Posting...",
  maxLength = FEEDBACK_MAX_LENGTH,
  rows = 3,
  ariaLabel = "Write a comment",
  fullWidthSubmit = false,
  disabled = false,
  header,
  fields,
  footer,
  validate,
}: {
  /** Resolves when the write has landed. Rejecting leaves the draft in place. */
  onSubmit: (body: string) => Promise<unknown>;
  placeholder?: string;
  submitLabel?: string;
  busyLabel?: string;
  maxLength?: number;
  rows?: number;
  ariaLabel?: string;
  /** A review's submit spans the card; a comment's sits inline beside the count. */
  fullWidthSubmit?: boolean;
  disabled?: boolean;
  /** A heading above everything, when the surface wants one. */
  header?: React.ReactNode;
  /** Extra inputs above the text box — a star rating, a title, a checkbox. */
  fields?: React.ReactNode;
  /** Extra controls below it, on the row with the character count. */
  footer?: React.ReactNode;
  /**
   * Returns a message to show instead of submitting. Lets a review demand a
   * rating without this component knowing what a rating is.
   */
  validate?: () => string | null;
}) {
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || disabled) return;

    const body = draft.trim();
    const complaint = validate?.() ?? (body ? null : "Please write something first.");
    if (complaint) {
      setError(complaint);
      return;
    }

    setError("");
    setBusy(true);
    try {
      await onSubmit(body);
      setDraft("");
    } catch (err) {
      setError(getApiError(err));
    }
    // Deliberately after the try/catch rather than in a `finally`: React
    // Compiler bails out of any function containing one, and nothing above
    // returns early, so this runs on both paths exactly as `finally` did.
    setBusy(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {header}
      {fields}

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          rows={rows}
          aria-label={ariaLabel}
          disabled={disabled || busy}
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {draft.length}/{maxLength}
          </span>
          {footer}
          {!fullWidthSubmit && (
            <Button type="submit" size="sm" disabled={disabled || busy || !draft.trim()}>
              {busy ? busyLabel : submitLabel}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {fullWidthSubmit && (
        <Button type="submit" className="w-full" disabled={disabled || busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
      )}
    </form>
  );
}
