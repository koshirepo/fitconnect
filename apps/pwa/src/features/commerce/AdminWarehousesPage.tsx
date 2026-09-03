/**
 * Documentation: Warehouses — where the shop's parcels leave from.
 *
 * - One screen for the places stock sits: adding them, correcting them, saying which one is the fallback, and asking Delhivery to come and collect what is waiting.
 * - Registration state is the thing this page exists to make visible. A warehouse this app knows about but Delhivery does not cannot ship anything, and that difference is invisible everywhere else until a manifest is refused.
 * - The name is asked for once and never editable: Delhivery keys its pickup locations on that string, and renaming would orphan every parcel already manifested under the old one.
 * - Primary exports: AdminWarehousesPage.
 */
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import {
  useCreateWarehouse,
  useDeleteWarehouse,
  useRegisterWarehouse,
  useSchedulePickup,
  useUpdateWarehouse,
  useWarehouses,
} from "@/api/queries/platform";
import { getApiError } from "@/api/client";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";
import {
  Warehouse as WarehouseIcon,
  Plus,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Star,
  Trash2,
  RefreshCw,
} from "lucide-react";
import type { Warehouse } from "@/types/api";

type WarehouseForm = {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  /** Ticked when Delhivery already holds this pickup location. */
  alreadyRegistered: boolean;
};

const EMPTY_FORM: WarehouseForm = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  alreadyRegistered: false,
};

