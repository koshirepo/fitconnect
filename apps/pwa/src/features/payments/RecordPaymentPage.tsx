import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { paymentsApi } from "@/api/payments";
import { useQueryClient } from "@tanstack/react-query";
import { useAllMembers, useMember } from "@/api/queries/members";
import { usePayments, useSubscriptions } from "@/api/queries/payments";
import { useTenantSettings } from "@/api/queries/catalog";
import { useCoinBalance, useCouponQuote } from "@/api/queries/coupons";
import { getApiError } from "@/api/client";
import { formatCurrency } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  getTenantWhatsAppTemplateBody,
  renderWhatsAppTemplateBody,
} from "@/lib/whatsapp-templates";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MemberSelector from "@/components/ui/memberSelector";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus } from "lucide-react";
import type {
  Badge as BadgeModel,
  CreatePaymentPayload,
  CouponQuote,
  MemberDetail,
  TenantMember,
  Subscription,
  TenantSettings,
} from "@/types/api";

type CreatePaymentPayloadWithOfflineMeta = CreatePaymentPayload & {
  _memberName?: string;
  _memberAvatarUrl?: string | null;
  _memberMemberId?: number;
  _subscriptionTitle?: string;
};

type MemberBadgeSummary = Pick<BadgeModel, "id" | "name" | "color" | "icon">;

function toMemberBadgeSummary(badge: MemberBadgeSummary): MemberBadgeSummary {
  return {
    id: badge.id,
    name: badge.name,
    color: badge.color,
    icon: badge.icon,
  };
}

function toTenantMember(member: TenantMember | MemberDetail): TenantMember {
  return {
    id: member.id,
    memberId: member.memberId,
    userId: member.userId,
    name: member.name,
    email: member.email,
    phone: member.phone,
    avatarUrl: member.avatarUrl,
    gender: member.gender ?? null,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
    dueDate: member.dueDate ?? null,
    shift: member.shift ?? null,
  };
}

