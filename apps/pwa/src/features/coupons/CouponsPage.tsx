/**
 * Documentation: Coupon management.
 *
 * - Lists a gym's coupons and creates or edits them. The form is shaped by the coupon's type: a discount asks for a percentage or an amount, a coins coupon asks how many, a validity coupon asks for days. Showing all of them at once invites a coupon that is three things at half strength.
 * - Conditions (first-timer, gender, badge, plan, minimum spend) narrow who may use a code. The API enforces every one of them, so what this screen offers is convenience rather than the guard itself.
 * - A redeemed coupon cannot be deleted — that would take the record of discounts already given with it — so the delete action turns into deactivation once anyone has used it.
 * - Primary exports: CouponsPage.
 */
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { Permission } from "@fitconnect/shared/types/permissions";
import {
  useCouponActivity,
  useCouponAnalytics,
  useCoupons,
  useDeleteCoupon,
  useUpdateCoupon,
} from "@/api/queries/coupons";
import { getApiError } from "@/api/client";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge as UiBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeaderSkeleton, SkeletonRow } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  CalendarClock,
  Coins,
  Percent,
  Plus,
  Power,
  Tag,
  TicketX,
  Trash2,
  Users,
} from "lucide-react";
import type { Coupon, CouponType } from "@/types/api";

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

/** The one line that says what a coupon actually gives. */
function describeBenefit(coupon: Coupon) {
  if (coupon.type === "DISCOUNT") {
    const base =
      coupon.percentOff != null
        ? `${coupon.percentOff}% off`
        : `${formatCurrency(coupon.amountOff ?? 0)} off`;
    return coupon.maxDiscount != null
      ? `${base}, up to ${formatCurrency(coupon.maxDiscount)}`
      : base;
  }
  if (coupon.type === "COINS") return `${coupon.coinsGranted} coins`;
  return `${coupon.bonusDays} extra days`;
}

function describeConditions(coupon: Coupon) {
  const parts: string[] = [];
  if (coupon.firstTimeOnly) parts.push("First subscription only");
  if (coupon.gender) parts.push(`${coupon.gender.toLowerCase()} members`);
  if (coupon.badges.length > 0) {
    parts.push(`badge: ${coupon.badges.map((b) => b.name).join(" or ")}`);
  }
  if (coupon.subscriptions.length > 0) {
    parts.push(`plans: ${coupon.subscriptions.map((p) => p.title).join(", ")}`);
  }
  if (coupon.minAmount != null) parts.push(`min ${formatCurrency(coupon.minAmount)}`);
  return parts;
}

