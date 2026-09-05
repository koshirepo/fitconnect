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
import type { StoreProduct } from "@fitconnect/shared/types/models";
import { ProductDetailLayout } from "@/components/catalog/product-detail-layout";
import { VariantOptionsCard, type VariantRow } from "@/components/catalog/variant-options";

export function ProductOverview({
  product,
  action,
  quantityFor,
  onQuantityChange,
}: {
  product: StoreProduct;
  /** The page's own controls — a like button, a link back, whatever fits. */
  action?: React.ReactNode;
  /** How many of a variant the caller currently holds. */
  quantityFor?: (variant: VariantRow) => number;
  /** Where a variant can be bought. Omitted on a read-only preview. */
  onQuantityChange?: (variant: VariantRow, quantity: number) => void;
}) {
  return (
    <ProductDetailLayout
      name={product.name}
      photos={product.photos}
      videoUrl={product.videoUrl}
      summary={product.description}
      actions={action}
      badges={
        <>
          <Badge variant="secondary" className="text-xs">
            {product.category}
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
        </>
      }
    >
        <VariantOptionsCard
          variants={product.variants}
          quantityFor={quantityFor ?? (() => 0)}
          onQuantityChange={onQuantityChange ?? (() => {})}
        />

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
    </ProductDetailLayout>
  );
}
