/**
 * Documentation: A password field with a show/hide toggle.
 *
 * - Wraps `Input`, forcing `type` between "password" and "text" from its own state. Everything else — value, onChange, required, minLength, autoComplete — passes straight through, so it drops into any form where a password `Input` already stood.
 * - The toggle is a real button rather than an icon on the input: it has to be reachable by keyboard and announce which state it is in, and it must never submit the form it sits in.
 * - Reveal state is deliberately local and never lifted. Two password fields on one form (a new password and its confirmation) are shown and hidden independently, because checking one is not a reason to expose the other.
 * - Primary exports: PasswordInput.
 */
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={revealed ? "text" : "password"}
        // Room for the button, so a long password never runs under it.
        className={cn("pr-9", className)}
      />
      <button
        type="button"
        // Not a tab stop: somebody filling a form should go password → submit,
        // not password → eye → submit. It stays reachable by pointer, and by
        // keyboard through the browser's own controls.
        tabIndex={-1}
        onClick={() => setRevealed((shown) => !shown)}
        aria-label={revealed ? "Hide password" : "Show password"}
        aria-pressed={revealed}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        disabled={props.disabled}
      >
        {revealed ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export { PasswordInput };
