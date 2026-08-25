import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import {
  useCharges,
  useCreateCharge,
  useCreateShift,
  useDeleteCharge,
  useDeleteShift,
  useShifts,
  useTenantSettings,
  useUpdateCharge,
  useUpdateShift,
  useUpdateTenantSettings,
} from "@/api/queries/catalog";
import { getApiError } from "@/api/client";
import { formatShiftWindow } from "@/lib/shifts";
import type { TenantCharge, Shift } from "@/types/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings,
  Plus,
  Pencil,
  Trash2,
  IndianRupee,
  Clock,
  Shield,
  MessageSquare,
  Globe,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageLoader } from "@/components/ui/spinner";

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function GymSettingsPage() {
  const { currentTenantId } = useAuthStore();
  const navigate = useNavigate();

  // Three parallel reads; each write below invalidates the settings or shifts
  // key, so the lists refresh themselves rather than being patched in place.
  const settingsQuery = useTenantSettings();
  const chargesQuery = useCharges();
  const shiftsQuery = useShifts(true);

  const charges = React.useMemo<TenantCharge[]>(
    () => chargesQuery.data ?? [],
    [chargesQuery.data],
  );
  const shifts = React.useMemo<Shift[]>(() => shiftsQuery.data ?? [], [shiftsQuery.data]);
  const loading = settingsQuery.isLoading || chargesQuery.isLoading || shiftsQuery.isLoading;

  const updateSettings = useUpdateTenantSettings();
  const createCharge = useCreateCharge();
  const updateCharge = useUpdateCharge();
  const deleteCharge = useDeleteCharge();
  const createShift = useCreateShift();
  const updateShift = useUpdateShift();
  const deleteShift = useDeleteShift();

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");

  // Delete confirm
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingChargeId, setPendingChargeId] = React.useState<string | null>(
    null,
  );
  const [shiftConfirmOpen, setShiftConfirmOpen] = React.useState(false);
  const [pendingShiftId, setPendingShiftId] = React.useState<string | null>(
    null,
  );

  // Settings form
  const [overdueDays, setOverdueDays] = React.useState(30);

  // Charge form
  const [showChargeForm, setShowChargeForm] = React.useState(false);
  const [editingCharge, setEditingCharge] = React.useState<TenantCharge | null>(
    null,
  );
  const [chargeName, setChargeName] = React.useState("");
  const [chargeAmount, setChargeAmount] = React.useState("");
  const [chargeMandatory, setChargeMandatory] = React.useState(true);
  const [chargeSaving, setChargeSaving] = React.useState(false);

  // Shift form
  const [showShiftForm, setShowShiftForm] = React.useState(false);
  const [editingShift, setEditingShift] = React.useState<Shift | null>(null);
  const [shiftName, setShiftName] = React.useState("");
  const [shiftDescription, setShiftDescription] = React.useState("");
  const [shiftStartTime, setShiftStartTime] = React.useState("");
  const [shiftEndTime, setShiftEndTime] = React.useState("");
  const [shiftSaving, setShiftSaving] = React.useState(false);

  // Seed the form from the loaded settings once they arrive.
  React.useEffect(() => {
    if (settingsQuery.data) setOverdueDays(settingsQuery.data.overdueDays);
  }, [settingsQuery.data]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const settings = await updateSettings.mutateAsync({ overdueDays });
      setOverdueDays(settings.overdueDays);
      setSuccessMsg("Settings saved successfully.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const resetChargeForm = () => {
    setChargeName("");
    setChargeAmount("");
    setChargeMandatory(true);
    setEditingCharge(null);
    setShowChargeForm(false);
  };

  const handleEditCharge = (charge: TenantCharge) => {
    setEditingCharge(charge);
    setChargeName(charge.name);
    setChargeAmount(String(charge.amount));
    setChargeMandatory(charge.isMandatory);
    setShowChargeForm(true);
  };

  const handleSaveCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;
    setChargeSaving(true);
    setError("");
    try {
      const parsedChargeAmount = Number(chargeAmount);
      if (!Number.isInteger(parsedChargeAmount) || parsedChargeAmount < 0) {
        setError("Charge amount must be 0 or more in whole rupees.");
        return;
      }
      if (editingCharge) {
        await updateCharge.mutateAsync({
          chargeId: editingCharge.id,
          data: {
            name: chargeName,
            amount: parsedChargeAmount,
            isMandatory: chargeMandatory,
          },
        });
      } else {
        await createCharge.mutateAsync({
          name: chargeName,
          amount: parsedChargeAmount,
          isMandatory: chargeMandatory,
        });
      }
      resetChargeForm();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setChargeSaving(false);
    }
  };

  const handleDeleteCharge = (chargeId: string) => {
    if (!currentTenantId) return;
    setPendingChargeId(chargeId);
    setConfirmOpen(true);
  };

  const handleDeleteChargeConfirmed = async () => {
    if (!pendingChargeId) return;
    try {
      await deleteCharge.mutateAsync(pendingChargeId);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setPendingChargeId(null);
    }
  };

  const handleToggleActive = async (charge: TenantCharge) => {
    try {
      await updateCharge.mutateAsync({
        chargeId: charge.id,
        data: { isActive: !charge.isActive },
      });
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const resetShiftForm = () => {
    setShiftName("");
    setShiftDescription("");
    setShiftStartTime("");
    setShiftEndTime("");
    setEditingShift(null);
    setShowShiftForm(false);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setShiftName(shift.name);
    setShiftDescription(shift.description ?? "");
    setShiftStartTime(shift.startTime);
    setShiftEndTime(shift.endTime);
    setShowShiftForm(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;
    setShiftSaving(true);
    setError("");
    try {
      const shiftPayload = {
        name: shiftName,
        description: shiftDescription || undefined,
        startTime: shiftStartTime,
        endTime: shiftEndTime,
      };

      if (editingShift) {
        await updateShift.mutateAsync({ shiftId: editingShift.id, data: shiftPayload });
      } else {
        await createShift.mutateAsync(shiftPayload);
      }
      resetShiftForm();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setShiftSaving(false);
    }
  };

  const handleDeleteShift = (shiftId: string) => {
    if (!currentTenantId) return;
    setPendingShiftId(shiftId);
    setShiftConfirmOpen(true);
  };

  const handleDeleteShiftConfirmed = async () => {
    if (!pendingShiftId) return;
    try {
      await deleteShift.mutateAsync(pendingShiftId);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setPendingShiftId(null);
    }
  };

  const handleToggleShiftActive = async (shift: Shift) => {
    try {
      await updateShift.mutateAsync({
        shiftId: shift.id,
        data: { isActive: !shift.isActive },
      });
    } catch (err) {
      setError(getApiError(err));
    }
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gym Settings</h1>
          <p className="text-muted-foreground">
            Configure gym-level settings, charges, and shifts
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600">
          {successMsg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Public Page
          </CardTitle>
          <CardDescription>
            Manage the public-facing profile for your gym on a dedicated page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Update your gym name, logo, phone, address, short description, and about content.
          </p>
          <Button type="button" variant="outline" onClick={() => navigate("/settings/public-page")}>
            Edit Public Page
          </Button>
        </CardContent>
      </Card>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>
            Configure general gym operational settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="overdueDays">Overdue Days</Label>
                <Input
                  id="overdueDays"
                  type="number"
                  min={1}
                  max={365}
                  value={overdueDays}
                  onChange={(e) => setOverdueDays(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Days after subscription expiry to auto-inactivate member
                </p>
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Messages
          </CardTitle>
          <CardDescription>
            Manage tenant-specific WhatsApp templates for welcome messages,
            reminders, receipts, and future message flows.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Open the dedicated messages page to edit template bodies and
            placeholders.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/settings/messages")}
          >
            Manage Messages
          </Button>
        </CardContent>
      </Card>

      {/* Charges */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IndianRupee className="h-5 w-5" />
                Fixed Charges
              </CardTitle>
              <CardDescription>
                Manage one-time charges like admission fee, security deposit,
                etc.
              </CardDescription>
            </div>
            {!showChargeForm && (
              <Button size="sm" onClick={() => setShowChargeForm(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add Charge
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Charge Form */}
          {showChargeForm && (
            <form
              onSubmit={handleSaveCharge}
              className="rounded-lg border bg-muted/50 p-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="chargeName">Charge Name</Label>
                  <Input
                    id="chargeName"
                    placeholder="e.g. Admission Fee"
                    value={chargeName}
                    onChange={(e) => setChargeName(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chargeAmount">Amount (₹)</Label>
                  <Input
                    id="chargeAmount"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="500"
                    value={chargeAmount}
                    onChange={(e) => setChargeAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chargeMandatory}
                  onChange={(e) => setChargeMandatory(e.target.checked)}
                  className="rounded"
                />
                Mandatory for new members
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={chargeSaving}>
                  {chargeSaving
                    ? "Saving..."
                    : editingCharge
                      ? "Update"
                      : "Add"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetChargeForm}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Charges List */}
          {charges.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No charges configured yet. Add charges like admission fee,
              security deposit, etc.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {charges.map((charge) => (
                <div
                  key={charge.id}
                  className={`flex items-center justify-between p-3 ${!charge.isActive ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-sm">{charge.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatAmount(charge.amount)}</span>
                        {charge.isMandatory && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                            <Shield className="h-3 w-3" />
                            Mandatory
                          </span>
                        )}
                        {!charge.isActive && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                            Inactive
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleToggleActive(charge)}
                      title={charge.isActive ? "Deactivate" : "Activate"}
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleEditCharge(charge)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDeleteCharge(charge.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Shifts
              </CardTitle>
              <CardDescription>
                Manage gym shifts that can be assigned while adding members.
              </CardDescription>
            </div>
            {!showShiftForm && (
              <Button size="sm" onClick={() => setShowShiftForm(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Add Shift
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showShiftForm && (
            <form
              onSubmit={handleSaveShift}
              className="rounded-lg border bg-muted/50 p-4 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="shiftName">Shift Name</Label>
                  <Input
                    id="shiftName"
                    placeholder="e.g. Morning Batch"
                    value={shiftName}
                    onChange={(e) => setShiftName(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="shiftDescription">Description</Label>
                  <Textarea
                    id="shiftDescription"
                    placeholder="Optional notes for this shift"
                    value={shiftDescription}
                    onChange={(e) => setShiftDescription(e.target.value)}
                    className="min-h-9"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="shiftStartTime">Start Time</Label>
                  <Input
                    id="shiftStartTime"
                    type="time"
                    value={shiftStartTime}
                    onChange={(e) => setShiftStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="shiftEndTime">End Time</Label>
                  <Input
                    id="shiftEndTime"
                    type="time"
                    value={shiftEndTime}
                    onChange={(e) => setShiftEndTime(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={shiftSaving}>
                  {shiftSaving
                    ? "Saving..."
                    : editingShift
                      ? "Update"
                      : "Add"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={resetShiftForm}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No shifts configured yet. Create shifts like morning, evening, or
              ladies batch.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {shifts.map((shift) => (
                <div
                  key={shift.id}
                  className={`flex items-center justify-between p-3 ${!shift.isActive ? "opacity-50" : ""}`}
                >
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{shift.name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatShiftWindow(shift.startTime, shift.endTime)}</span>
                      {shift.description && <span>{shift.description}</span>}
                      {!shift.isActive && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleToggleShiftActive(shift)}
                      title={shift.isActive ? "Deactivate" : "Activate"}
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleEditShift(shift)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => handleDeleteShift(shift.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete charge?"
        description="This recurring charge will be permanently removed."
        confirmLabel="Delete"
        onConfirm={handleDeleteChargeConfirmed}
      />
      <ConfirmDialog
        open={shiftConfirmOpen}
        onOpenChange={setShiftConfirmOpen}
        title="Delete shift?"
        description="Members assigned to this shift will become unassigned."
        confirmLabel="Delete"
        onConfirm={handleDeleteShiftConfirmed}
      />
    </div>
  );
}
