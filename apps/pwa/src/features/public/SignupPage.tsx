/**
 * Documentation: Public member self-signup.
 *
 * - The join-a-gym flow for a visitor with no account, laid out like the admin's Add Member page and driven by the same `MemberForm`: details first, then plan and charges, then payment.
 * - Role is not asked for. The form's role picker only appears for someone holding `MEMBERS_ROLE_UPDATE`, and a visitor holds nothing, so a self-signup is always a MEMBER — enforced again by the API, which never reads a role from this request.
 * - The photo is mandatory here. It travels inside the signup request as a data URL rather than through `/uploads`, which needs a session this caller does not have.
 * - The member exists as soon as the form is submitted, inactive with a pending bill. Paying is what activates them, and a closed payment window leaves exactly that: an inactive member the front desk can settle with later.
 * - Primary exports: SignupPage.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { publicApi } from "@/api/public";
import { getApiError } from "@/api/client";
import { haptics } from "@/lib/haptics";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { resolveAssetUrl } from "@/lib/assets";
import MemberForm, { type MemberFormData } from "@/components/forms/MemberForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Dumbbell,
  IndianRupee,
  Shield,
} from "lucide-react";
import type { SelfSignupResult, SignupOptions } from "@/types/api";
import { TURNSTILE_SITE_KEY, TurnstileWidget } from "@/components/ui/turnstile";
import { useAuthStore } from "@/stores/auth";
import { getTenantDashboardPath } from "@/lib/subdomain";

/** Read a captured photo into the base64 payload the signup endpoint takes. */
function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("That photo could not be read."));
    reader.readAsDataURL(file);
  });
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

type Outcome = {
  signup: SelfSignupResult;
  /** ACTIVE only once the money actually settled. */
  active: boolean;
  /** Why they are not active yet, when they are not. */
  pendingReason: string;
};

