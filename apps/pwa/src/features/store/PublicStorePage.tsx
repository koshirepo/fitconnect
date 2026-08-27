/**
 * Documentation: A gym's shop window, for somebody with no account.
 *
 * - Anyone can see what a gym sells, at what price, and how much is left. Buying still needs an account, because an order has to hang off a membership and the coins have to land somewhere.
 * - Reads the unauthenticated `/public/store` endpoint, which returns only what is actually for sale: a visitor cannot tell "we stopped stocking this" from "we never did", so retired products and variants are left out entirely.
 * - Shares `StoreVariantPicker` with the signed-in storefront, passing `canBuy` false, so the two can never drift into showing prices or stock differently.
 * - Primary exports: PublicStorePage.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { publicApi } from "@/api/public";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import type { StoreProduct } from "@fitconnect/shared/types/models";
import { StoreVariantPicker } from "./StoreVariantPicker";

export default function PublicStorePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [products, setProducts] = React.useState<StoreProduct[]>([]);
  const [gymName, setGymName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;

    publicApi
      .getStore()
      .then((res) => {
        if (!active) return;
        setProducts(res.data.data.products);
        setGymName(res.data.data.tenant.name);
      })
      .catch((caught) => {
        if (active) setError(getApiError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <CardsGridSkeleton count={6} className="gap-4" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {gymName ? `${gymName} Store` : "Store"}
          </h1>
          <p className="text-muted-foreground">Supplements and kit, sold at the gym</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      {error ? (
        <EmptyState
          icon={ShoppingBag}
          title="The store could not be loaded"
          description={error}
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nothing in the store yet"
          description="This gym has not added anything to sell."
        />
      ) : (
        <>
          {/* Browsing is open; buying is not. Said once here rather than as a
              disabled button on every card. */}
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm text-muted-foreground">
                {isAuthenticated
                  ? "Open the store from your dashboard to buy."
                  : "Sign in as a member to buy any of this."}
              </p>
              <Button
                size="sm"
                onClick={() => navigate(isAuthenticated ? "/dashboard/store" : "/login")}
              >
                {isAuthenticated ? "Go to store" : "Sign in"}
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <StoreVariantPicker
                key={product.id}
                product={product}
                canBuy={false}
                onAdd={() => {}}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
