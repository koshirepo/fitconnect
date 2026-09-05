/**
 * Documentation: A button that shares a link.
 *
 * - Wraps `shareLink` with the feedback the action needs: the label changes to say what actually happened, then goes back after a moment. Every place in this app that offered a link previously hand-rolled that timer.
 * - The confirmation is on the button itself rather than a toast, because the button is where the reader is already looking, and "Copied" on the thing you just pressed needs no explanation.
 * - Primary exports: ShareButton.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Share2 } from "lucide-react";
import { shareLink } from "@/lib/share";
import { cn } from "@/lib/utils";

/** How long the confirmation stays before the button returns to normal. */
const FEEDBACK_MS = 2000;

export function ShareButton({
  url,
  title,
  text,
  label = "Share",
  iconOnlyOnMobile = false,
  variant = "outline",
  size = "sm",
  className,
}: {
  url: string;
  /** Used by the device share sheet; ignored when falling back to the clipboard. */
  title?: string;
  text?: string;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  /**
   * Drop the words below `sm`, keeping the icon.
   *
   * For rows of pills on a phone, where four labelled controls wrap onto three
   * lines. The feedback after a share still shows its words at every width: a
   * silent icon that has just changed shape is not feedback.
   */
  iconOnlyOnMobile?: boolean;
  className?: string;
}) {
  const [outcome, setOutcome] = React.useState<"copied" | "failed" | null>(null);

  // A pending timer would otherwise fire into an unmounted component when
  // somebody shares and immediately navigates away.
  const timerRef = React.useRef<number>(0);
  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleShare = async () => {
    const result = await shareLink({ url, title, text });

    // A native share needs no confirmation — the sheet was the feedback, and
    // a dismissed one should leave no trace at all.
    if (result === "shared" || result === "dismissed") return;

    setOutcome(result === "copied" ? "copied" : "failed");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOutcome(null), FEEDBACK_MS);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleShare}
      title={label}
      aria-label={label}
      className={cn(className)}
    >
      {outcome === "copied" ? (
        <>
          <Check className="h-4 w-4" />
          Link copied
        </>
      ) : outcome === "failed" ? (
        <>
          <Copy className="h-4 w-4" />
          Copy failed
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 shrink-0" />
          <span className={cn(iconOnlyOnMobile && "hidden sm:inline")}>{label}</span>
        </>
      )}
    </Button>
  );
}
