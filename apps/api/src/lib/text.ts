/**
 * Documentation: Text normalisation for optional fields.
 *
 * - The one rule this app applies to nullable free-text columns coming off a PATCH body, shared so two modules cannot disagree about what an emptied field means.
 * - The three states are deliberately distinct: `undefined` means the caller did not mention the field and it must not be written, `null` means clear it, and a trimmed string means set it. Collapsing the first two is how a partial update silently wipes a column it never mentioned.
 * - Primary exports: normalizeOptionalText.
 */

/** `undefined` to leave alone, `null` to clear, or the trimmed value. */
export function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