export default function RecordPaymentPage() {
  const { membershipId } = useParams<{ membershipId?: string }>();
  const navigate = useAppNavigate();
  const { currentTenantId, currentMembership } = useAuthStore();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Form state
  const [fMembershipId, setFMembershipId] = React.useState(membershipId ?? "");
  const [fSubscriptionId, setFSubscriptionId] = React.useState("");
  const [fAmount, setFAmount] = React.useState("");
  const [fValidUntil, setFValidUntil] = React.useState("");
  const [fNote, setFNote] = React.useState("");
  const [fPaidAmount, setFPaidAmount] = React.useState("");
  /** Whether the desk typed its own figure, which the prefill must not overwrite. */
  const paidAmountEdited = React.useRef(false);
  const [fCouponCode, setFCouponCode] = React.useState("");
  const [fCoinsToSpend, setFCoinsToSpend] = React.useState("");
  // A desk entry records money that changed hands, so it is always completed.
  // A short payment is not a pending payment: the service writes the received
  // amount as completed and opens a separate PENDING "Balance —" row for the
  // remainder, which is the only pending row a manual entry can produce.
  const fStatus = "COMPLETED" as const;

  /** The priced result of the code currently applied, from the server. */
  const [quote, setQuote] = React.useState<CouponQuote | null>(null);
  const [couponError, setCouponError] = React.useState("");
  const [applying, setApplying] = React.useState(false);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  /**
   * Everything this page reads comes from the shared query cache, so arriving
   * from a screen that already loaded a member renders immediately and
   * revalidates in the background instead of blocking on a fresh download.
   */
  const selectedMemberQuery = useMember(fMembershipId || undefined);
  // The roster is only needed to pick someone. Routed here from a member,
  // the member is already decided, so the whole list is never fetched.
  const rosterQuery = useAllMembers({ enabled: !membershipId });
  const subscriptionsQuery = useSubscriptions();
  const settingsQuery = useTenantSettings();
  // What this member already owes. Collected with the plan by default, because
  // the desk taking money is the moment those dues are actually settleable.
  const duesQuery = usePayments(
    { page: 1, limit: 20, status: "PENDING", membershipId: fMembershipId || undefined },
    { enabled: Boolean(fMembershipId) },
  );

  const members = React.useMemo(() => rosterQuery.data ?? [], [rosterQuery.data]);
  const subscriptions = React.useMemo<Subscription[]>(
    () => subscriptionsQuery.data ?? [],
    [subscriptionsQuery.data],
  );
  const tenantSettings: TenantSettings | null = settingsQuery.data ?? null;

  /** Unpaid rows for this member, newest last, as the server has them. */
  const outstandingDues = React.useMemo(
    () => (duesQuery.data?.data.payments ?? []).filter((row) => row.status === "PENDING"),
    [duesQuery.data],
  );
  const [settleDueIds, setSettleDueIds] = React.useState<string[]>([]);

  // Every due is ticked when the member changes: the common case is settling
  // everything, and unticking one is a deliberate act.
  React.useEffect(() => {
    setSettleDueIds(outstandingDues.map((row) => row.id));
  }, [outstandingDues]);

  const duesTotal = outstandingDues
    .filter((row) => settleDueIds.includes(row.id))
    .reduce((sum, row) => sum + row.amount, 0);

  const selectedMemberDetail = selectedMemberQuery.data ?? null;
  const selectedMember = React.useMemo<TenantMember | null>(() => {
    if (!fMembershipId) return null;
    // The detail record is the fuller one; the roster row covers the moment
    // between picking someone and their detail arriving.
    if (selectedMemberDetail?.id === fMembershipId) {
      return toTenantMember(selectedMemberDetail);
    }
    return members.find((m) => m.id === fMembershipId) ?? null;
  }, [fMembershipId, members, selectedMemberDetail]);

  const selectedMemberBadges = React.useMemo<MemberBadgeSummary[]>(
    () =>
      selectedMemberDetail?.id === fMembershipId
        ? selectedMemberDetail.badges.map(toMemberBadgeSummary)
        : [],
    [fMembershipId, selectedMemberDetail],
  );
  const loadingMemberBadges = Boolean(fMembershipId) && selectedMemberQuery.isLoading;
  const memberBadgeError = selectedMemberQuery.isError
    ? "Failed to load this member's badges."
    : "";

  // Plans decide what can be recorded, so the page waits for them; the roster
  // and the member resolve on their own.
  const loading =
    subscriptionsQuery.isLoading || (Boolean(membershipId) && selectedMemberQuery.isLoading);

  const selectedMemberBadgeIds = React.useMemo(
    () => new Set(selectedMemberBadges.map((badge) => badge.id)),
    [selectedMemberBadges],
  );

  const availableSubscriptions = React.useMemo(() => {
    if (!selectedMember) return [];

    return subscriptions.filter(
      (subscription) =>
        subscription.badges.length === 0 ||
        subscription.badges.some((badge) => selectedMemberBadgeIds.has(badge.id)),
    );
  }, [subscriptions, selectedMember, selectedMemberBadgeIds]);

  React.useEffect(() => {
    if (!fSubscriptionId) return;
    if (availableSubscriptions.some((subscription) => subscription.id === fSubscriptionId)) return;
    setFSubscriptionId("");
    setFAmount("");
    setFPaidAmount("");
    setFValidUntil("");
  }, [availableSubscriptions, fSubscriptionId]);

  const handleMemberChange = (memberId: string) => {
    setFMembershipId(memberId);
    // A price quoted for one member means nothing for another.
    clearCoupon();
    setFSubscriptionId("");
    setFAmount("");
    setFPaidAmount("");
    setFValidUntil("");
  };

  const handleSubChange = (subId: string) => {
    setFSubscriptionId(subId);
    clearCoupon();
    const sub = availableSubscriptions.find((s) => s.id === subId);
    if (sub) {
      setFAmount(String(sub.amount));
      // Prefilled with the plan's price so the common case — paying in full —
      // needs no typing, and cleared of any earlier edit because that figure
      // belonged to a different plan.
      paidAmountEdited.current = false;
      setFPaidAmount(String(sub.amount));
      const validUntil = new Date(today);
      validUntil.setDate(validUntil.getDate() + sub.durationDays);
      setFValidUntil(validUntil.toISOString().slice(0, 10));
    }
  };

  const coinBalance = useCoinBalance(fMembershipId || undefined);
  const couponQuote = useCouponQuote();
  const availableCoins = coinBalance.data?.balance ?? 0;

  /**
   * Ask the server what this costs. Never computed here: the same call the
   * save makes, so the preview and the saved payment cannot disagree.
   */
  const applyCoupon = async () => {
    setCouponError("");
    if (!fMembershipId) {
      setCouponError("Choose a member first.");
      return;
    }

    setApplying(true);
    try {
      const priced = await couponQuote.mutateAsync({
        membershipId: fMembershipId,
        subscriptionId: fSubscriptionId || null,
        amount: Number(fAmount) || undefined,
        code: fCouponCode.trim() || null,
        coinsToSpend: Number(fCoinsToSpend) || 0,
      });
      setQuote(priced);
    } catch (caught) {
      setQuote(null);
      setCouponError(getApiError(caught));
    } finally {
      setApplying(false);
    }
  };

  const clearCoupon = () => {
    setFCouponCode("");
    setFCoinsToSpend("");
    setQuote(null);
    setCouponError("");
  };

  // A part payment: blank means the member is paying the whole amount.
  const listAmount = Number(fAmount) || 0;
  // What the member owes after a coupon and coins, which is what a part
  // payment splits and what the receipt should name.
  const totalAmount = quote ? quote.netAmount : listAmount;
  const receivedAmount = fPaidAmount === "" ? totalAmount : Number(fPaidAmount) || 0;

  // A coupon or spent coins move the total after the plan was picked, so the
  // prefilled figure follows it. An edited field is left alone — that number is
  // what the member actually handed over.
  React.useEffect(() => {
    if (paidAmountEdited.current) return;
    setFPaidAmount(totalAmount > 0 ? String(totalAmount) : "");
  }, [totalAmount]);
  const balanceAmount =
    fStatus === "COMPLETED" ? Math.max(totalAmount - receivedAmount, 0) : 0;

  const paymentReceiptTemplateBody = React.useMemo(
    () => getTenantWhatsAppTemplateBody(tenantSettings, "payment_receipt"),
    [tenantSettings],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!fMembershipId) {
      setError("Please select a member");
      return;
    }

    if (!fSubscriptionId) {
      setError("Please select a subscription plan");
      return;
    }

    if (!fAmount) {
      setError("Please enter an amount");
      return;
    }

    if (!fValidUntil) {
      setError("Please select a valid until date");
      return;
    }

    const amount = Number(fAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Amount must be a positive whole number");
      return;
    }

    if (fStatus === "COMPLETED" && fPaidAmount !== "") {
      if (!Number.isInteger(receivedAmount) || receivedAmount <= 0) {
        setError("Amount received must be a positive whole number");
        return;
      }
      if (receivedAmount > amount) {
        setError("Amount received cannot be more than the total");
        return;
      }
    }

    if (!currentTenantId) {
      setError("No tenant selected");
      return;
    }

    setSubmitting(true);
    try {
      const sub = availableSubscriptions.find((s) => s.id === fSubscriptionId);
      const payload: CreatePaymentPayloadWithOfflineMeta = {
        membershipId: fMembershipId,
        subscriptionId: fSubscriptionId,
        amount,
        // Sent only when it is actually a part payment, so an ordinary
        // payment in full keeps the simpler payload it always had.
        ...(balanceAmount > 0 ? { paidAmount: receivedAmount } : {}),
        // The code, never the discounted figure — the server prices it.
        ...(quote?.coupon ? { couponCode: quote.coupon.code } : {}),
        ...(quote && quote.coinsRedeemed > 0
          ? { coinsToSpend: quote.coinsRedeemed }
          : {}),
        status: fStatus,
        // The dues this collection also closes. The server re-reads each one,
        // so a row paid elsewhere since the form loaded is simply skipped.
        ...(settleDueIds.length > 0 ? { settlePendingIds: settleDueIds } : {}),
        note: fNote || undefined,
        validUntil: fValidUntil,
        // Display metadata for offline pending list (stripped by Zod on server)
        _memberName: selectedMember?.name,
        _memberAvatarUrl: selectedMember?.avatarUrl,
        _memberMemberId: selectedMember?.memberId,
        _subscriptionTitle: sub?.title,
      };
      // The raw envelope is needed to tell a real save from an offline queue,
      // but the invalidation below still keeps payments and members in step.
      const res = await paymentsApi.create(currentTenantId, payload);
      await queryClient.invalidateQueries({ queryKey: ["payments", currentTenantId] });
      await queryClient.invalidateQueries({ queryKey: ["members", currentTenantId] });

      // Skip WhatsApp when the mutation was queued offline
      if (!res.data._offlineQueued && selectedMember?.phone) {
        const msg = renderWhatsAppTemplateBody(paymentReceiptTemplateBody, {
          memberName: selectedMember.name,
          amount: formatCurrency(balanceAmount > 0 ? receivedAmount : amount),
          subscriptionTitle: sub?.title ?? "subscription",
          gymName,
          status: fStatus === "COMPLETED" ? "Completed" : "Pending",
          validUntilLine: fValidUntil ? `Valid until: ${fValidUntil}\n` : "",
          noteLine: fNote ? `Note: ${fNote}\n` : "",
        });
        const whatsappUrl = buildWhatsAppUrl(selectedMember.phone, msg);
        if (whatsappUrl) {
          window.location.assign(whatsappUrl);
        }
      }

      navigate("/payments");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormPageSkeleton fields={6} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Record Payment</h1>
        <p className="text-muted-foreground">Add a new payment record</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
          <CardDescription>Enter the payment information below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Member Selection */}
            <div className="space-y-2">
              <Label htmlFor="member">Select Member *</Label>
              <MemberSelector
                members={members}
                selectedMember={selectedMember}
                onSelect={(member) => handleMemberChange(member.id)}
                placeholder="Choose a member..."
              />
              {selectedMember && (
                <div className="space-y-2">
                  {loadingMemberBadges ? (
                    <p className="text-xs text-muted-foreground">Loading member badges...</p>
                  ) : memberBadgeError ? (
                    <p className="text-xs text-destructive">{memberBadgeError}</p>
                  ) : selectedMemberBadges.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedMemberBadges.map((badge) => (
                        <UiBadge key={badge.id} variant="secondary">
                          {badge.name}
                        </UiBadge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This member has no badges. Only open plans will be shown.
                    </p>
                  )}
                </div>
              )}
              {!selectedMember && error.includes("member") && (
                <p className="text-sm text-destructive-foreground">{error}</p>
              )}
            </div>

            {/* Subscription Selection */}
            <div className="space-y-2">
              <Label htmlFor="subscription">Subscription Plan *</Label>
              <p className="text-xs text-muted-foreground">
                {!selectedMember
                  ? "Select a member first to load eligible plans."
                  : loadingMemberBadges
                    ? "Loading badge-based plan access..."
                    : "Plans are filtered by this member's badges."}
              </p>
              <Select
                value={fSubscriptionId}
                onValueChange={(value) => handleSubChange(value ?? "")}
                disabled={!selectedMember || loadingMemberBadges}
              >
                <SelectTrigger id="subscription" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    {!selectedMember
                      ? "Select a member first..."
                      : loadingMemberBadges
                        ? "Loading plans..."
                        : availableSubscriptions.length === 0
                          ? "No plans available for this member"
                          : "Choose a plan..."}
                  </SelectItem>
                  {availableSubscriptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title} - {formatCurrency(s.amount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMember && !loadingMemberBadges && availableSubscriptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No subscription plans match this member&apos;s badges yet.
                </p>
              )}
              {!fSubscriptionId && error.includes("subscription") && (
                <p className="text-sm text-destructive-foreground">{error}</p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (in rupees) *</Label>
              <Input
                id="amount"
                type="number"
                value={fAmount}
                onChange={(e) => setFAmount(e.target.value)}
                min={1}
                step={1}
                placeholder="Enter amount in rupees"
                disabled={!can(Permission.PAYMENTS_UPDATE)}
              />

              {!fAmount && error.includes("amount") && (
                <p className="text-sm text-destructive-foreground">{error}</p>
              )}
            </div>

            {/* Coupon & coins. The server prices both; this only collects
                the code and shows what came back. */}
            <div className="space-y-2 rounded-lg border p-3">
              <Label htmlFor="couponCode">Coupon or coins</Label>

              <div className="flex gap-2">
                <Input
                  id="couponCode"
                  value={fCouponCode}
                  onChange={(e) => setFCouponCode(e.target.value.toUpperCase())}
                  placeholder="Code"
                  className="font-mono uppercase"
                  maxLength={32}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={applyCoupon}
                  disabled={applying || !fMembershipId}
                >
                  {applying ? "Checking…" : "Apply"}
                </Button>
              </div>

              {availableCoins > 0 && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={availableCoins}
                    value={fCoinsToSpend}
                    onChange={(e) => setFCoinsToSpend(e.target.value)}
                    placeholder={`Spend coins (${availableCoins} available)`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFCoinsToSpend(String(availableCoins))}
                  >
                    All
                  </Button>
                </div>
              )}

              {couponError && (
                <p className="text-sm text-destructive">{couponError}</p>
              )}

              {quote && (quote.coupon || quote.coinsRedeemed > 0) && (
                <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span>{formatCurrency(quote.listAmount)}</span>
                  </div>
                  {quote.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount ({quote.coupon?.code})</span>
                      <span>-{formatCurrency(quote.discountAmount)}</span>
                    </div>
                  )}
                  {quote.coinsRedeemed > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Coins</span>
                      <span>-{formatCurrency(quote.coinsRedeemed)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>To collect</span>
                    <span>{formatCurrency(quote.netAmount)}</span>
                  </div>
                  {quote.bonusDays > 0 && (
                    <p className="text-xs text-emerald-600">
                      +{quote.bonusDays} extra days of validity
                    </p>
                  )}
                  {quote.coinsGranted > 0 && (
                    <p className="text-xs text-emerald-600">
                      Earns {quote.coinsGranted} coins
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={clearCoupon}
                    className="text-xs text-muted-foreground underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Dues already on the account, collected with this payment. */}
            {outstandingDues.length > 0 && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-sm font-medium">Pending dues on this account</p>
                {outstandingDues.map((due) => (
                  <label key={due.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={settleDueIds.includes(due.id)}
                      onChange={(e) =>
                        setSettleDueIds((prev) =>
                          e.target.checked
                            ? [...prev, due.id]
                            : prev.filter((id) => id !== due.id),
                        )
                      }
                    />
                    <span className="flex-1 truncate">{due.description ?? "Pending payment"}</span>
                    <span className="font-medium">{formatCurrency(due.amount)}</span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">
                  Ticked dues are settled along with this payment. Untick one to leave it
                  outstanding.
                </p>
              </div>
            )}

            {/* What the member actually hands over. */}
            {duesTotal > 0 && (
              <div className="space-y-1 rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending dues</span>
                  <span>{formatCurrency(duesTotal)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-semibold">
                  <span>Total to collect</span>
                  <span>{formatCurrency(totalAmount + duesTotal)}</span>
                </div>
              </div>
            )}
            {/* Part payment — blank means paid in full. */}
            {fStatus === "COMPLETED" && (
              <div className="space-y-2">
                <Label htmlFor="paidAmount">Amount Received Now</Label>
                <Input
                  id="paidAmount"
                  type="number"
                  value={fPaidAmount}
                  onChange={(e) => {
                    paidAmountEdited.current = true;
                    setFPaidAmount(e.target.value);
                  }}
                  min={1}
                  max={totalAmount || undefined}
                  step={1}
                  placeholder={
                    totalAmount > 0
                      ? `Full amount (${formatCurrency(totalAmount)})`
                      : "Full amount"
                  }
                />
                {balanceAmount > 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {formatCurrency(balanceAmount)} will be logged as a pending balance for this member.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Prefilled with the full amount. Enter less to take a part payment — the
                    rest is logged as a pending balance.
                  </p>
                )}
              </div>
            )}

            {/* Valid Until */}
            <div className="space-y-2">
              <Label htmlFor="validUntil">Valid Until *</Label>
              <Input
                id="validUntil"
                type="date"
                value={fValidUntil}
                onChange={(e) => setFValidUntil(e.target.value)}
                min={today}
                required
              />
              {!fValidUntil && error.includes("valid until") && (
                <p className="text-sm text-destructive-foreground">{error}</p>
              )}
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Textarea
                id="note"
                value={fNote}
                onChange={(e) => setFNote(e.target.value)}
                placeholder="Optional note for this payment..."
                rows={3}
                maxLength={500}
              />
            </div>

            {/* General Error */}
            {error && !error.includes("filled") && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/payments")}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !selectedMember}>
                {submitting ? (
                  "Recording..."
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Record Payment
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
