import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAdminProducts } from "@/api/queries/platform";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { Edit2, PackageOpen, Plus, ShoppingBag } from "lucide-react";
import type { Product } from "@/types/api";

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);

export default function AdminCommercePage() {
  const navigate = useNavigate();

  const productsQuery = useAdminProducts({ page: 1, limit: 100 });
  const products = React.useMemo<Product[]>(
    () => productsQuery.data?.data.products ?? [],
    [productsQuery.data],
  );
  const loading = productsQuery.isLoading;
  const error = productsQuery.isError ? getApiError(productsQuery.error) : "";

  if (loading) {
    return <ListPageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">E-commerce Admin</h1>
        <p className="text-muted-foreground">Manage the global product catalog.</p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/platform-commerce/orders")}>
          <ShoppingBag className="h-4 w-4" />
          View Orders
        </Button>
        <Button onClick={() => navigate("/platform-commerce/create")}>
          <Plus className="h-4 w-4" />
          Create Product
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <EmptyState
              icon={PackageOpen}
              title="No products yet"
              description="Create your first catalog item to get started."
            />
          ) : (
            <div className="space-y-3">
              {products.map((product) => (
                <div
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/platform-commerce/products/${product.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/platform-commerce/products/${product.id}`);
                    }
                  }}
                  className="cursor-pointer rounded-md border p-3 transition hover:border-primary/40 hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-1 gap-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded bg-muted">
                        {product.photos.length > 0 ? (
                          <img
                            src={product.photos[0]}
                            alt={product.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            No image
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">{product.category}</p>
                        <p className="text-sm">
                          {fmt(product.price)} | Stock {product.stock}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Min {product.minOrderQty} / Max {product.maxOrderQty}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={product.isActive ? "success" : "secondary"}>
                        {product.isActive ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/platform-commerce/edit/${product.id}`);
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
