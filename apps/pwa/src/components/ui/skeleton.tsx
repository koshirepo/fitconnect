"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton placeholders shown while data loads.
 *
 * - `Skeleton` is the shimmering block primitive: an empty rounded element that
 *   pulses between the theme's muted tones. Everything here composes on top of it.
 * - The composites mirror the app's real page shapes (list pages, detail pages,
 *   form pages, stat grids) so swap-in loading screens read like the finished
 *   screen instead of a generic spinner.
 *
 * Primary exports: Skeleton, and the composite page skeletons.
 */

/** Shimmering block primitive. Defaults to a single text line. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-skeleton rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/** A stack of text lines. `width` accepts any Tailwind width utility. */
function SkeletonText({
  lines = 1,
  lastWidth = "w-2/3",
  className,
}: {
  lines?: number;
  lastWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 && lastWidth)} />
      ))}
    </div>
  );
}

/** Small square avatar tile, matching the app's person-card look. */
function SkeletonAvatar({ className }: { className?: string }) {
  return <Skeleton className={cn("h-12 w-12 shrink-0 rounded-md", className)} />;
}

/** One member-card-style row: square avatar beside two text lines. */
function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full items-center gap-3", className)}>
      <SkeletonAvatar />
      <div className="min-w-0 flex-1">
        <SkeletonText lines={2} lastWidth="w-1/3" />
      </div>
    </div>
  );
}

/**
 * Page heading with an action button beside it.
 *
 * Wraps rather than staying on one line: several pages stack their title and
 * action on a phone, and a header that refuses to wrap would sit one row taller
 * than the page it precedes, shifting everything below it on load.
 */
function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      <Skeleton className="h-9 w-28 shrink-0" />
    </div>
  );
}

/**
 * A row of stat cards, for dashboards and finance/report pages.
 *
 * The default is the two-up-then-four shape those screens use. A page whose
 * real grid differs passes its own columns through `className` — `cn` merges
 * Tailwind conflicts, so `grid-cols-1 sm:grid-cols-2` replaces the defaults
 * rather than fighting them. Keep the two in step: a skeleton that reflows at
 * a different breakpoint than the content it stands in for makes the page
 * jump on load, which is the one thing a skeleton exists to prevent.
 */
function StatGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-lg" />
      ))}
    </div>
  );
}

/** Responsive grid of member/person cards. */
function CardsGridSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg ring-1 ring-foreground/10">
          <SkeletonRow className="p-4" />
        </div>
      ))}
    </div>
  );
}

/**
 * Search input + filter selects, for list pages with a filter toolbar.
 *
 * Both parts are optional because the list pages differ: some have a search box
 * and one select, some have neither. Drawing controls a page does not have is
 * worse than drawing none — the toolbar vanishes when the data lands and the
 * whole list jumps up.
 */
function FilterBarSkeleton({
  search = true,
  filters = 3,
  className,
}: {
  search?: boolean;
  filters?: number;
  className?: string;
}) {
  if (!search && filters <= 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {search && <Skeleton className="h-12 w-full rounded-lg" />}
      {filters > 0 && (
        <div
          className="grid gap-2 sm:gap-3"
          style={{ gridTemplateColumns: `repeat(${filters}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: filters }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Full list-page shell: heading, optional filter bar, then a stack of rows.
 *
 * Pass the toolbar the page actually has. The defaults suit a filtered roster;
 * a plain list should pass `search={false} filters={0}`.
 */
function ListPageSkeleton({
  rows = 6,
  search = true,
  filters = 3,
}: {
  rows?: number;
  search?: boolean;
  filters?: number;
}) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <FilterBarSkeleton search={search} filters={filters} />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-lg ring-1 ring-foreground/10">
            <SkeletonRow className="p-3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail-page shell: heading, then a two-column body of text shelves. */
function DetailPageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      <PageHeaderSkeleton />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-lg ring-1 ring-foreground/10">
            <SkeletonRow className="p-4" />
          </div>
        </div>
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-lg p-4 ring-1 ring-foreground/10">
              <Skeleton className="h-4 w-32" />
              <SkeletonText lines={3} className="w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Form-page shell: heading, then stacked labelled form fields. */
function FormPageSkeleton({ fields = 5, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      <PageHeaderSkeleton />
      <div className="space-y-5 rounded-lg p-4 ring-1 ring-foreground/10">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>
    </div>
  );
}

/** Generic content card, for Suspense/lazy-route fallbacks where the page
 * shape isn't known yet. */
function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4 rounded-lg p-4 ring-1 ring-foreground/10", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonRow,
  PageHeaderSkeleton,
  StatGridSkeleton,
  CardsGridSkeleton,
  FilterBarSkeleton,
  ListPageSkeleton,
  DetailPageSkeleton,
  FormPageSkeleton,
  CardSkeleton,
};