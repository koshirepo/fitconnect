/**
 * Documentation: Create or edit one coupon.
 *
 * - A page rather than a dialog: a coupon carries a benefit, five conditions, and four limits, which is more than a modal can hold without becoming a scrolling box inside a scrolling page.
 * - The same component serves both jobs. A `couponId` in the route means edit and seeds the form from the record; without one it is a create.
 * - The form is shaped by the coupon's type — a discount asks for a percentage or an amount, coins asks how many, validity asks for days. Offering all of them at once invites a coupon that is three things at half strength.
 * - Conditions here are convenience, not enforcement. The API re-checks every one of them when a code is applied, because this screen is not what stands between a member and a discount.
 * - Primary exports: CouponFormPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { getTenantDashboardPath } from "@/lib/subdomain";
import {
  useCoupon,
  useCreateCoupon,
  useUpdateCoupon,
} from "@/api/queries/coupons";
import { useBadges } from "@/api/queries/catalog";
import { useSubscriptions } from "@/api/queries/payments";
import { getApiError } from "@/api/client";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { GENDER_OPTIONS } from "@/lib/gender";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, CalendarClock, Coins, Percent } from "lucide-react";
import type { Coupon, CouponPayload, CouponType } from "@/types/api";

const TYPE_META: Record<
  CouponType,
  { label: string; icon: React.ElementType; hint: string }
> = {
  DISCOUNT: {
    label: "Discount",
    icon: Percent,
    hint: "Money off the price, as a percentage or a flat amount.",
  },
  COINS: {
    label: "Coins",
    icon: Coins,
    hint: "Grants coins the member can spend on a later subscription.",
  },
  VALIDITY: {
    label: "Extra days",
    icon: CalendarClock,
    hint: "Adds days on top of the plan's own duration.",
  },
};

type FormState = {
  code: string;
  description: string;
  type: CouponType;
  percentOff: string;
  amountOff: string;
  maxDiscount: string;
  coinsGranted: string;
  bonusDays: string;
  firstTimeOnly: boolean;
  gender: string;
  minAmount: string;
  badgeIds: string[];
  subscriptionIds: string[];
  maxRedemptions: string;
  maxPerMember: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  description: "",
  type: "DISCOUNT",
  percentOff: "",
  amountOff: "",
  maxDiscount: "",
  coinsGranted: "",
  bonusDays: "",
  firstTimeOnly: false,
  gender: "",
  minAmount: "",
  badgeIds: [],
  subscriptionIds: [],
  maxRedemptions: "",
  maxPerMember: "1",
  startsAt: "",
  endsAt: "",
  isActive: true,
};

function toForm(coupon: Coupon): FormState {
  return {
    code: coupon.code,
    description: coupon.description ?? "",
    type: coupon.type,
    percentOff: coupon.percentOff?.toString() ?? "",
    amountOff: coupon.amountOff?.toString() ?? "",
    maxDiscount: coupon.maxDiscount?.toString() ?? "",
    coinsGranted: coupon.coinsGranted?.toString() ?? "",
    bonusDays: coupon.bonusDays?.toString() ?? "",
    firstTimeOnly: coupon.firstTimeOnly,
    gender: coupon.gender ?? "",
    minAmount: coupon.minAmount?.toString() ?? "",
    badgeIds: coupon.badges.map((badge) => badge.id),
    subscriptionIds: coupon.subscriptions.map((plan) => plan.id),
    maxRedemptions: coupon.maxRedemptions?.toString() ?? "",
    maxPerMember: coupon.maxPerMember.toString(),
    startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : "",
    endsAt: coupon.endsAt ? coupon.endsAt.slice(0, 10) : "",
    isActive: coupon.isActive,
  };
}

/** Empty stays empty: a blank limit means "no limit", not zero. */
const num = (value: string) => (value.trim() === "" ? null : Number(value));

