import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { tenantsApi } from "@/api/tenants";
import { uploadsApi } from "@/api/uploads";
import { paymentsApi } from "@/api/payments";
import { settingsApi } from "@/api/settings";
import { shiftsApi } from "@/api/shifts";
import { getApiError } from "@/api/client";
import { storeFileOffline } from "@/lib/offline-files";
import { queueMutation } from "@/lib/api-cache";
import type {
  Subscription,
  TenantCharge,
  Shift,
  AddMemberPayload,
} from "@/types/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  UserPlus,
  ArrowLeft,
  ArrowRight,
  IndianRupee,
  Shield,
  Mail,
} from "lucide-react";
import MemberForm, { type MemberFormData } from "@/components/forms/MemberForm";

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function AddMemberPage() {
  const navigate = useNavigate();
  const { currentTenantId } = useAuthStore();

  // Step management: 1 = member details, 2 = subscription & charges
  const [step, setStep] = React.useState(1);
  const [memberData, setMemberData] = React.useState<MemberFormData | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);
  const [emailSent, setEmailSent] = React.useState(false);
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = React.useState(false);

  // Step 2 data
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [charges, setCharges] = React.useState<TenantCharge[]>([]);
  const [loadingOptions, setLoadingOptions] = React.useState(false);
  const [selectedSubscriptionId, setSelectedSubscriptionId] =
    React.useState<string>("");
  const [selectedChargeIds, setSelectedChargeIds] = React.useState<string[]>(
    [],
  );

  // Load subscriptions and charges when moving to step 2
  const loadPaymentOptions = React.useCallback(async () => {
    if (!currentTenantId) return;
    setLoadingOptions(true);
    try {
      const [subsRes, chargesRes] = await Promise.all([
        paymentsApi.listSubscriptions(currentTenantId),
        settingsApi.listCharges(currentTenantId),
      ]);
      setSubscriptions(subsRes.data.data.subscriptions);
      const activeCharges = chargesRes.data.data.charges.filter(
        (c: TenantCharge) => c.isActive,
      );
      setCharges(activeCharges);
      // Auto-select mandatory charges
      setSelectedChargeIds(
        activeCharges
          .filter((c: TenantCharge) => c.isMandatory)
          .map((c: TenantCharge) => c.id),
      );
    } catch {
      setError("Failed to load subscription plans and charges.");
    } finally {
      setLoadingOptions(false);
    }
  }, [currentTenantId]);

  const loadShiftOptions = React.useCallback(async () => {
    if (!currentTenantId) return;
    setLoadingShifts(true);
    try {
      const res = await shiftsApi.list(currentTenantId, 1, 100, false);
      setShifts(res.data.data.shifts);
    } catch {
      setShifts([]);
    } finally {
      setLoadingShifts(false);
    }
  }, [currentTenantId]);

  React.useEffect(() => {
    void loadShiftOptions();
  }, [loadShiftOptions]);

  const handleStep1Submit = async (data: MemberFormData) => {
    setError("");
    if (!currentTenantId) {
      setError("No gym selected. Please select a gym first.");
      return;
    }
    setMemberData(data);
    setStep(2);
    loadPaymentOptions();
  };

  const handleToggleCharge = (chargeId: string, mandatory: boolean) => {
    if (mandatory) return; // Can't unselect mandatory charges
    setSelectedChargeIds((prev) =>
      prev.includes(chargeId)
        ? prev.filter((id) => id !== chargeId)
        : [...prev, chargeId],
    );
  };

  const selectedSubscription = subscriptions.find(
    (s) => s.id === selectedSubscriptionId,
  );
  const selectedChargesTotal = charges
    .filter((c) => selectedChargeIds.includes(c.id))
    .reduce((sum, c) => sum + c.amount, 0);
  const subscriptionTotal = selectedSubscription?.amount ?? 0;
  const grandTotal = selectedChargesTotal + subscriptionTotal;

  const handleFinalSubmit = async () => {
    if (!currentTenantId || !memberData) return;
    setError("");
    setSubmitting(true);
    try {
      const memberPayload: AddMemberPayload = {
        name: memberData.name,
        email: memberData.email,
        phone: memberData.phone,
        role: memberData.role,
        ...(selectedSubscriptionId
          ? { subscriptionId: selectedSubscriptionId }
          : {}),
        ...(selectedChargeIds.length > 0
          ? { chargeIds: selectedChargeIds }
          : {}),
        ...(memberData.shiftId ? { shiftId: memberData.shiftId } : {}),
      };

      if (navigator.onLine) {
        // Online: upload photo first, then create member
        if (memberData.photoFile) {
          const uploadRes = await uploadsApi.uploadAvatar(memberData.photoFile);
          memberPayload.avatarUrl = uploadRes.data.data.url;
        }

        const res = await tenantsApi.addMember(currentTenantId, memberPayload);

        // If the interceptor queued this offline, skip online-only side effects
        if (!res.data._offlineQueued) {
          setEmailSent(!!res.data.data.emailSent);

          const waText = res.data.data.whatsappText;
          if (waText && memberData.phone) {
            const digits = memberData.phone.replace(/\D/g, "");
            const phone = digits.startsWith("91") ? digits : `91${digits}`;
            window.open(
              `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`,
              "_blank",
            );
          }
        }

        setSuccess(true);
      } else {
        // Offline: store photo in IDB and queue member creation
        let pendingFileId: number | undefined;
        if (memberData.photoFile) {
          pendingFileId = await storeFileOffline(memberData.photoFile);
        }

        await queueMutation(
          `/tenants/${currentTenantId}/members`,
          "POST",
          {
            ...memberPayload,
            ...(pendingFileId != null ? { _pendingFileId: pendingFileId } : {}),
          },
          { "x-tenant-id": currentTenantId },
        );

        setSuccess(true);
      }
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAnother = () => {
    setSuccess(false);
    setError("");
    setEmailSent(false);
    setStep(1);
    setMemberData(null);
    setSelectedSubscriptionId("");
    setSelectedChargeIds([]);
  };

  return (
    <div className="mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add Member</h1>
          <p className="text-muted-foreground">
            {step === 1
              ? "Step 1: Member details"
              : "Step 2: Subscription & charges"}
          </p>
        </div>
      </div>

      {/* Success State */}
      {success ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold">
                Member Added Successfully
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The new member has been registered and their details have been
                shared.
              </p>
            </div>

            {emailSent && (
              <div className="w-full max-w-sm space-y-2">
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Mail className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-medium text-blue-700">
                      Email Sent
                    </p>
                  </div>
                  <p className="text-xs text-blue-600">
                    Login credentials and payment details have been sent to the
                    member's email.
                  </p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center">
                  <p className="text-xs text-green-600">
                    WhatsApp message with admission details has been opened in a
                    new tab.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/members")}>
                Back to Members
              </Button>
              <Button onClick={handleAddAnother}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Another
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : step === 1 ? (
        /* Step 1: Member Details */
        <Card>
          <CardHeader>
            <CardTitle>New Member Details</CardTitle>
            <CardDescription>
              Fill in the details below. The member will receive login
              credentials for the gym portal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemberForm
              mode="create"
              initialData={memberData ?? undefined}
              error={error}
              submitting={false}
              shiftOptions={shifts}
              loadingShifts={loadingShifts}
              onSubmit={handleStep1Submit}
              onCancel={() => navigate("/members")}
              submitLabel="Next: Select Plan"
            />
          </CardContent>
        </Card>
      ) : (
        /* Step 2: Subscription & Charges */
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Member Details
          </Button>

          {loadingOptions ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              {/* Subscription Plans */}
              <Card>
                <CardHeader>
                  <CardTitle>Select Subscription Plan</CardTitle>
                  <CardDescription>
                    Choose a membership plan for the new member (optional)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {subscriptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No subscription plans available. You can create plans in
                      the Subscriptions page.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {/* No plan option */}
                      <button
                        type="button"
                        onClick={() => setSelectedSubscriptionId("")}
                        className={`rounded-lg border-2 p-4 text-left transition-all ${
                          selectedSubscriptionId === ""
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/30"
                        }`}
                      >
                        <p className="font-medium text-sm">No Plan</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Skip subscription for now
                        </p>
                      </button>
                      {subscriptions.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedSubscriptionId(sub.id)}
                          className={`rounded-lg border-2 p-4 text-left transition-all ${
                            selectedSubscriptionId === sub.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <p className="font-medium text-sm">{sub.title}</p>
                          {sub.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {sub.description}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-lg font-bold">
                              {formatAmount(sub.amount)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              / {sub.durationDays} days
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Fixed Charges */}
              {charges.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <IndianRupee className="h-5 w-5" />
                      Fixed Charges
                    </CardTitle>
                    <CardDescription>
                      Mandatory charges are auto-selected. Toggle optional
                      charges as needed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {charges.map((charge) => {
                        const isSelected = selectedChargeIds.includes(
                          charge.id,
                        );
                        return (
                          <label
                            key={charge.id}
                            className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5"
                                : "border-border"
                            } ${charge.isMandatory ? "cursor-default" : ""}`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  handleToggleCharge(
                                    charge.id,
                                    charge.isMandatory,
                                  )
                                }
                                disabled={charge.isMandatory}
                                className="rounded"
                              />
                              <div>
                                <p className="text-sm font-medium">
                                  {charge.name}
                                </p>
                                {charge.isMandatory && (
                                  <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                    <Shield className="h-3 w-3" />
                                    Mandatory
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="font-semibold text-sm">
                              {formatAmount(charge.amount)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment Summary */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {charges
                      .filter((c) => selectedChargeIds.includes(c.id))
                      .map((charge) => (
                        <div key={charge.id} className="flex justify-between">
                          <span className="text-muted-foreground">
                            {charge.name}
                          </span>
                          <span>{formatAmount(charge.amount)}</span>
                        </div>
                      ))}
                    {selectedSubscription && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          {selectedSubscription.title} (
                          {selectedSubscription.durationDays} days)
                        </span>
                        <span>{formatAmount(selectedSubscription.amount)}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold text-base">
                      <span>Total</span>
                      <span>{formatAmount(grandTotal)}</span>
                    </div>
                  </div>

                  {error && (
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <div className="mt-4 flex gap-3">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Back
                    </Button>
                    <Button
                      onClick={handleFinalSubmit}
                      disabled={submitting}
                      className="flex-1"
                    >
                      {submitting ? (
                        "Adding Member..."
                      ) : (
                        <>
                          Add Member & Record Payment
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
