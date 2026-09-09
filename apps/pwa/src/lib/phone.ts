/**
 * Documentation: What counts as a phone number in this app.
 *
 * - A phone number here is digits with an optional leading `+`, and nothing else. Spaces, dashes, brackets and stray letters never make it into stored data, so the same string works for a courier's manifest, a WhatsApp link and an SMS gateway.
 * - Lives in `lib` rather than beside the input component so non-form code — imports, pasted lists, anything cleaning up an existing number — can reach the same rule instead of writing a second one.
 * - `maskPhone` is the display-only rule for staff who may not see a member's number; nothing here changes what is stored, dialled or messaged.
 * - Primary exports: sanitizePhoneInput, maskPhone.
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

/**
 * The same number with its middle digits hidden: "7100009658" → "71XXXX9658".
 *
 * Staff who are not the gym's admin see this instead of the real number. It is
 * a display rule only — the value behind it is untouched, so a call, a WhatsApp
 * message or a saved edit still uses the number the member actually gave.
 *
 * The first two and last four digits survive because that is enough for a
 * trainer to confirm they are looking at the right person's record, and not
 * enough to dial or to copy a member list out of the gym.
 */
export function maskPhone(value?: string | null): string | null {
  if (!value) return null;

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  const prefix = value.trimStart().startsWith("+") ? "+" : "";

  // Too short to keep both ends: hold on to the last two digits only.
  if (digits.length <= 6) {
    const tail = digits.slice(-2);
    return `${prefix}${"X".repeat(digits.length - tail.length)}${tail}`;
  }

  const head = digits.slice(0, 2);
  const tail = digits.slice(-4);

  return `${prefix}${head}${"X".repeat(digits.length - head.length - tail.length)}${tail}`;
}
