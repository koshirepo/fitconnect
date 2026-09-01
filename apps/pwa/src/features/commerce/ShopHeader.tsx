/**
 * Documentation: The storefront's sticky sub-header.
 *
 * - The bar every shop screen carries under the site header: a way back, whatever names the current screen, and the same right-hand cluster of Order Status, My Orders, and the cart with its count.
 * - The left side is a slot rather than a prop soup: the catalog puts a title and tagline there, the product page puts a breadcrumb. Everything to the right is identical on both, which is exactly why it lives here instead of being typed out twice.
 * - Signing in is deliberately absent. The site header above this bar already offers it, and two sign-in buttons on one screen read as two different sign-ins.
 * - Primary exports: ShopHeader.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, ShoppingCart } from "lucide-react";
import { useAuthStore } from "@/stores/auth";

export function ShopHeader({
  backTo,
  backLabel,
  cartCount,
  children,
}: {
  /** Where the arrow goes: the catalog leaves the shop, a product returns to it. */
  backTo: string;
  /** Shown beside the arrow on wider screens; omitted for a bare back arrow. */
  backLabel?: string;
  cartCount: number;
  /** What names this screen — a title block, or a breadcrumb. */
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel && <span className="hidden sm:inline ml-1">{backLabel}</span>}
          </Button>
          {children}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/shop/orders/lookup")}>
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline ml-1.5">Order Status</span>
          </Button>
          {isAuthenticated && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/orders/history")}>
              My Orders
            </Button>
          )}
          <Button
            onClick={() => navigate("/shop/cart")}
            disabled={cartCount === 0}
            className="relative"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="ml-1.5">Cart</span>
            {cartCount > 0 && (
              <Badge
                variant="secondary"
                className="absolute bg-accent-foreground -top-2 -right-2 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
              >
                {cartCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
