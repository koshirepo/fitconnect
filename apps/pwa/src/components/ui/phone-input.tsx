/**
 * Documentation: The phone field, everywhere one is typed.
 *
 * - A drop-in for `Input` that keeps a phone number to digits and an optional leading `+`. Spaces, dashes, brackets and stray letters are stripped as they are typed rather than rejected on submit: a field that quietly accepts "98765 43210" and refuses it at the end teaches nobody what it wanted.
 * - Call sites keep their own state and their own `onChange`; the event they receive simply carries a cleaned value. That is why swapping `Input` for this one needs no other change.
 * - The rule itself lives in `lib/phone` so code with no input attached can apply it too.
 * - Primary exports: PhoneInput.
 */
import * as React from "react";
import { sanitizePhoneInput } from "@/lib/phone";
import { Input } from "./input";

export function PhoneInput({ onChange, ...props }: React.ComponentProps<"input">) {
  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      {...props}
      onChange={(event) => {
        const cleaned = sanitizePhoneInput(event.target.value);
        // Rewriting the target before handing the event on is what keeps the
        // caller's state and the visible input from drifting apart.
        if (cleaned !== event.target.value) event.target.value = cleaned;
        onChange?.(event);
      }}
    />
  );
}
