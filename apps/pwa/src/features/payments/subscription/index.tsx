import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useTenantSettings } from "@/api/queries/catalog";
import {
  useCreateCheckout,
  useDeleteSubscription,
  useSubscriptions,
  useUpdateSubscription,
  useVerifyCheckout,
} from "@/api/queries/payments";
import { getApiError } from "@/api/client";
import { haptics } from "@/lib/haptics";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Pencil, Plus, Power, Trash2, Package } from "lucide-react";
import type { Subscription } from "@/types/api";

export default function SubscriptionsPage() {
  const navigate = useAppNavigate();
  const { currentMembership, user } = useAuthStore();
  const { can } = usePermissions();
  const isAdmin = can(Permission.SUBSCRIPTIONS_UPDATE);
  const gymName = currentMembership()?.tenantName ?? "the gym";

  const [pageError, setPageError] = React.useState("");

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmMode, setConfirmMode] = React.useState<"delete" | "toggle" | null>(null);
  const [selectedSubscription, setSelectedSubscription] = React.useState<Subscription | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const [payingPlanId, setPayingPlanId] = React.useState<string | null>(null);

  // Admins see inactive plans too, so the flag is part of the cache key.
  const subscriptionsQuery = useSubscriptions(isAdmin);
  // Members cannot read the gateway configuration, so whether online payment is
  // possible arrives as a single boolean on the gym's settings.
  const settingsQuery = useTenantSettings();
  const createCheckout = useCreateCheckout();
  const verifyCheckout = useVerifyCheckout();

  const canPayOnline =
    can(Permission.PAYMENTS_CHECKOUT_SELF) && Boolean(settingsQuery.data?.onlinePaymentsEnabled);

  const subscriptions = React.useMemo<Subscription[]>(
    () => subscriptionsQuery.data ?? [],
    [subscriptionsQuery.data],
  );
  const loading = subscriptionsQuery.isPending;

  const loadError = subscriptionsQuery.isError ? getApiError(subscriptionsQuery.error) : "";

  const updateSubscription = useUpdateSubscription();
  const deleteSubscription = useDeleteSubscription();

  /**
   * Buy a plan: the API opens the order, Razorpay collects the money, and the
   * API verifies the signature before anything is treated as paid. The browser
   * never decides that a payment succeeded.
   */
  const handlePayNow = async (subscription: Subscription) => {
    setPageError("");
    setPayingPlanId(subscription.id);

    try {
      const session = await createCheckout.mutateAsync(subscription.id);

      const result = await openRazorpayCheckout({
        keyId: session.keyId,
        orderId: session.orderId,
        amount: session.amount,
        currency: session.currency,
        name: gymName,
        // The order can cover arrears as well as the plan, and the Razorpay
        // window is where the member sees what they are about to pay for.
        description:
          session.outstandingAmount && session.outstandingAmount > 0
            ? `${session.planTitle} + pending dues`
            : session.planTitle,
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: user?.phone ?? undefined,
        },
      });

      // Closing the window charges nothing and leaves the pending row pending,
      // so there is nothing to undo and nothing worth alarming anyone about.
      if (result.status === "dismissed") return;

      if (result.status === "failed") {
        setPageError(result.message);
        return;
      }

      haptics.payment();
      await verifyCheckout.mutateAsync({
        orderId: result.orderId,
        paymentId: result.paymentId,
        signature: result.signature,
      });

      navigate("/payments");
    } catch (caught) {
      setPageError(getApiError(caught));
    } finally {
      setPayingPlanId(null);
    }
  };

  const openConfirm = (mode: "delete" | "toggle", subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setConfirmMode(mode);
    setPageError("");
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!selectedSubscription || !confirmMode) return;

    const actionKey = `${selectedSubscription.id}:${confirmMode}`;
    setActionLoading(actionKey);
    setPageError("");

    try {
      if (confirmMode === "delete") {
        await deleteSubscription.mutateAsync(selectedSubscription.id);
      } else {
        await updateSubscription.mutateAsync({
          subscriptionId: selectedSubscription.id,
          data: { isActive: !selectedSubscription.isActive },
        });
      }
    } catch (err) {
      setPageError(getApiError(err));
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  const confirmTitle =
    confirmMode === "delete"
      ? `Delete "${selectedSubscription?.title ?? "plan"}"?`
      : `${selectedSubscription?.isActive ? "Inactivate" : "Activate"} "${selectedSubscription?.title ?? "plan"}"?`;
  const confirmDescription =
    confirmMode === "delete"
      ? "This permanently removes the subscription plan if it has no payment history."
      : selectedSubscription?.isActive
        ? "Members will no longer see or use this plan for new payments."
        : "This plan will become available again for new payments.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Manage subscription plans" : "Available plans"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/subscriptions/create")}>
            <Plus className="h-4 w-4" />
            New Plan
          </Button>
        )}
      </div>

      {(pageError || loadError) && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {pageError || loadError}
        </div>
      )}

      {loading ? (
        <ListPageSkeleton search={false} filters={0} />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No subscription plans"
          description={
            isAdmin ? "Create subscription plans for your gym members." : "No plans available yet."
          }
          action={
            isAdmin ? (
              <Button onClick={() => navigate("/subscriptions/create")}>
                <Plus className="h-4 w-4" />
                Create Plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((sub) => {
            const toggleActionKey = `${sub.id}:toggle`;
            const deleteActionKey = `${sub.id}:delete`;

            return (
              <Card key={sub.id} className={!sub.isActive ? "opacity-75" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{sub.title}</CardTitle>
                    <Badge variant={sub.isActive ? "success" : "secondary"}>
                      {sub.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {sub.description && <CardDescription>{sub.description}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{formatCurrency(sub.amount)}</span>
                    <span className="text-muted-foreground">/ {sub.durationDays} days</span>
                  </div>

                  {sub.badges.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {sub.badges.map((badge) => (
                        <Badge key={badge.id} variant="secondary">
                          {badge.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Available to all members</p>
                  )}

                  {/* Members buy the plan; admins manage it. An admin who wants
                      to pay for their own membership does it from the same
                      place any member would. */}
                  {!isAdmin && canPayOnline && sub.isActive && (
                    <Button
                      className="w-full"
                      onClick={() => handlePayNow(sub)}
                      disabled={payingPlanId !== null}
                    >
                      {payingPlanId === sub.id ? (
                        <>
                          <Spinner size="sm" />
                          Opening payment…
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4" />
                          Pay {formatCurrency(sub.amount)}
                        </>
                      )}
                    </Button>
                  )}

                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/subscriptions/${sub.id}/edit`)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openConfirm("toggle", sub)}
                        disabled={actionLoading === toggleActionKey}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {sub.isActive ? "Inactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openConfirm("delete", sub)}
                        disabled={actionLoading === deleteActionKey}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={
          confirmMode === "delete"
            ? "Delete"
            : selectedSubscription?.isActive
              ? "Inactivate"
              : "Activate"
        }
        variant={confirmMode === "delete" ? "destructive" : "default"}
        loading={!!actionLoading}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
