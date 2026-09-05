/**
 * Documentation: The frame of a product page, for either storefront.
 *
 * - Gallery on the left, everything you read on the right, and whatever the surface sells underneath that. Both storefronts already had exactly this and had drifted on every value nobody chose: `md:grid-cols-2` against `lg:grid-cols-[1fr_420px]`, a square frame against 4:3 capped at 70vh, wrapped thumbnails against a fixed six-column strip.
 * - The split is `lg` rather than `md`. A tablet holding a 420px info column beside a photo gives both too little; one column and a full-width gallery reads better until there is real width to spend.
 * - Badges rather than two conventions. The gym store put the category in a `Badge` and the shop printed it in primary above the title; the badge row carries more (coins, retired) and reads the same in both.
 * - What the surface sells goes in `children`: an Options list of variants, or a price card with a quantity and an Add to Cart. That is the real difference between the two pages and the only one left.
 * - Primary exports: ProductDetailLayout.
 */
import * as React from "react";
import { ProductGallery } from "./product-gallery";

export function ProductDetailLayout({
  name,
  photos,
  videoUrl,
  badges,
  meta,
  actions,
  summary,
  galleryOverlay,
  galleryFallback,
  children,
}: {
  name: string;
  photos: string[];
  videoUrl?: string | null;
  /** Category, coins, retired — the chips under the title. */
  badges?: React.ReactNode;
  /** A line under the title that is not a chip: a rating and its review count. */
  meta?: React.ReactNode;
  /** The page's own controls — like, share, whatever fits beside the title. */
  actions?: React.ReactNode;
  /** The one-line description, above whatever is being sold. */
  summary?: string | null;
  galleryOverlay?: React.ReactNode;
  galleryFallback?: React.ReactNode;
  /** The buy panel and any long-form details. */
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
      <ProductGallery
        photos={photos}
        videoUrl={videoUrl}
        name={name}
        frameClassName="aspect-square max-h-[70vh] w-full"
        overlay={galleryOverlay}
        fallback={galleryFallback}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
            {badges && <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div>}
            {meta}
          </div>
          {actions}
        </div>

        {summary && <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>}

        {children}
      </div>
    </div>
  );
}
