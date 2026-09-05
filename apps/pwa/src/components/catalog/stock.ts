/**
 * Documentation: What a stock number means on a card.
 *
 * - The platform shop called it low at 5 and the gym store called it low at 3, in six files between them, each with its own amber. A shopper moving from one to the other saw the same product described two ways, and neither threshold was written down anywhere.
 * - One threshold, one place. Whether scarcity is worth saying is a merchandising decision, not a per-component one.
 * - Deliberately not a component. The shop paints "out of stock" across the whole image and the store puts a bar along the bottom, and both are right for their layout — what has to agree is the *rule*, not the pixels.
 * - Primary exports: LOW_STOCK_THRESHOLD, stockState, stockLabel.
 */

/**
 * Below this many units, say so. Above it, say nothing: a badge on every card
 * is decoration, and on the last two tubs it is information.
 */
export const LOW_STOCK_THRESHOLD = 5;

export type StockState = "out" | "low" | "ok";

export function stockState(stock: number, isActive: boolean = true): StockState {
  if (!isActive || stock <= 0) return "out";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "ok";
}

/** The words that go with the state, or null when there is nothing worth saying. */
export function stockLabel(stock: number, isActive: boolean = true): string | null {
  switch (stockState(stock, isActive)) {
    case "out":
      return isActive ? "Out of stock" : "Unavailable";
    case "low":
      return `Only ${stock} left`;
    default:
      return null;
  }
}