function toPayload(form: FormState): CouponPayload {
  return {
    code: form.code.trim().toUpperCase(),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    type: form.type,
    // Only the fields this type uses are sent; the others are cleared so
    // changing type cannot leave the previous type's values behind.
    percentOff: form.type === "DISCOUNT" ? num(form.percentOff) : null,
    amountOff: form.type === "DISCOUNT" ? num(form.amountOff) : null,
    maxDiscount: form.type === "DISCOUNT" ? num(form.maxDiscount) : null,
    coinsGranted: form.type === "COINS" ? num(form.coinsGranted) : null,
    bonusDays: form.type === "VALIDITY" ? num(form.bonusDays) : null,
    firstTimeOnly: form.firstTimeOnly,
    gender: form.gender ? (form.gender as CouponPayload["gender"]) : null,
    minAmount: num(form.minAmount),
    badgeIds: form.badgeIds,
    subscriptionIds: form.subscriptionIds,
    maxRedemptions: num(form.maxRedemptions),
    maxPerMember: Number(form.maxPerMember) || 1,
    startsAt: form.startsAt || null,
    endsAt: form.endsAt || null,
    isActive: form.isActive,
  };
}

export default function CouponFormPage() {
  const { couponId } = useParams<{ couponId?: string }>();
  const navigate = useAppNavigate();
  const toast = useToast();
  const isEdit = Boolean(couponId);

  const couponQuery = useCoupon(couponId);
  const badgesQuery = useBadges();
  const plansQuery = useSubscriptions(true);

  const badges = React.useMemo(() => badgesQuery.data ?? [], [badgesQuery.data]);
  const plans = React.useMemo(() => plansQuery.data ?? [], [plansQuery.data]);

  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [seeded, setSeeded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  // Seed once. Re-seeding on every render of the query would discard whatever
  // the person has typed since it loaded.
  React.useEffect(() => {
    if (!isEdit || seeded || !couponQuery.data?.coupon) return;
    setForm(toForm(couponQuery.data.coupon));
    setSeeded(true);
  }, [isEdit, seeded, couponQuery.data]);

  const redemptions = couponQuery.data?.redemptions ?? [];
  const usedCount = couponQuery.data?.coupon._count.redemptions ?? 0;

  const toggleIn = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const payload = toPayload(form);
      if (isEdit && couponId) {
        await updateCoupon.mutateAsync({ couponId, data: payload });
        toast.success(`${payload.code} updated.`);
      } else {
        await createCoupon.mutateAsync(payload);
        toast.success(`${payload.code} created.`);
      }
      navigate(getTenantDashboardPath("/coupons"));
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && couponQuery.isLoading) return <PageLoader />;

  const TypeIcon = TYPE_META[form.type].icon;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(getTenantDashboardPath("/coupons"))}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Coupons
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? `Edit ${couponQuery.data?.coupon.code ?? "coupon"}` : "New coupon"}
        </h1>
        <p className="text-muted-foreground">
          {isEdit
            ? "Changes apply to future redemptions only — what members already received is unchanged."
            : "Set what it gives, who can use it, and how often."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TypeIcon className="h-5 w-5" />
              What it gives
            </CardTitle>
            <CardDescription>{TYPE_META[form.type].hint}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                  }
                  placeholder="NEWYEAR"
                  required
                  minLength={3}
                  maxLength={32}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, type: (value ?? "DISCOUNT") as CouponType }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_META) as CouponType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_META[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Shown to staff when the code is applied"
                rows={2}
                maxLength={200}
              />
            </div>

            {form.type === "DISCOUNT" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="percentOff">Percent off</Label>
                  <Input
                    id="percentOff"
                    type="number"
                    min={1}
                    max={100}
                    value={form.percentOff}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, percentOff: e.target.value, amountOff: "" }))
                    }
                    placeholder="50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amountOff">or flat ₹</Label>
                  <Input
                    id="amountOff"
                    type="number"
                    min={1}
                    value={form.amountOff}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amountOff: e.target.value, percentOff: "" }))
                    }
                    placeholder="200"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxDiscount">Cap ₹</Label>
                  <Input
                    id="maxDiscount"
                    type="number"
                    min={1}
                    value={form.maxDiscount}
                    onChange={(e) => setForm((f) => ({ ...f, maxDiscount: e.target.value }))}
                    placeholder="No cap"
                  />
                </div>
              </div>
            )}

            {form.type === "COINS" && (
              <div className="space-y-2 sm:max-w-xs">
                <Label htmlFor="coinsGranted">Coins granted</Label>
                <Input
                  id="coinsGranted"
                  type="number"
                  min={1}
                  value={form.coinsGranted}
                  onChange={(e) => setForm((f) => ({ ...f, coinsGranted: e.target.value }))}
                  placeholder="100"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  One coin is worth ₹1 when spent on a later subscription.
                </p>
              </div>
            )}

            {form.type === "VALIDITY" && (
              <div className="space-y-2 sm:max-w-xs">
                <Label htmlFor="bonusDays">Extra days</Label>
                <Input
                  id="bonusDays"
                  type="number"
                  min={1}
                  max={365}
                  value={form.bonusDays}
                  onChange={(e) => setForm((f) => ({ ...f, bonusDays: e.target.value }))}
                  placeholder="7"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Added on top of the plan's own duration.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who can use it</CardTitle>
            <CardDescription>
              Leave everything open to let any member use the code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.firstTimeOnly}
                onChange={(e) => setForm((f) => ({ ...f, firstTimeOnly: e.target.checked }))}
                className="rounded"
              />
              First subscription only
            </label>
            <p className="-mt-2 text-xs text-muted-foreground">
              A member who has never completed a subscription payment. Admission
              charges and abandoned signups do not count against it.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(value) => setForm((f) => ({ ...f, gender: value ?? "" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Anyone</SelectItem>
                    {GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minAmount">Minimum spend ₹</Label>
                <Input
                  id="minAmount"
                  type="number"
                  min={0}
                  value={form.minAmount}
                  onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
                  placeholder="Any"
                />
              </div>
            </div>

            {badges.length > 0 && (
              <div className="space-y-2">
                <Label>Requires a badge</Label>
                <div className="flex flex-wrap gap-2">
                  {badges.map((badge) => (
                    <button
                      key={badge.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, badgeIds: toggleIn(f.badgeIds, badge.id) }))
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        form.badgeIds.includes(badge.id)
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {badge.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  None selected means no badge is required. Selecting several
                  means any one of them will do.
                </p>
              </div>
            )}

            {plans.length > 0 && (
              <div className="space-y-2">
                <Label>Applies to plans</Label>
                <div className="flex flex-wrap gap-2">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          subscriptionIds: toggleIn(f.subscriptionIds, plan.id),
                        }))
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        form.subscriptionIds.includes(plan.id)
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {plan.title}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  None selected means every plan.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Limits</CardTitle>
            <CardDescription>Blank means no limit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxRedemptions">Total uses</Label>
                <Input
                  id="maxRedemptions"
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                  placeholder="Unlimited"
                />
                {isEdit && usedCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Used {usedCount} time{usedCount === 1 ? "" : "s"} so far.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxPerMember">Uses per member</Label>
                <Input
                  id="maxPerMember"
                  type="number"
                  min={1}
                  max={50}
                  value={form.maxPerMember}
                  onChange={(e) => setForm((f) => ({ ...f, maxPerMember: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startsAt">Starts</Label>
                <Input
                  id="startsAt"
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endsAt">Ends</Label>
                <Input
                  id="endsAt"
                  type="date"
                  value={form.endsAt}
                  onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                className="rounded"
              />
              Active — members can use this code
            </label>
          </CardContent>
        </Card>

        {/* Editing a live coupon is easier to judge with its history in view. */}
        {isEdit && redemptions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent redemptions</CardTitle>
              <CardDescription>
                What members already received is frozen and unaffected by edits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {redemptions.slice(0, 10).map((redemption) => (
                  <div
                    key={redemption.id}
                    className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        #{redemption.membership.memberId} {redemption.membership.user.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(redemption.createdAt)}
                        {redemption.reversedAt ? " · reversed" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-muted-foreground">
                      {redemption.discountAmount > 0
                        ? `-${formatCurrency(redemption.discountAmount)}`
                        : redemption.coinsGranted > 0
                          ? `${redemption.coinsGranted} coins`
                          : `${redemption.bonusDays} days`}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(getTenantDashboardPath("/coupons"))}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create coupon"}
          </Button>
        </div>
      </form>
    </div>
  );
}