export default function SignupPage() {
  const navigate = useNavigate();

  const [options, setOptions] = React.useState<SignupOptions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");

  // Step 1 = details, 2 = plan and charges. Mirrors the admin Add Member page.
  const [step, setStep] = React.useState(1);
  const [memberData, setMemberData] = React.useState<MemberFormData | null>(null);
  // Empty until the visitor picks one; the first plan stands in as the default
  // so arriving at this step already shows a priced summary rather than a blank
  // total. Deriving it beats seeding state in an effect, which would fight a
  // deliberate deselection on the render after the plans arrive.
  const [chosenPlanId, setChosenPlanId] = React.useState("");
  const [selectedChargeIds, setSelectedChargeIds] = React.useState<string[]>([]);

  const [submitting, setSubmitting] = React.useState(false);
  // Null until the challenge is solved, and again when it expires.
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);

  React.useEffect(() => {
    let active = true;

    publicApi
      .getSignupOptions()
      .then((res) => {
        if (!active) return;
        const data = res.data.data;
        setOptions(data);
        // Mandatory charges are never optional, so they start ticked and stay so.
        setSelectedChargeIds(
          data.charges.filter((charge) => charge.isMandatory).map((c) => c.id),
        );
      })
      .catch((caught) => {
        if (active) setLoadError(getApiError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const plans = options?.plans ?? [];
  const selectedPlanId = chosenPlanId || plans[0]?.id || "";
  const charges = options?.charges ?? [];
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const chargesTotal = charges
    .filter((charge) => selectedChargeIds.includes(charge.id))
    .reduce((sum, charge) => sum + charge.amount, 0);
  const grandTotal = (selectedPlan?.amount ?? 0) + chargesTotal;

  const brandLogo = resolveAssetUrl(options?.tenant.logoUrl ?? null);

  const handleToggleCharge = (chargeId: string, mandatory: boolean) => {
    if (mandatory) return;
    setSelectedChargeIds((prev) =>
      prev.includes(chargeId)
        ? prev.filter((id) => id !== chargeId)
        : [...prev, chargeId],
    );
  };

  const handleDetailsSubmit = async (data: MemberFormData) => {
    setError("");
    setMemberData(data);
    setStep(2);
  };

  /**
   * Adopt the session the signup returned.
   *
   * `fetchMe` is what populates the membership the route guards read, so it has
   * to land before any navigation into the app — otherwise the guard sees a
   * token with no gym and bounces straight back out.
   */
  const signInNewMember = async (auth: { accessToken: string; refreshToken: string }) => {
    const store = useAuthStore.getState();
    store.setTokens(auth.accessToken, auth.refreshToken);
    await store.fetchMe();
  };

  const handleJoin = async () => {
    if (!memberData || !selectedPlan) return;
    if (!memberData.photoFile) {
      // The form will not submit without one, so this is a guard rather than a
      // path anyone reaches by using the page normally.
      setError("A photo is required. Go back and add one.");
      return;
    }
    setError("");
    setSubmitting(true);

    try {
      const res = await publicApi.selfSignup({
        name: memberData.name,
        ...(memberData.email ? { email: memberData.email } : {}),
        phone: memberData.phone,
        gender: memberData.gender,
        avatarDataUrl: await toDataUrl(memberData.photoFile),
        subscriptionId: selectedPlan.id,
        ...(selectedChargeIds.length > 0 ? { chargeIds: selectedChargeIds } : {}),
        ...(memberData.shiftId ? { shiftId: memberData.shiftId } : {}),
        ...(turnstileToken ? { "cf-turnstile-response": turnstileToken } : {}),
      });

      const signup = res.data.data;

      // Joining ends inside the app rather than at a login form: the API
      // returns a session for the account it just created. Done before the
      // payment branch below so a member whose payment is still pending is
      // signed in too — that is exactly who needs to reach their dashboard and
      // settle it.
      await signInNewMember(signup.auth);

      // No checkout means the gym takes no cards yet. The member exists and
      // owes the money at the desk, which is a finished signup, not a failure.
      if (!signup.checkout) {
        setOutcome({
          signup,
          active: false,
          pendingReason:
            "This gym isn't taking online payments yet, so your membership is pending until the front desk records your payment.",
        });
        return;
      }

      const result = await openRazorpayCheckout({
        keyId: signup.checkout.keyId,
        orderId: signup.checkout.orderId,
        amount: signup.checkout.amount,
        currency: signup.checkout.currency,
        name: options?.tenant.name ?? "Fit Connect",
        description: selectedPlan.title,
        prefill: {
          name: memberData.name,
          email: memberData.email || undefined,
          contact: memberData.phone,
        },
      });

      if (result.status !== "paid") {
        // Closing the window charges nothing, and a failed card charges
        // nothing either. Either way the membership is already on file.
        setOutcome({
          signup,
          active: false,
          pendingReason:
            result.status === "failed"
              ? `${result.message} Your membership is saved and stays pending until the payment goes through.`
              : "The payment window was closed before the payment finished, so your membership is pending. You can pay from your account or at the gym.",
        });
        return;
      }

      const verified = await publicApi.verifySignup({
        orderId: result.orderId,
        paymentId: result.paymentId,
        signature: result.signature,
      });

      // Joined, and paid to do it: both of the things this app buzzes for.
      haptics.payment();

      const active = verified.data.data.membership?.status === "ACTIVE";

      // Paid and active: there is nothing left to explain, so go straight in
      // rather than showing a receipt screen with a button to the same place.
      if (active) {
        navigate(getTenantDashboardPath("/"));
        return;
      }

      setOutcome({
        signup,
        active,
        pendingReason:
          "Your payment is recorded but the membership hasn't activated yet. It will as soon as the gym's payment provider confirms it.",
      });
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormPageSkeleton fields={5} />;

  if (loadError || !options) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {loadError || "This gym isn't accepting signups right now."}
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (outcome) {
    const { signup, active, pendingReason } = outcome;
    return (
      <div className="mx-auto max-w-2xl p-4 py-10">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                active ? "bg-green-100" : "bg-amber-100"
              }`}
            >
              {active ? (
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              ) : (
                <Clock className="h-7 w-7 text-amber-600" />
              )}
            </div>

            <div className="text-center">
              <h2 className="text-lg font-semibold">
                {active
                  ? `Welcome to ${options.tenant.name}!`
                  : "Membership Pending Payment"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {active
                  ? "Your payment went through and your membership is active."
                  : pendingReason}
              </p>
            </div>

            <div className="w-full max-w-sm space-y-2 rounded-lg border p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Member ID</span>
                <span className="font-medium">#{signup.membership.memberId}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Login email</span>
                <span className="truncate font-medium">{signup.loginEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Password</span>
                <span className="font-medium">Your phone number</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-muted-foreground">
                  {active ? "Paid" : "Amount due"}
                </span>
                <span className="font-semibold">{formatAmount(signup.total)}</span>
              </div>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Your password is your phone number — change it from your profile.
            </p>

            <Button onClick={() => navigate(getTenantDashboardPath("/"))}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 py-10">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-primary/5">
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={`${options.tenant.name} logo`}
              className="h-full w-full object-cover"
            />
          ) : (
            <Dumbbell className="h-8 w-8 text-primary" />
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Join {options.tenant.name}
          </h1>
          <p className="text-muted-foreground">
            {step === 1 ? "Step 1: Your details" : "Step 2: Plan & payment"}
          </p>
        </div>
      </div>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Your Details</CardTitle>
            <CardDescription>
              Fill in your details to create your membership. You'll get login
              access to the gym portal once you're done.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MemberForm
              mode="create"
              initialData={memberData ?? undefined}
              error={error}
              shiftOptions={options.shifts}
              requirePhoto
              onSubmit={handleDetailsSubmit}
              onCancel={() => navigate("/")}
              submitLabel="Next: Choose Plan"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Your Details
          </Button>

          {/* Plans */}
          <Card>
            <CardHeader>
              <CardTitle>Choose a Membership Plan</CardTitle>
              <CardDescription>
                Pick the plan you'd like to start with.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This gym hasn't published any plans yet. Please contact the gym
                  to join.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {plans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setChosenPlanId(plan.id)}
                      className={`rounded-lg border-2 p-4 text-left transition-all ${
                        selectedPlanId === plan.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <p className="text-sm font-medium">{plan.title}</p>
                      {plan.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {plan.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-lg font-bold">
                          {formatAmount(plan.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          / {plan.durationDays} days
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Charges */}
          {charges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5" />
                  Additional Charges
                </CardTitle>
                <CardDescription>
                  Mandatory charges are included. Add any optional ones you want.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {charges.map((charge) => {
                    const isSelected = selectedChargeIds.includes(charge.id);
                    return (
                      <label
                        key={charge.id}
                        className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                          isSelected ? "border-primary bg-primary/5" : "border-border"
                        } ${charge.isMandatory ? "cursor-default" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              handleToggleCharge(charge.id, charge.isMandatory)
                            }
                            disabled={charge.isMandatory}
                            className="rounded"
                          />
                          <div>
                            <p className="text-sm font-medium">{charge.name}</p>
                            {charge.isMandatory && (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                <Shield className="h-3 w-3" />
                                Mandatory
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-semibold">
                          {formatAmount(charge.amount)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {charges
                  .filter((charge) => selectedChargeIds.includes(charge.id))
                  .map((charge) => (
                    <div key={charge.id} className="flex justify-between">
                      <span className="text-muted-foreground">{charge.name}</span>
                      <span>{formatAmount(charge.amount)}</span>
                    </div>
                  ))}
                {selectedPlan && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {selectedPlan.title} ({selectedPlan.durationDays} days)
                    </span>
                    <span>{formatAmount(selectedPlan.amount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-base font-bold">
                  <span>Total</span>
                  <span>{formatAmount(grandTotal)}</span>
                </div>
              </div>

              {!options.onlinePaymentsEnabled && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                  This gym isn't taking card payments yet. You can still join —
                  your membership stays pending until you pay at the gym.
                </p>
              )}

              {error && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-600">
                  {error}
                </div>
              )}

              {TURNSTILE_SITE_KEY && (
                <div className="mt-4 flex justify-center">
                  <TurnstileWidget onToken={setTurnstileToken} />
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={handleJoin}
                  disabled={
                    submitting ||
                    !selectedPlan ||
                    (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)
                  }
                  className="flex-1"
                >
                  {submitting ? (
                    "Processing..."
                  ) : (
                    <>
                      {options.onlinePaymentsEnabled
                        ? `Pay ${formatAmount(grandTotal)} & Join`
                        : "Join & Pay at the Gym"}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Already a member?{" "}
        <Link to="/login" className="font-medium text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
