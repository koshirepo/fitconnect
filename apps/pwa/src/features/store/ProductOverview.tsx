/**
 * Documentation: Everything about a product except who may act on it.
 *
 * - The half of a product page that reads the same to a member, to a visitor with no account, and to an admin previewing their own catalogue: the media, the name, what it earns, the long description, and every variant with its price and stock.
 * - Deliberately has no buy button and no like button. Those differ by who is looking, so each page passes its own in as `action`, and this file stays the one place the shared half is described.
 * - A sold-out variant is shown rather than hidden. "Chocolate 1kg — out of stock" tells a reader something; a silently missing row reads as a gym that never stocked it.
 * - Primary exports: ProductOverview.
 */
import * as React from "react";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownView } from "@/components/ui/markdown-view";
import { formatCurrency } from "@/lib/utils";
import type { StoreProduct, StoreVariant } from "@fitconnect/shared/types/models";
import { ProductMedia } from "./ProductMedia";

export function ProductOverview({
  product,
  action,
  renderVariantAction,
}: {
  product: StoreProduct;
  /** The page's own controls — a like button, a link back, whatever fits. */
  action?: React.ReactNode;
  /** A per-variant control, for the pages where a variant can be bought. */
  renderVariantAction?: (variant: StoreVariant) => React.ReactNode;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ProductMedia photos={product.photos} videoUrl={product.videoUrl} name={product.name} />

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {product.category === "ACCESSORY" ? "Accessory" : "Supplement"}
              </Badge>
              {product.coinsGranted > 0 && (
                <Badge variant="accent" className="text-xs">
                  <Coins className="mr-1 h-3 w-3" />+{product.coinsGranted} coins
                </Badge>
              )}
              {!product.isActive && (
                <Badge variant="warning" className="text-xs">
                  Retired
                </Badge>
              )}
            </div>
          </div>
          {action}
        </div>

        {product.description && (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {product.variants.map((variant) => {
              const soldOut = variant.stock <= 0;

              return (
                <div
                  key={variant.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    {/* Wrapped, not truncated: "Chocolate 1kg" losing its size
                        to an ellipsis would price the wrong thing. */}
                    <p className="break-words text-sm font-medium">{variant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {soldOut ? "Out of stock" : `${variant.stock} left`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(variant.price)}
                    </span>
                    {renderVariantAction?.(variant)}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {product.markdown && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <MarkdownView>{product.markdown}</MarkdownView>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
