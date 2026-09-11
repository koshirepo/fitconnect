/**
 * Documentation: The terms somebody accepts when they join.
 *
 * - One component for both ways a membership starts: a visitor accepting the terms on the public form, and a staff member confirming at the desk that they already did. The wording is the gym's and comes from the server; only who is ticking the box differs, which is what `mode` says.
 * - The text is scrollable rather than truncated, and always present rather than behind a link. Consent hidden behind "read the terms" is consent nobody read, and the record the API writes says this person agreed to these words.
 * - Read-aloud sits next to it for people who find a block of terms hard to get through. The text stays on the page either way — this is a second route to it, never a replacement.
 * - Primary exports: ConsentNotice.
 */
import * as React from "react";
import { consentParagraphs } from "@fitconnect/shared/consent";
import { ReadAloudButton } from "@/components/ui/read-aloud-button";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

export function ConsentNotice({
  text,
  checked,
  onChange,
  /**
   * Who is ticking. A visitor agrees on their own behalf; the desk confirms
   * somebody else did, which is a different sentence and a different record.
   */
  mode = "self",
  /** Set after a failed submit, to point at the box that stopped it. */
  invalid = false,
  disabled = false,
  className,
}: {
  text: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  mode?: "self" | "staff";
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const paragraphs = React.useMemo(() => consentParagraphs(text), [text]);
  const checkboxId = React.useId();

  if (paragraphs.length === 0) return null;

  return (
    <div className={cn("space-y-3 rounded-md border p-3", invalid && "border-destructive", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 shrink-0" />
          {mode === "staff" ? "Member consent" : "Before you join"}
        </h3>
        <ReadAloudButton text={paragraphs.join(". ")} />
      </div>

      {/* Capped and scrollable: long terms should not push the button that
          accepts them off the bottom of a phone, which is how somebody ends up
          agreeing to something they never saw. */}
      <div className="max-h-44 space-y-2 overflow-y-auto pr-1 text-xs leading-relaxed text-muted-foreground">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      <label
        htmlFor={checkboxId}
        className={cn(
          "flex cursor-pointer items-start gap-2 text-sm",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded"
          aria-invalid={invalid}
        />
        <span>
          {mode === "staff"
            ? "This member has read and accepted the terms above."
            : "I have read and accept the terms above."}
          <span className="text-destructive" aria-hidden="true">
            {" *"}
          </span>
        </span>
      </label>

      {invalid && (
        <p className="text-xs text-destructive" role="alert">
          {mode === "staff"
            ? "Confirm the member accepted the terms before adding them."
            : "You have to accept the terms to join."}
        </p>
      )}
    </div>
  );
}
