/**
 * Documentation: One product on the storefront, with its variants.
 *
 * - A supplement is bought as a flavour and a size, and a glove as a size and a colour, so the card sells the variant rather than the product. Each is priced and stocked on its own.
 * - A variant with nothing left is shown rather than hidden: "Chocolate 1kg — out of stock" tells a member something, while a silently missing row reads as a gym that never stocked it.
 * - Primary exports: StoreVariantPicker.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Coins, Plus } from "lucide-react";
import type { StoreProduct, StoreVariant } from "@fitconnect/shared/types/models";

export function StoreVariantPicker({
  product,
  canBuy,
  onAdd,
}: {
  product: StoreProduct;
  /** False for someone browsing without the right to purchase. */
  canBuy: boolean;
  onAdd: (variant: StoreVariant) => void;
}) {
  const photo = Array.isArray(product.photos) ? product.photos[0] : undefined;

  return (
    <Card className="overflow-hidden">
      {photo && (
        <div className="aspect-video w-full overflow-hidden bg-muted">
          <img
            src={photo}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{product.name}</CardTitle>
          {product.coinsGranted > 0 && (
            <Badge variant="accent" className="shrink-0 text-xs">
              <Coins className="mr-1 h-3 w-3" />+{product.coinsGranted}
            </Badge>
          )}
        </div>
        {product.description && (
          <p className="text-xs text-muted-foreground">{product.description}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {product.variants.map((variant) => {
          const soldOut = variant.stock <= 0;

          return (
            <div
              key={variant.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{variant.name}</p>
                <p className="text-xs text-muted-foreground">
                  {soldOut ? "Out of stock" : `${variant.stock} left`}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(variant.price)}
                </span>
                {canBuy && (
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={soldOut}
                    onClick={() => onAdd(variant)}
                    aria-label={`Add ${product.name} ${variant.name} to basket`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
