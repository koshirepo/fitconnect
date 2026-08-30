/**
 * Documentation: Page control for the client-paged list screens.
 *
 * - Pairs with `usePaginatedList`: it renders the controls, the hook owns the slicing. Both list screens use this one component so the members roster and the payments ledger page identically.
 * - Phones get "Page 2 of 9" between two arrows; from `sm` up the numbers appear, with ellipses around a window of the current page so a long list never grows a hundred buttons.
 * - Renders nothing for a single page. A pagination bar under a list that fits on one screen is noise.
 * - Primary exports: ListPagination.
 */
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The page numbers to draw: always the first and last, plus a window either
 * side of the current page. `null` is a gap.
 */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const window = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  // Keep the strip a constant width near the ends, where the window would
  // otherwise sit lopsided against the first or last page.
  if (page <= 3) [2, 3, 4].forEach((n) => window.add(n));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => window.add(n));

  const pages = [...window].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  return pages.flatMap((n, index) =>
    index > 0 && n - pages[index - 1]! > 1 ? [null, n] : [n],
  );
}

export function ListPagination({
  page,
  totalPages,
  onPageChange,
  rangeStart,
  rangeEnd,
  total,
  /** What the rows are, for the summary line: "members", "payments". */
  label = "results",
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  rangeStart?: number;
  rangeEnd?: number;
  total?: number;
  label?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const go = (next: number) => {
    onPageChange(Math.min(Math.max(next, 1), totalPages));
    // The reader is at the bottom of the list they just finished; the next page
    // should start at its top rather than in its middle.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn(
        "flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row",
        className,
      )}
    >
      {total !== undefined && rangeStart !== undefined && rangeEnd !== undefined && (
        <p className="text-xs text-muted-foreground">
          Showing {rangeStart}–{rangeEnd} of {total} {label}
        </p>
      )}

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          aria-label="Go to previous page"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          <span className="hidden sm:block">Previous</span>
        </Button>

        <span className="px-2 text-sm text-muted-foreground sm:hidden">
          Page {page} of {totalPages}
        </span>

        <ul className="hidden items-center gap-0.5 sm:flex">
          {pageWindow(page, totalPages).map((n, index) =>
            n === null ? (
              <li
                key={`gap-${index}`}
                aria-hidden
                className="px-1 text-sm text-muted-foreground"
              >
                &hellip;
              </li>
            ) : (
              <li key={n}>
                <Button
                  variant={n === page ? "outline" : "ghost"}
                  size="icon-sm"
                  aria-label={`Go to page ${n}`}
                  aria-current={n === page ? "page" : undefined}
                  onClick={() => go(n)}
                >
                  {n}
                </Button>
              </li>
            ),
          )}
        </ul>

        <Button
          variant="ghost"
          size="sm"
          aria-label="Go to next page"
          disabled={page >= totalPages}
          onClick={() => go(page + 1)}
        >
          <span className="hidden sm:block">Next</span>
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}
