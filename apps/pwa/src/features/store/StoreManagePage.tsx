/**
 * Documentation: The gym's catalogue, as an admin manages it.
 *
 * - Lists everything the gym sells including what it has retired, which the storefront hides. Someone has to be able to see and restore it.
 * - Stock is adjusted here as a delta rather than a new total: two staff counting the same shelf both send what they added and both land, where an absolute figure would make the second silently discard the first.
 * - Deleting is offered knowing the API may retire instead. A product that appears on a receipt cannot be erased without putting holes in a member's order history, so the result says which happened.
 * - Primary exports: StoreManagePage.
 */
import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { getApiError } from "@/api/client";
import {
  useAdjustStoreStock,
  useDeleteStoreProduct,
  useStoreProducts,
  useUpdateStoreProduct,
} from "@/api/queries/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { Archive, Coins, Edit2, Minus, MoreHorizontal, Package, Plus, Trash2 } from "lucide-react";

export default function StoreManagePage() {
  const navigate = useAppNavigate();
  const toast = useToast();

  // Retired products are part of the job here, unlike on the storefront.
  const productsQuery = useStoreProducts({ includeInactive: true });
  const products = React.useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const loading = productsQuery.isPending;

  const adjustStock = useAdjustStoreStock();
  const updateProduct = useUpdateStoreProduct();
  const deleteProduct = useDeleteStoreProduct();

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<{ id: string; name: string } | null>(
    null,
  );
  /** Keyed by variant id, so two shelves can be counted at once. */
  const [stockDrafts, setStockDrafts] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState("");

  /**
   * Send one stock movement.
   *
   * Always a delta, never a total — see the note in the file header about two
   * people counting the same shelf.
   */
  const applyStock = async (variantId: string, variantName: string, delta: number) => {
    setError("");
    try {
      await adjustStock.mutateAsync({ variantId, delta });
      setStockDrafts((prev) => ({ ...prev, [variantId]: "" }));
      toast.success(
        delta > 0 ? `Added ${delta} to ${variantName}.` : `Removed ${-delta} from ${variantName}.`,
      );
    } catch (caught) {
      setError(getApiError(caught));
    }
  };

  const handleStock = (variantId: string, variantName: string) => {
    const raw = stockDrafts[variantId];
    const delta = Number(raw);
    if (!raw || !Number.isInteger(delta) || delta === 0) {
      setError("Enter how many arrived, or a negative number for a correction.");
      return;
    }

    return applyStock(variantId, variantName, delta);
  };

  const handleDeleteConfirmed = async () => {
    if (!pendingDelete) return;
    setConfirmOpen(false);

    try {
      const result = await deleteProduct.mutateAsync(pendingDelete.id);
      toast.success(
        result.retained
          ? `${pendingDelete.name} has sold before, so it was retired rather than deleted.`
          : `${pendingDelete.name} deleted.`,
      );
    } catch (caught) {
      toast.error(getApiError(caught));
    } finally {
      setPendingDelete(null);
    }
  };

  if (loading) return <CardsGridSkeleton count={4} className="gap-4" />;

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Manage store"
        description="What the gym sells, and how much of it is left"
        actions={
          <>
            <Button onClick={() => navigate("/dashboard/store/manage/new")}>
              <Plus className="h-4 w-4" />
              New product
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nothing in the store yet"
          description="Add a supplement or a piece of kit to start selling."
          action={
            <Button onClick={() => navigate("/dashboard/store/manage/new")}>
              <Plus className="h-4 w-4" />
              New product
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {products.map((product) => (
            <Card key={product.id} className={product.isActive ? undefined : "opacity-70"}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {product.name}
                      <Badge variant="secondary" className="text-xs">
                        {product.category}
                      </Badge>
                      {product.coinsGranted > 0 && (
                        <Badge variant="accent" className="text-xs">
                          <Coins className="mr-1 h-3 w-3" />+{product.coinsGranted}
                        </Badge>
                      )}
                      {!product.isActive && (
                        <Badge variant="warning" className="text-xs">
                          Retired
                        </Badge>
                      )}
                    </CardTitle>
                    {product.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{product.description}</p>
                    )}
                  </div>

                  {/* One menu rather than three buttons per product. With a
                      dozen products the old row repeated Retire/edit/delete
                      down the page, and the two destructive ones sat at the
                      same weight as the everyday edit. */}
                  <Menu>
                    <MenuTrigger
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
                      aria-label={`Actions for ${product.name}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </MenuTrigger>
                    <MenuContent align="end" side="bottom">
                      <MenuItem
                        onClick={() => navigate(`/dashboard/store/manage/${product.id}/edit`)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </MenuItem>
                      <MenuItem
                        onClick={() =>
                          updateProduct.mutateAsync({
                            productId: product.id,
                            payload: { isActive: !product.isActive },
                          })
                        }
                      >
                        <Archive className="h-3.5 w-3.5" />
                        {product.isActive ? "Retire" : "Restore"}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem
                        className="text-destructive"
                        onClick={() => {
                          setPendingDelete({ id: product.id, name: product.name });
                          setConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                {product.variants.map((variant) => (
                  <div
                    key={variant.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {variant.name}
                        {!variant.isActive && (
                          <span className="ml-2 text-xs text-muted-foreground">retired</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(variant.price)} ·{" "}
                        <span className={variant.stock === 0 ? "text-destructive" : undefined}>
                          {variant.stock} in stock
                        </span>
                      </p>
                    </div>

                    {/* Still a delta, for the reason in the file header — but
                        the two commonest ones are "sold one" and "took one in",
                        so those are a button each rather than typing a number
                        and reaching for Apply. The field stays for a delivery
                        of thirty, and commits on Enter; Apply only appears once
                        something is typed, instead of sitting on every row of
                        every product forever. */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="icon-xs"
                        disabled={variant.stock === 0}
                        onClick={() => applyStock(variant.id, variant.name, -1)}
                        aria-label={`One fewer ${variant.name}`}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() => applyStock(variant.id, variant.name, 1)}
                        aria-label={`One more ${variant.name}`}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        step={1}
                        className="h-9 w-20"
                        placeholder="± n"
                        value={stockDrafts[variant.id] ?? ""}
                        onChange={(e) =>
                          setStockDrafts((prev) => ({ ...prev, [variant.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleStock(variant.id, variant.name);
                          }
                        }}
                        aria-label={`Stock change for ${variant.name}`}
                      />
                      {(stockDrafts[variant.id] ?? "").trim() !== "" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStock(variant.id, variant.name)}
                        >
                          Apply
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${pendingDelete?.name ?? "this product"}?`}
        description="If it has ever sold, it is retired instead so past receipts stay readable."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
