/**
 * Documentation: What counts as a phone number in this app.
 *
 * - A phone number here is digits with an optional leading `+`, and nothing else. Spaces, dashes, brackets and stray letters never make it into stored data, so the same string works for a courier's manifest, a WhatsApp link and an SMS gateway.
 * - Lives in `lib` rather than beside the input component so non-form code — imports, pasted lists, anything cleaning up an existing number — can reach the same rule instead of writing a second one.
 * - Primary exports: sanitizePhoneInput.
 */

/**
 * Digits, plus a leading `+` when the original had one before any digit.
 *
 * "(+91) 98765 43210" keeps its plus; "9876+5" does not grow one in the middle.
 */
export function sanitizePhoneInput(value: string) {
  const digits = value.replace(/\D/g, "");
  const plusAt = value.indexOf("+");
  const firstDigitAt = value.search(/\d/);
  const keepPlus = plusAt !== -1 && (firstDigitAt === -1 || plusAt < firstDigitAt);

  return `${keepPlus ? "+" : ""}${digits}`;
}
