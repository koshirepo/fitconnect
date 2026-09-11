/**
 * Documentation: How a gym's catalogue is browsed, for the shop and the counter.
 *
 * - The category chips, the sort, and the search a storefront applies to its products. The shop at `/shop` and the counter sale show the same grid, so they filter it the same way: a coach searching "whey" at the desk finds what a member finds.
 * - Pure: products in, products out. Where the list came from, and what tapping a card does, stay with the page.
 * - Primary exports: ALL_CATEGORIES, STORE_SORTS, fromPrice, totalStock, categoryChipsFor, filterAndSort.
 */
import type { StoreProduct } from "@fitconnect/shared/types/models";
import type { CategoryChip } from "@/components/catalog/storefront-toolbar";

/** The "All" chip, which is every catalogue's first filter. */
export const ALL_CATEGORIES = "";

export const STORE_SORTS = [
  { value: "popular", label: "Popularity" },
  { value: "price-asc", label: "Price — low to high" },
  { value: "price-desc", label: "Price — high to low" },
  { value: "name", label: "Name" },
] as const;

/** The cheapest live variant, which is the figure a card leads with. */
export function fromPrice(product: StoreProduct) {
  const prices = product.variants.filter((v) => v.isActive).map((v) => v.price);
  return prices.length ? Math.min(...prices) : 0;
}

export function totalStock(product: StoreProduct) {
  return product.variants.reduce((sum, variant) => sum + variant.stock, 0);
}

/**
 * The chips, derived from what the gym actually sells.
 *
 * The list used to be a fixed pair of Supplements and Accessories, which meant a
 * gym selling apparel had nowhere to file it and a gym selling only supplements
 * showed an empty Accessories chip.
 */
export function categoryChipsFor(products: StoreProduct[]): CategoryChip[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  }

  return [
    { value: ALL_CATEGORIES, label: "All", count: products.length },
    ...[...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ value: name, label: name, count })),
  ];
}

/** The products a toolbar's search, chip and sort leave showing, in order. */
export function filterAndSort(
  products: StoreProduct[],
  { search, category, sort }: { search: string; category: string; sort: string },
) {
  const term = search.trim().toLowerCase();

  const filtered = products.filter((product) => {
    if (category && product.category !== category) return false;
    if (!term) return true;
    return `${product.name} ${product.description ?? ""}`.toLowerCase().includes(term);
  });

  const sorted = [...filtered];
  if (sort === "price-asc") sorted.sort((a, b) => fromPrice(a) - fromPrice(b));
  else if (sort === "price-desc") sorted.sort((a, b) => fromPrice(b) - fromPrice(a));
  else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else sorted.sort((a, b) => b.likeCount - a.likeCount);

  return sorted;
}
