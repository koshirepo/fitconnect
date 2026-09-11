/**
 * Documentation: What a variant is called.
 *
 * - A variant's name is not typed any more; it is built from what actually makes it different — `{ flavour: "Chocolate", size: "1kg" }` becomes "Chocolate · 1kg". One fact, stored once, instead of a name and a set of attributes that could disagree with each other.
 * - Lives in the shared package because both sides need the same answer: the API builds the name it stores, and the product form shows the seller what their variant will be called before they save it. Two implementations would drift, and here drift means the label on the shelf not matching the label in the order.
 * - The separator is the one the catalogue already used by hand, so nothing that existed before this was renamed by it.
 * - Primary exports: VARIANT_NAME_SEPARATOR, deriveVariantName, hasUsableAttributes.
 */

/** Between attribute values, as the catalogue already wrote them by hand. */
export const VARIANT_NAME_SEPARATOR = " · ";

/**
 * The name a variant carries, from the attributes that distinguish it.
 *
 * Insertion order is the seller's order: whatever they listed first reads
 * first, so "Flavour" then "Weight" gives "Chocolate · 1kg" rather than an
 * alphabetised "1kg · Chocolate" nobody asked for.
 *
 * Values only. A name reading "Flavour: Chocolate · Weight: 1kg" is a form
 * printed out, not a label — the keys are there to tell the seller what they
 * are filling in, and to group variants later.
 */
export function deriveVariantName(attributes: Record<string, string> | null | undefined): string {
  if (!attributes) return "";
  return Object.values(attributes)
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0)
    .join(VARIANT_NAME_SEPARATOR);
}

/**
 * Whether these attributes can name a variant at all.
 *
 * A variant with nothing distinguishing it cannot be told apart from its
 * siblings on a shelf, in a cart, or on an order line — so this is the check
 * that replaces "did they type a name".
 */
export function hasUsableAttributes(
  attributes: Record<string, string> | null | undefined,
): boolean {
  return deriveVariantName(attributes).length > 0;
}
