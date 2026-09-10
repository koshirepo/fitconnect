/**
 * Documentation: Gym-level settings.
 *
 * - Everything a gym owner configures about their own gym, in one place: how long a lapsed member stays active, what a referral pays, the charges added at signup, the batches members are put in, the brand colour, and the three things that live on their own pages.
 * - Grouped into sections behind a pill strip rather than stacked as eight equal cards. The stack gave a one-sentence link-out the same weight as a form with three secrets in it, and put the WhatsApp templates between the referral coins and the admission fee.
 * - The section is held in the URL, so a refresh, a back button, or a link to somebody lands where it did.
 * - Presentation only. Every read, write and invalidation is unchanged from the stacked version.
 * - Primary exports: GymSettingsPage.
 */
import { formatCurrency } from "@fitconnect/shared/utils";
import { PageHeader } from "@/components/ui/page-header";
import * as React from "react";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { tenantsApi } from "@/api/tenants";
import { BrandColorCard } from "@/components/tenants/BrandColorCard";
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
import type { TenantCharge, Shift, Tenant } from "@/types/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Radio,
  Power,
  ChevronRight,
  Palette,
  CalendarClock,
  Plug,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import PaymentGatewayCard from "./PaymentGatewayCard";

/** The sections, in the order somebody is likely to want them. */
const TABS = [
  { value: "general", label: "General", icon: Settings },
  { value: "branding", label: "Branding", icon: Palette },
  { value: "billing", label: "Charges & payments", icon: IndianRupee },
  { value: "shifts", label: "Shifts", icon: CalendarClock },
  { value: "connected", label: "Machines & messages", icon: Plug },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const DEFAULT_TAB: TabValue = "general";

function isTab(value: string | null): value is TabValue {
  return TABS.some((entry) => entry.value === value);
}

export default function GymSettingsPage() {
  const { currentTenantId } = useAuthStore();
  const navigate = useAppNavigate();

  // In the URL rather than component state: a refresh, the back button, and a
  // link someone was sent all land on the section they were looking at.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("section");
  const tab: TabValue = isTab(tabParam) ? tabParam : DEFAULT_TAB;
  const setTab = (value: TabValue) => setSearchParams({ section: value }, { replace: true });

  // Keep the selected pill in view. The strip scrolls sideways on a phone, so
  // arriving on a deep link to a later section would otherwise show a row of
  // pills with none of them highlighted, the active one being off to the right.
  const activePillRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    activePillRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  // Three parallel reads; each write below invalidates the settings or shifts
  // key, so the lists refresh themselves rather than being patched in place.
  const settingsQuery = useTenantSettings();
  // The tenant record itself, for the brand colour below. Its own state rather
  // than a shared query because this page is the only reader.
  const [tenant, setTenant] = React.useState<Tenant | null>(null);

  React.useEffect(() => {
    if (!currentTenantId) return;
    let active = true;
    tenantsApi
      .get(currentTenantId)
      .then((res) => {
        if (active) setTenant(res.data.data.tenant);
      })
      .catch(() => {
        // The colour card simply does not render; the rest of settings works.
      });
    return () => {
      active = false;
    };
  }, [currentTenantId]);
  const chargesQuery = useCharges();
  const shiftsQuery = useShifts(true);

  const charges = React.useMemo<TenantCharge[]>(() => chargesQuery.data ?? [], [chargesQuery.data]);
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
  const [pendingChargeId, setPendingChargeId] = React.useState<string | null>(null);
  const [shiftConfirmOpen, setShiftConfirmOpen] = React.useState(false);
  const [pendingShiftId, setPendingShiftId] = React.useState<string | null>(null);

  // Settings form
  const [overdueDays, setOverdueDays] = React.useState(30);
  // Zero means referral rewards are off, which is the default for a gym
  // that has never set them.
  const [referralRewardCoins, setReferralRewardCoins] = React.useState(0);
  const [referralRefereeCoins, setReferralRefereeCoins] = React.useState(0);

  // Charge form
  const [showChargeForm, setShowChargeForm] = React.useState(false);
  const [editingCharge, setEditingCharge] = React.useState<TenantCharge | null>(null);
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
    if (settingsQuery.data) {
      setOverdueDays(settingsQuery.data.overdueDays);
      setReferralRewardCoins(settingsQuery.data.referralRewardCoins ?? 0);
      setReferralRefereeCoins(settingsQuery.data.referralRefereeCoins ?? 0);
    }
  }, [settingsQuery.data]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const settings = await updateSettings.mutateAsync({
        overdueDays,
        referralRewardCoins,
        referralRefereeCoins,
      });
      setOverdueDays(settings.overdueDays);
      setReferralRewardCoins(settings.referralRewardCoins ?? 0);
      setReferralRefereeCoins(settings.referralRefereeCoins ?? 0);
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
    return <FormPageSkeleton fields={6} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-6">
      <PageHeader
        title="Gym Settings"
        description="Everything that changes how this gym runs, grouped by what it affects."
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          {successMsg}
        </div>
      )}

      {/* Same pill strip the store's order tabs use, so a section here reads
          like a filter there rather than a new control to learn. */}
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Settings sections">
        {TABS.map((entry) => {
          const active = tab === entry.value;
          return (
            <button
              key={entry.value}
              ref={active ? activePillRef : undefined}
              type="button"
              onClick={() => setTab(entry.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              <entry.icon className="h-4 w-4" />
              {entry.label}
            </button>
          );
        })}
      </nav>

      {tab === "general" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              General
            </CardTitle>
            <CardDescription>
              When a lapsed member is deactivated, and what a referral is worth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="overdueDays">Overdue days</Label>
                  <Input
                    id="overdueDays"
                    type="number"
                    min={1}
                    max={365}
                    value={overdueDays}
                    onChange={(e) => setOverdueDays(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Days after a subscription expires before the member is made inactive.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referralRewardCoins">Referral reward (coins)</Label>
                  <Input
                    id="referralRewardCoins"
                    type="number"
                    min={0}
                    value={referralRewardCoins}
                    onChange={(e) => setReferralRewardCoins(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Coins the referrer earns when the member they brought in pays for their first
                    subscription. 0 turns referral rewards off.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referralRefereeCoins">Joining bonus (coins)</Label>
                  <Input
                    id="referralRefereeCoins"
                    type="number"
                    min={0}
                    value={referralRefereeCoins}
                    onChange={(e) => setReferralRefereeCoins(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Coins the referred member earns at the same moment. 0 for none.
                  </p>
                </div>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save settings"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {tab === "branding" && (
        <div className="space-y-6">
          {tenant && <BrandColorCard tenant={tenant} onSaved={setTenant} />}

          <LinkCard
            icon={Globe}
            title="Public page"
            description="Your gym name, logo, phone, address, short description, and about content, on the page members and visitors see."
            action="Edit public page"
            onClick={() => navigate("/settings/public-page")}
          />
        </div>
      )}

      {tab === "billing" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <IndianRupee className="h-5 w-5" />
                    Fixed charges
                  </CardTitle>
                  <CardDescription>
                    One-off amounts added when somebody joins — admission, a deposit, a kit.
                  </CardDescription>
                </div>
                {!showChargeForm && (
                  <Button size="sm" className="shrink-0" onClick={() => setShowChargeForm(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add charge
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showChargeForm && (
                <form
                  onSubmit={handleSaveCharge}
                  className="space-y-3 rounded-lg border bg-muted/50 p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="chargeName">Charge name</Label>
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
                      {chargeSaving ? "Saving..." : editingCharge ? "Update" : "Add"}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={resetChargeForm}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {charges.length === 0 ? (
                <EmptyState
                  icon={IndianRupee}
                  title="No charges yet"
                  description="Add an admission fee, a security deposit, or anything else charged once at signup."
                />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {charges.map((charge) => (
                    <li
                      key={charge.id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3",
                        !charge.isActive && "opacity-60",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{charge.name}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatCurrency(charge.amount)}</span>
                          {charge.isMandatory && (
                            <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                              <Shield className="h-3 w-3" />
                              Mandatory
                            </span>
                          )}
                          {!charge.isActive && (
                            <span className="rounded bg-muted px-1.5 py-0.5">Inactive</span>
                          )}
                        </div>
                      </div>
                      <RowActions
                        isActive={charge.isActive}
                        label={charge.name}
                        onToggle={() => handleToggleActive(charge)}
                        onEdit={() => handleEditCharge(charge)}
                        onDelete={() => handleDeleteCharge(charge.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <PaymentGatewayCard />
        </div>
      )}

      {tab === "shifts" && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Shifts
                </CardTitle>
                <CardDescription>
                  The batches a member can be put in when they join.
                </CardDescription>
              </div>
              {!showShiftForm && (
                <Button size="sm" className="shrink-0" onClick={() => setShowShiftForm(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add shift
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showShiftForm && (
              <form
                onSubmit={handleSaveShift}
                className="space-y-3 rounded-lg border bg-muted/50 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="shiftName">Shift name</Label>
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
                    <Label htmlFor="shiftStartTime">Start time</Label>
                    <Input
                      id="shiftStartTime"
                      type="time"
                      value={shiftStartTime}
                      onChange={(e) => setShiftStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="shiftEndTime">End time</Label>
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
                    {shiftSaving ? "Saving..." : editingShift ? "Update" : "Add"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={resetShiftForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {shifts.length === 0 ? (
              <EmptyState
                icon={Clock}
                title="No shifts yet"
                description="Create the batches this gym runs — morning, evening, or a ladies-only slot."
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {shifts.map((shift) => (
                  <li
                    key={shift.id}
                    className={cn(
                      "flex items-center justify-between gap-3 p-3",
                      !shift.isActive && "opacity-60",
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">{shift.name}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatShiftWindow(shift.startTime, shift.endTime)}</span>
                        {shift.description && <span>{shift.description}</span>}
                        {!shift.isActive && (
                          <span className="rounded bg-muted px-1.5 py-0.5">Inactive</span>
                        )}
                      </div>
                    </div>
                    <RowActions
                      isActive={shift.isActive}
                      label={shift.name}
                      onToggle={() => handleToggleShiftActive(shift)}
                      onEdit={() => handleEditShift(shift)}
                      onDelete={() => handleDeleteShift(shift.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "connected" && (
        <div className="space-y-6">
          <LinkCard
            icon={Radio}
            title="Attendance machines"
            description="The RFID readers on the door. Add or edit a machine, check when each was last seen, and re-sync member cards to every device."
            action="Manage machines"
            onClick={() => navigate("/attendance/devices")}
          />

          <LinkCard
            icon={MessageSquare}
            title="Messages"
            description="WhatsApp templates for welcome messages, reminders and receipts, with the placeholders each one fills in."
            action="Manage messages"
            onClick={() => navigate("/settings/messages")}
          />
        </div>
      )}

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

/**
 * A section that lives on its own page.
 *
 * Three of these used to be full cards in the main scroll, each the same height
 * as a form you can actually fill in, for one sentence and a button. Kept as a
 * quieter row so the page's weight matches what is on it.
 */
function LinkCard({
  icon: Icon,
  title,
  description,
  action,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button type="button" variant="outline" className="shrink-0" onClick={onClick}>
          {action}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Activate, edit, delete — the same three controls on a charge and on a shift.
 *
 * The toggle used to be a clock, on both lists, while a clock was also the icon
 * for the shifts section itself. One glyph meaning "this is a shift" and "turn
 * this off" on the same screen is a coin toss; `Power` says which it is.
 */
function RowActions({
  isActive,
  label,
  onToggle,
  onEdit,
  onDelete,
}: {
  isActive: boolean;
  label: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={onToggle}
        aria-label={`${isActive ? "Deactivate" : "Activate"} ${label}`}
        title={isActive ? "Deactivate" : "Activate"}
      >
        <Power className={cn("h-4 w-4", isActive && "text-emerald-600 dark:text-emerald-400")} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={onEdit}
        aria-label={`Edit ${label}`}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive"
        onClick={onDelete}
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