export default function CouponsPage() {
  const navigate = useAppNavigate();
  const { can } = usePermissions();
  const canCreate = can(Permission.COUPONS_CREATE);
  const canUpdate = can(Permission.COUPONS_UPDATE);
  const canDelete = can(Permission.COUPONS_DELETE);
  const toast = useToast();

  const couponsQuery = useCoupons(true);
  // What the codes have actually done. On this page rather than its own,
  // because "which coupons exist" and "which ones work" are the same question
  // asked twice, and answering them on separate screens meant reading a code
  // here and its redemption count somewhere else.
  const analyticsQuery = useCouponAnalytics();
  const activityQuery = useCouponActivity();

  const coupons = React.useMemo(() => couponsQuery.data ?? [], [couponsQuery.data]);


  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const [pendingDelete, setPendingDelete] = React.useState<Coupon | null>(null);

  // A coupon has a benefit, five conditions, and four limits — more than a
  // modal holds without becoming a scrolling box inside a scrolling page.
  const openCreate = () => navigate(getTenantDashboardPath("/coupons/new"));
  const openEdit = (coupon: Coupon) =>
    navigate(getTenantDashboardPath(`/coupons/${coupon.id}/edit`));

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      await updateCoupon.mutateAsync({
        couponId: coupon.id,
        data: { isActive: !coupon.isActive },
      });
      toast.success(coupon.isActive ? `${coupon.code} deactivated.` : `${coupon.code} is live.`);
    } catch (caught) {
      toast.error({ message: "Could not update the coupon.", description: getApiError(caught) });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteCoupon.mutateAsync(pendingDelete.id);
      toast.success(`${pendingDelete.code} deleted.`);
    } catch (caught) {
      toast.error({ message: "Could not delete the coupon.", description: getApiError(caught) });
    } finally {
      setPendingDelete(null);
    }
  };


  if (couponsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg ring-1 ring-foreground/10">
              <SkeletonRow className="p-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coupons</h1>
          <p className="text-muted-foreground">Discounts, coins, and extra days</p>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New coupon</span>
          </Button>
        )}
      </div>

      {analyticsQuery.data && analyticsQuery.data.totals.redemptions > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            icon={Tag}
            label="Redemptions"
            value={analyticsQuery.data.totals.redemptions.toLocaleString("en-IN")}
          />
          <Stat
            icon={Percent}
            label="Discounted"
            value={formatCurrency(analyticsQuery.data.totals.discountAmount)}
          />
          <Stat
            icon={Coins}
            label="Coins granted"
            value={analyticsQuery.data.totals.coinsGranted.toLocaleString("en-IN")}
          />
          <Stat
            icon={CalendarClock}
            label="Days given"
            value={analyticsQuery.data.totals.bonusDays.toLocaleString("en-IN")}
          />
        </div>
      )}

      {/* The most actionable line on the page: a code nobody has used is either
          worth retiring or worth telling members about. */}
      {analyticsQuery.data && analyticsQuery.data.totals.unusedCount > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
            <TicketX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>
              <strong>{analyticsQuery.data.totals.unusedCount}</strong>{" "}
              {analyticsQuery.data.totals.unusedCount === 1 ? "code has" : "codes have"} never
              been used.
            </span>
          </CardContent>
        </Card>
      )}

      {coupons.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No coupons yet"
          description="Create one to offer a discount, grant coins, or extend a membership."
          action={
            canCreate ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New coupon
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon) => {
            const meta = TYPE_META[coupon.type];
            const Icon = meta.icon;
            const conditions = describeConditions(coupon);
            const used = coupon._count.redemptions;

            return (
              <Card key={coupon.id} className={cn(!coupon.isActive && "opacity-60")}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-muted px-2 py-1 font-mono text-sm font-semibold">
                        {coupon.code}
                      </span>
                      <UiBadge variant="secondary" className="gap-1">
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </UiBadge>
                      {!coupon.isActive && <UiBadge variant="destructive">Inactive</UiBadge>}
                    </div>

                    <p className="text-sm font-medium">{describeBenefit(coupon)}</p>
                    {coupon.description && (
                      <p className="text-sm text-muted-foreground">{coupon.description}</p>
                    )}

                    {conditions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {conditions.map((condition) => (
                          <span
                            key={condition}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {condition}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      <Users className="mr-1 inline h-3 w-3" />
                      Used {used}
                      {coupon.maxRedemptions != null ? ` of ${coupon.maxRedemptions}` : ""}
                      {" · "}
                      {coupon.maxPerMember} per member
                      {coupon.endsAt ? ` · ends ${formatDate(coupon.endsAt)}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {canUpdate && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEdit(coupon)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(coupon)}
                          title={coupon.isActive ? "Deactivate" : "Activate"}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {/* Deleting a redeemed coupon would take the record of
                        discounts already given with it. */}
                    {canDelete && used === 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(coupon)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}


      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.code}?`}
        description="This coupon has never been redeemed, so nothing is lost. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />

      {(activityQuery.data?.length ?? 0) > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-semibold">Recent redemptions</p>
            {activityQuery.data!.slice(0, 10).map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium">{row.memberName}</span>
                <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                <span className="text-xs text-muted-foreground">
                  {[
                    row.discountAmount > 0 ? `${formatCurrency(row.discountAmount)} off` : null,
                    row.coinsGranted > 0 ? `${row.coinsGranted} coins` : null,
                    row.bonusDays > 0 ? `${row.bonusDays} days` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** One number from the totals strip. */
function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Tag;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
