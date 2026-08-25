import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { badgesApi } from "@/api/badges";
import { paymentsApi } from "@/api/payments";
import { settingsApi } from "@/api/settings";
import { tenantsApi } from "@/api/tenants";
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
import { PageLoader } from "@/components/ui/spinner";
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
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt,
    dueDate: member.dueDate ?? null,
    shift: member.shift ?? null,
  };
}

async function loadAllMembers(tenantId: string): Promise<TenantMember[]> {
  const firstPage = await tenantsApi.listMembers(tenantId, 1, 100);
  const firstBatch = firstPage.data.data.members;
  const totalPages = firstPage.data.meta.totalPages;

  if (totalPages <= 1) return firstBatch;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      tenantsApi.listMembers(tenantId, index + 2, 100),
    ),
  );

  return [...firstBatch, ...remainingPages.flatMap((page) => page.data.data.members)];
}

export default function RecordPaymentPage() {
  const { membershipId } = useParams<{ membershipId?: string }>();
  const navigate = useNavigate();
  const { currentTenantId, currentMembership } = useAuthStore();
  const { can } = usePermissions();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [tenantSettings, setTenantSettings] = React.useState<TenantSettings | null>(null);
  const [selectedMember, setSelectedMember] = React.useState<TenantMember | null>(null);
  const [selectedMemberBadges, setSelectedMemberBadges] = React.useState<MemberBadgeSummary[]>([]);
  const [loadingMemberBadges, setLoadingMemberBadges] = React.useState(false);
  const [memberBadgeError, setMemberBadgeError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const memberBadgeCacheRef = React.useRef<Record<string, MemberBadgeSummary[]>>({});

  // Form state
  const [fMembershipId, setFMembershipId] = React.useState(membershipId ?? "");
  const [fSubscriptionId, setFSubscriptionId] = React.useState("");
  const [fAmount, setFAmount] = React.useState("");
  const [fValidUntil, setFValidUntil] = React.useState("");
  const [fNote, setFNote] = React.useState("");
  const [fStatus, setFStatus] = React.useState<"PENDING" | "COMPLETED">("COMPLETED");

  React.useEffect(() => {
    if (!currentTenantId) return;
    let cancelled = false;

    setLoading(true);
    setError("");
    setSelectedMember(null);
    setSelectedMemberBadges([]);
    setLoadingMemberBadges(false);
    setMemberBadgeError("");
    memberBadgeCacheRef.current = {};
    setFMembershipId(membershipId ?? "");

    const settingsRequest = settingsApi
      .getSettings(currentTenantId)
      .then((res) => res.data.data.settings)
      .catch(() => null);

    const selectedMemberRequest = membershipId
      ? tenantsApi
          .getMemberDetail(currentTenantId, membershipId)
          .then((res) => res.data.data.member)
          .catch(() => null)
      : Promise.resolve<MemberDetail | null>(null);

    Promise.all([
      loadAllMembers(currentTenantId),
      paymentsApi.listSubscriptions(currentTenantId),
      selectedMemberRequest,
      settingsRequest,
    ])
      .then(([allMembers, subsRes, routedMemberDetail, settings]) => {
        if (cancelled) return;

        const rosterMembers = allMembers;
        const routedMember = routedMemberDetail ? toTenantMember(routedMemberDetail) : null;
        const membersWithSelected =
          routedMember && !rosterMembers.some((m) => m.id === routedMember.id)
            ? [routedMember, ...rosterMembers]
            : rosterMembers;

        setMembers(membersWithSelected);
        setSubscriptions(subsRes.data.data.subscriptions);
        setTenantSettings(settings);

        const initialMember =
          routedMember ?? membersWithSelected.find((m) => m.id === membershipId) ?? null;

        if (routedMemberDetail) {
          memberBadgeCacheRef.current[routedMemberDetail.id] =
            routedMemberDetail.badges.map(toMemberBadgeSummary);
        }

        setSelectedMember(initialMember);
        setFMembershipId(initialMember?.id ?? membershipId ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTenantId, membershipId]);

  React.useEffect(() => {
    if (!currentTenantId || !selectedMember?.id) {
      setSelectedMemberBadges([]);
      setLoadingMemberBadges(false);
      setMemberBadgeError("");
      return;
    }

    const cachedBadges = memberBadgeCacheRef.current[selectedMember.id];
    if (cachedBadges) {
      setSelectedMemberBadges(cachedBadges);
      setLoadingMemberBadges(false);
      setMemberBadgeError("");
      return;
    }

    let cancelled = false;
    setSelectedMemberBadges([]);
    setLoadingMemberBadges(true);
    setMemberBadgeError("");

    badgesApi
      .memberBadges(currentTenantId, selectedMember.id)
      .then((res) => {
        if (cancelled) return;
        const badges = res.data.data.badges.map(toMemberBadgeSummary);
        memberBadgeCacheRef.current[selectedMember.id] = badges;
        setSelectedMemberBadges(badges);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedMemberBadges([]);
          setMemberBadgeError("Failed to load this member's badges.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMemberBadges(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTenantId, selectedMember?.id]);

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
    setFValidUntil("");
  }, [availableSubscriptions, fSubscriptionId]);

  const handleMemberChange = (memberId: string) => {
    setFMembershipId(memberId);
    setFSubscriptionId("");
    setFAmount("");
    setFValidUntil("");
    const member = members.find((m) => m.id === memberId);
    setSelectedMember(member || null);
  };

  const handleSubChange = (subId: string) => {
    setFSubscriptionId(subId);
    const sub = availableSubscriptions.find((s) => s.id === subId);
    if (sub) {
      setFAmount(String(sub.amount));
      const validUntil = new Date(today);
      validUntil.setDate(validUntil.getDate() + sub.durationDays);
      setFValidUntil(validUntil.toISOString().slice(0, 10));
    }
  };

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
        status: fStatus,
        note: fNote || undefined,
        validUntil: fValidUntil,
        // Display metadata for offline pending list (stripped by Zod on server)
        _memberName: selectedMember?.name,
        _memberAvatarUrl: selectedMember?.avatarUrl,
        _memberMemberId: selectedMember?.memberId,
        _subscriptionTitle: sub?.title,
      };
      const res = await paymentsApi.create(currentTenantId, payload);

      // Skip WhatsApp when the mutation was queued offline
      if (!res.data._offlineQueued && selectedMember?.phone) {
        const msg = renderWhatsAppTemplateBody(paymentReceiptTemplateBody, {
          memberName: selectedMember.name,
          amount: formatCurrency(amount),
          subscriptionTitle: sub?.title ?? "subscription",
          gymName,
          status: fStatus === "COMPLETED" ? "Completed" : "Pending",
          validUntilLine: fValidUntil ? `Valid until: ${fValidUntil}\n` : "",
          noteLine: fNote ? `Note: ${fNote}\n` : "",
        });
        const whatsappUrl = buildWhatsAppUrl(selectedMember.phone, msg);
        if (whatsappUrl) {
          window.open(whatsappUrl, "_blank");
        }
      }

      navigate("/payments");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

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

            {/* Payment Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Payment Status</Label>
              <Select
                value={fStatus}
                onValueChange={(value) => setFStatus((value ?? "") as "PENDING" | "COMPLETED")}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
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