/** Tomorrow, which is the earliest a collection realistically happens. */
function defaultPickupDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default function AdminWarehousesPage() {
  const toast = useToast();
  const { can } = usePermissions();
  const canRead = can(Permission.PLATFORM_PRODUCTS_READ);
  const canCreate = can(Permission.PLATFORM_PRODUCTS_CREATE);
  const canUpdate = can(Permission.PLATFORM_PRODUCTS_UPDATE);
  const canDelete = can(Permission.PLATFORM_PRODUCTS_DELETE);
  const canSchedule = can(Permission.PLATFORM_ORDERS_UPDATE);

  const warehousesQuery = useWarehouses();
  const warehouses = warehousesQuery.data ?? [];

  const createWarehouse = useCreateWarehouse();
  const updateWarehouse = useUpdateWarehouse();
  const registerWarehouse = useRegisterWarehouse();
  const deleteWarehouse = useDeleteWarehouse();
  const schedulePickup = useSchedulePickup();

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<WarehouseForm>(EMPTY_FORM);
  const [editing, setEditing] = React.useState<Warehouse | null>(null);
  const [pickupFor, setPickupFor] = React.useState<Warehouse | null>(null);
  const [pickupDate, setPickupDate] = React.useState(defaultPickupDate);
  const [pickupTime, setPickupTime] = React.useState("14:00");
  const [deleting, setDeleting] = React.useState<Warehouse | null>(null);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState("");

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setFormOpen(true);
  };

  const openEdit = (warehouse: Warehouse) => {
    setEditing(warehouse);
    setForm({
      name: warehouse.name,
      contactPerson: warehouse.contactPerson ?? "",
      phone: warehouse.phone,
      email: warehouse.email ?? "",
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state,
      pincode: warehouse.pincode,
      alreadyRegistered: Boolean(warehouse.registeredAt),
    });
    setError("");
    setFormOpen(true);
  };

  const save = async () => {
    setWorking(true);
    setError("");

    const payload = {
      contactPerson: form.contactPerson.trim() || undefined,
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      address: form.address.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      pincode: form.pincode.trim(),
    };

    try {
      if (editing) {
        const result = await updateWarehouse.mutateAsync({
          warehouseId: editing.id,
          data: payload,
        });
        // The courier refusing is not the save failing. Both outcomes are
        // reported, and the row keeps whichever one happened.
        if (result.registerError) {
          toast.error(`Saved, but Delhivery refused it: ${result.registerError}`);
        } else {
          toast.success("Warehouse updated and synced with Delhivery.");
        }
      } else {
        const result = await createWarehouse.mutateAsync({
          ...payload,
          name: form.name.trim(),
          ...(form.alreadyRegistered ? { alreadyRegistered: true } : {}),
        });
        if (result.registerError) {
          toast.error(`Created, but Delhivery refused it: ${result.registerError}`);
        } else {
          toast.success(
            form.alreadyRegistered
              ? "Warehouse linked to the pickup location Delhivery already holds."
              : "Warehouse created and registered with Delhivery.",
          );
        }
      }
      setFormOpen(false);
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  const run = async (label: string, action: () => Promise<unknown>) => {
    setWorking(true);
    try {
      await action();
      toast.success(label);
    } catch (err: unknown) {
      toast.error(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  if (!canRead) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Warehouses</h1>
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  if (warehousesQuery.isLoading) return <CardsGridSkeleton count={3} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Warehouses</h1>
          <p className="text-muted-foreground">
            Where parcels ship from, and the only place to manage them. Each one is
            a Delhivery pickup location. Delhivery cannot be asked what it holds, so a
            location made in its panel appears here only once you add it with
            &ldquo;already a pickup location&rdquo; ticked.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add warehouse
          </Button>
        )}
      </div>

      {warehouses.length === 0 ? (
        <EmptyState
          icon={WarehouseIcon}
          title="No warehouses yet"
          description="Add the place your parcels ship from. It is registered with Delhivery as you save it, and becomes the default for every product that names no warehouse of its own."
          action={canCreate ? <Button onClick={openCreate}>Add warehouse</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {warehouses.map((warehouse) => (
            <Card key={warehouse.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span className="truncate">{warehouse.name}</span>
                    {warehouse.isDefault && (
                      <Badge variant="secondary">
                        <Star className="mr-1 h-3 w-3" />
                        Default
                      </Badge>
                    )}
                    {!warehouse.isActive && <Badge variant="outline">Inactive</Badge>}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {warehouse.address}, {warehouse.city}, {warehouse.state} {warehouse.pincode}
                  </p>
                </div>
                {warehouse.registeredAt ? (
                  <Badge variant="success" className="shrink-0">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Registered
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="shrink-0">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Not registered
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  <p>{warehouse.phone}</p>
                  {warehouse.email && <p>{warehouse.email}</p>}
                  <p className="mt-1">
                    {warehouse._count?.products ?? 0} product
                    {(warehouse._count?.products ?? 0) === 1 ? "" : "s"} ship from here
                  </p>
                  {warehouse.registeredAt && (
                    <p className="mt-1 text-xs">
                      Registered {formatDateTime(warehouse.registeredAt)}
                    </p>
                  )}
                </div>

                {/* The courier's own words. Registration failures are almost
                    always a fixable address or a name it already holds. */}
                {warehouse.registerError && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {warehouse.registerError}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {canUpdate && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(warehouse)}>
                      Edit
                    </Button>
                  )}
                  {canUpdate && !warehouse.registeredAt && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={working}
                      onClick={() =>
                        run("Registered with Delhivery.", () =>
                          registerWarehouse.mutateAsync(warehouse.id),
                        )
                      }
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry registration
                    </Button>
                  )}
                  {canUpdate && !warehouse.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={working}
                      onClick={() =>
                        run("Default warehouse changed.", () =>
                          updateWarehouse.mutateAsync({
                            warehouseId: warehouse.id,
                            data: { isDefault: true },
                          }),
                        )
                      }
                    >
                      <Star className="h-4 w-4" />
                      Make default
                    </Button>
                  )}
                  {canSchedule && warehouse.registeredAt && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={working}
                      onClick={() => {
                        setPickupFor(warehouse);
                        setPickupDate(defaultPickupDate());
                      }}
                    >
                      <Truck className="h-4 w-4" />
                      Schedule pickup
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={working}
                      onClick={() => setDeleting(warehouse)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add / edit ─────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit warehouse" : "Add warehouse"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Changes are pushed to Delhivery so the label prints the right address."
                : "This is registered with Delhivery as you save it. The name cannot be changed afterwards — Delhivery matches every manifest to it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                id="wh-name"
                value={form.name}
                disabled={Boolean(editing)}
                placeholder="Rudra Gym Bakhri"
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              {editing && (
                <p className="text-xs text-muted-foreground">
                  Fixed: Delhivery identifies this pickup location by its name.
                </p>
              )}
            </div>

            {/* Bringing in a location Delhivery already holds.

                Delhivery will not say what pickup locations it has — the API
                offers create and edit and nothing that reads — so one made in
                their panel cannot be discovered, only declared. Registering it
                again would be refused or leave a duplicate competing with the
                real one, so this path writes the row and tells the courier
                nothing. */}
            {!editing && (
              <label
                htmlFor="wh-already"
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
              >
                <Checkbox
                  id="wh-already"
                  checked={form.alreadyRegistered}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, alreadyRegistered: checked === true }))
                  }
                  className="mt-0.5"
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    Already a pickup location in Delhivery
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Links it instead of registering it again. The name must match
                    the Delhivery panel exactly — every manifest is keyed on it.
                  </span>
                </span>
              </label>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wh-contact">Contact person</Label>
                <Input
                  id="wh-contact"
                  value={form.contactPerson}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, contactPerson: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-phone">Phone</Label>
                <PhoneInput
                  id="wh-phone"
                  value={form.phone}
                  placeholder="9876543210"
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wh-email">Email</Label>
              <Input
                id="wh-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wh-address">Address</Label>
              <Input
                id="wh-address"
                value={form.address}
                placeholder="Shop 4, Main Road, Bakhri Bazar"
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="wh-pincode">Pincode</Label>
                <Input
                  id="wh-pincode"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pincode}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-city">City</Label>
                <Input
                  id="wh-city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wh-state">State</Label>
                <Input
                  id="wh-state"
                  value={form.state}
                  placeholder="BR"
                  onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={working}>
              Cancel
            </Button>
            <Button onClick={save} disabled={working}>
              {working ? "Saving…" : editing ? "Save changes" : "Create & register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pickup ─────────────────────────────────────────────────────── */}
      <Dialog open={Boolean(pickupFor)} onOpenChange={(open) => !open && setPickupFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule a pickup</DialogTitle>
            <DialogDescription>
              Delhivery collects from {pickupFor?.name}. The package count is whatever is
              manifested and still waiting there, counted when you send this.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pickup-date">Date</Label>
              <Input
                id="pickup-date"
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pickup-time">Time</Label>
              <Input
                id="pickup-time"
                type="time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPickupFor(null)} disabled={working}>
              Cancel
            </Button>
            <Button
              disabled={working}
              onClick={async () => {
                if (!pickupFor) return;
                await run("Pickup scheduled with Delhivery.", () =>
                  schedulePickup.mutateAsync({
                    warehouseId: pickupFor.id,
                    data: { pickupDate, pickupTime: `${pickupTime}:00` },
                  }),
                );
                setPickupFor(null);
              }}
            >
              Request pickup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "warehouse"}?`}
        description="Delhivery keeps the pickup location on its own books; this only stops the shop manifesting from it. A warehouse that still stocks products cannot be deleted."
        confirmLabel="Delete"
        loading={working}
        onConfirm={async () => {
          if (!deleting) return;
          await run("Warehouse deleted.", () => deleteWarehouse.mutateAsync(deleting.id));
          setDeleting(null);
        }}
      />
    </div>
  );
}
