/**
 * Documentation: One shape for a product, whichever storefront asked.
 *
 * - The platform shop and a gym's store used to serialise the same row two different ways: commerce flattened `photos` and invented `videos`, store flattened `_count` into like and comment totals, and only one of them derived a price. A card that says "₹349 onwards" and a card that says "₹349" were reading different code to reach the same number.
 * - `price` and `stock` are derived here, deliberately, and are not stored anywhere. The cheapest live variant and the sum of their stock is what a catalogue card needs — one number to show, one to grey itself out on — and computing it at the edge is what lets the database keep a single honest home for both on the variant.
 * - Retired variants are dropped from the pricing but kept in the list. "Chocolate 1kg — out of stock" tells a reader something; a silently missing row reads as a gym that never stocked it.
 * - Primary exports: toStorefrontProduct.
 */

type VariantRow = {
  id: string;
  name: string;
  attributes?: unknown;
  sku?: string | null;
  price: number;
  stock: number;
  isActive: boolean;
};

type ProductRow = {
  photos: unknown;
  variants?: VariantRow[];
  _count?: { likes: number; comments: number };
};

/** Photos are stored as JSON; anything that is not a list of strings is noise. */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** What this adds on top of whatever the caller selected. */
type StorefrontExtras = {
  photos: string[];
  videos: never[];
  variants: VariantRow[];
  /** Cheapest live variant, or zero when nothing is sellable. */
  price: number;
  /** Total across live variants. */
  stock: number;
  /** True where the price is a "from", so a card can say "onwards". */
  hasChoice: boolean;
  likeCount: number;
  commentCount: number;
};

/**
 * The return type is written out rather than inferred.
 *
 * Spreading a generic into an object literal makes TypeScript fall back to the
 * constraint, so callers saw `ProductRow` — three fields — instead of the
 * twenty they had selected. Naming `Omit<T, ...>` keeps the caller's own shape.
 */
export function toStorefrontProduct<T extends ProductRow>(
  product: T,
): Omit<T, "_count" | "photos" | "variants"> & StorefrontExtras {
  const { _count, ...rest } = product;
  const variants = product.variants ?? [];
  const sellable = variants.filter((variant) => variant.isActive);

  return {
    ...(rest as Omit<T, "_count" | "photos" | "variants">),
    photos: toStringList(product.photos),
    videos: [],
    variants,
    // Zero rather than undefined when nothing is sellable: a storefront reads
    // this to decide "out of stock", and a missing number reads as free.
    price: sellable.length > 0 ? Math.min(...sellable.map((variant) => variant.price)) : 0,
    stock: sellable.reduce((total, variant) => total + variant.stock, 0),
    hasChoice: sellable.length > 1,
    likeCount: _count?.likes ?? 0,
    commentCount: _count?.comments ?? 0,
  };
}
