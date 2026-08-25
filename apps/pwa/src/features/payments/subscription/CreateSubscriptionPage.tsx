import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useBadges } from "@/api/queries/catalog";
import { useCreateSubscription } from "@/api/queries/payments";
import { getApiError } from "@/api/client";
import { formatCurrency } from "@/lib/utils";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Package, AlertCircle, CheckCircle2 } from "lucide-react";
import type { Badge as BadgeModel } from "@/types/api";

// ─── Preset duration options ──────────────────────────────────────────────────
const DURATION_PRESETS = [
  { value: 7, label: "1 Week" },
  { value: 30, label: "1 Month" },
  { value: 90, label: "3 Months" },
  { value: 180, label: "6 Months" },
  { value: 365, label: "1 Year" },
];

export default function CreateSubscriptionPage() {
  const navigate = useAppNavigate();
  const { currentTenantId } = useAuthStore();
  const { can } = usePermissions();
  const createSubscription = useCreateSubscription();
  const canManagePlans = can(Permission.SUBSCRIPTIONS_CREATE);

  // ─── Form state ─────────────────────────────────────────────────────────────
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [durationDays, setDurationDays] = React.useState("30");
  const [customDuration, setCustomDuration] = React.useState(false);
  const [selectedBadgeIds, setSelectedBadgeIds] = React.useState<string[]>([]);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  // Badges gate plan eligibility; a failure here must not block plan creation.
  const badgesQuery = useBadges({ includeInactive: true, enabled: canManagePlans });
  const availableBadges = React.useMemo<BadgeModel[]>(
    () => badgesQuery.data ?? [],
    [badgesQuery.data],
  );
  const loadingBadges = badgesQuery.isLoading;
  const badgeLoadError = badgesQuery.isError
    ? "Failed to load badges. You can still create a plan for all members."
    : "";

  // Only admins can create subscriptions
  if (!canManagePlans) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only administrators can create subscription plans.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/subscriptions")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Subscriptions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;

    const parsedAmount = Number(amount);
    const parsedDuration = parseInt(durationDays, 10);

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid amount in whole rupees.");
      return;
    }
    if (isNaN(parsedDuration) || parsedDuration <= 0) {
      setError("Please enter a valid duration greater than 0.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      await createSubscription.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        amount: parsedAmount,
        durationDays: parsedDuration,
        badgeIds: selectedBadgeIds,
      });
      setSuccess(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success state ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
            <CardTitle>Subscription Plan Created!</CardTitle>
            <CardDescription>
              The plan &quot;{title}&quot; has been created successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button onClick={() => navigate("/subscriptions")} className="w-full max-w-xs">
              View All Plans
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccess(false);
                setTitle("");
                setDescription("");
                setAmount("");
                setDurationDays("30");
                setCustomDuration(false);
                setSelectedBadgeIds([]);
              }}
              className="w-full max-w-xs"
            >
              <Package className="h-4 w-4" />
              Create Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Form ───────────────────────────────────────────────────────────────────
  const selectedPreset = DURATION_PRESETS.find((p) => p.value === parseInt(durationDays, 10));
  const toggleBadgeId = (badgeId: string) => {
    setSelectedBadgeIds((prev) =>
      prev.includes(badgeId) ? prev.filter((id) => id !== badgeId) : [...prev, badgeId],
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/subscriptions")}
          aria-label="Back to subscriptions"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Subscription Plan</h1>
          <p className="text-muted-foreground">
            Set up a new subscription plan for your gym members.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Plan Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Plan Details</CardTitle>
            <CardDescription>
              Give your plan a descriptive name and optional details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sub-title">
                Plan Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sub-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Monthly Basic, Premium Quarterly"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sub-desc">Description</Label>
              <Textarea
                id="sub-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this plan includes — equipment access, classes, trainer sessions, etc."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Badge Access</CardTitle>
            <CardDescription>
              Limit this plan to specific badges, or leave it open for all members.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedBadgeIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">Visible to all members.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableBadges
                  .filter((badge) => selectedBadgeIds.includes(badge.id))
                  .map((badge) => (
                    <UiBadge key={badge.id} variant="secondary">
                      {badge.name}
                    </UiBadge>
                  ))}
              </div>
            )}

            {loadingBadges ? (
              <p className="text-sm text-muted-foreground">Loading badges...</p>
            ) : availableBadges.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No badges available yet. Create badges first if you want member-specific plans.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {availableBadges.map((badge) => {
                  const checked = selectedBadgeIds.includes(badge.id);
                  return (
                    <label
                      key={badge.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        checked ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleBadgeId(badge.id)} />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{badge.name}</span>
                          {!badge.isActive && (
                            <UiBadge variant="outline" className="text-[10px]">
                              Inactive
                            </UiBadge>
                          )}
                        </div>
                        {badge.description && (
                          <p className="text-xs text-muted-foreground">{badge.description}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {badgeLoadError && <p className="text-sm text-destructive">{badgeLoadError}</p>}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pricing</CardTitle>
            <CardDescription>Set the price for this subscription plan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sub-amount">
                Amount (in rupees) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sub-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1000"
                min={1}
                step={1}
                required
              />
              {amount && Number.isInteger(Number(amount)) && Number(amount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Preview: {formatCurrency(Number(amount))}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Duration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Duration</CardTitle>
            <CardDescription>Choose how long this subscription lasts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    setDurationDays(String(preset.value));
                    setCustomDuration(false);
                  }}
                  className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                    !customDuration && selectedPreset?.value === preset.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {preset.label}
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {preset.value} days
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setCustomDuration(true);
                  setDurationDays("");
                }}
                className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                  customDuration
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                Custom
                <span className="block text-xs text-muted-foreground mt-0.5">Set days</span>
              </button>
            </div>

            {customDuration && (
              <div className="space-y-2">
                <Label htmlFor="sub-custom-days">
                  Custom Duration (days) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sub-custom-days"
                  type="number"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder="e.g. 45"
                  min={1}
                  required
                  autoFocus
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/subscriptions")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !title.trim() || !amount}>
            {submitting ? "Creating..." : "Create Plan"}
          </Button>
        </div>
      </form>
    </div>
  );
}
