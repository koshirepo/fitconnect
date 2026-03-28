import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { paymentsApi } from "@/api/payments";
import { tenantsApi } from "@/api/tenants";
import { getApiError } from "@/api/client";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import MemberSelector from "@/components/ui/memberSelector";
import { PageLoader } from "@/components/ui/spinner";
import { Select } from "@/components/ui/select";
import { AlertCircle, Plus } from "lucide-react";
import type { TenantMember, Subscription } from "@/types/api";

export default function RecordPaymentPage() {
  const { membershipId } = useParams<{ membershipId?: string }>();
  const navigate = useNavigate();
  const { currentTenantId, tenantRole, currentMembership } = useAuthStore();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [selectedMember, setSelectedMember] = React.useState<TenantMember | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  // Form state
  const [fMembershipId, setFMembershipId] = React.useState(membershipId ?? "");
  const [fSubscriptionId, setFSubscriptionId] = React.useState("");
  const [fAmount, setFAmount] = React.useState("");
  const [fValidUntil, setFValidUntil] = React.useState("");
  const [fNote, setFNote] = React.useState("");
  const [fStatus, setFStatus] = React.useState<"PENDING" | "COMPLETED">("COMPLETED");

  React.useEffect(() => {
    if (!currentTenantId) return;
    setLoading(true);

    Promise.all([
      tenantsApi.listMembers(currentTenantId, 1, 100),
      paymentsApi.listSubscriptions(currentTenantId),
    ])
      .then(([membersRes, subsRes]) => {
        setMembers(membersRes.data.data.members);
        setSubscriptions(subsRes.data.data.subscriptions);

        // If membershipId is provided, select that member
        if (membershipId) {
          const member = membersRes.data.data.members.find((m) => m.id === membershipId);
          if (member) {
            setSelectedMember(member);
            setFMembershipId(member.id);
          }
        }
      })
      .catch(() => setError("Failed to load data"))
      .finally(() => setLoading(false));
  }, [currentTenantId, membershipId]);

  const handleMemberChange = (memberId: string) => {
    setFMembershipId(memberId);
    const member = members.find((m) => m.id === memberId);
    setSelectedMember(member || null);
  };

  const handleSubChange = (subId: string) => {
    setFSubscriptionId(subId);
    const sub = subscriptions.find((s) => s.id === subId);
    if (sub) {
      setFAmount(String(sub.amount));
      const validUntil = new Date(today);
      validUntil.setDate(validUntil.getDate() + sub.durationDays);
      setFValidUntil(validUntil.toISOString().slice(0, 10));
    }
  };

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
      const sub = subscriptions.find((s) => s.id === fSubscriptionId);
      const res = await paymentsApi.create(currentTenantId, {
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
      } as any);

      // Skip WhatsApp when the mutation was queued offline
      if (!res.data._offlineQueued && selectedMember?.phone) {
        const msg = [
          `Hi ${selectedMember.name},`,
          ``,
          `Your payment of ${formatCurrency(amount)} for *${sub?.title ?? "subscription"}* at *${gymName}* has been recorded.`,
          fStatus === "COMPLETED" ? `Status: Completed` : `Status: Pending`,
          fValidUntil ? `Valid until: ${fValidUntil}` : "",
          fNote ? `Note: ${fNote}` : "",
          ``,
          `Thank you!`,
        ]
          .filter(Boolean)
          .join("\n");
        const phone = selectedMember.phone.replace(/\D/g, "");
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
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
              {!selectedMember && error.includes("member") && (
                <p className="text-sm text-destructive-foreground">{error}</p>
              )}
            </div>

            {/* Subscription Selection */}
            <div className="space-y-2">
              <Label htmlFor="subscription">Subscription Plan *</Label>
              <Select
                id="subscription"
                value={fSubscriptionId}
                onChange={(e) => handleSubChange(e.target.value)}
              >
                <option value="">Choose a plan...</option>
                {subscriptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} - {formatCurrency(s.amount)}
                  </option>
                ))}
              </Select>
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
                disabled={tenantRole() !== "ADMIN"}
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
                id="status"
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value as "PENDING" | "COMPLETED")}
              >
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
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
