/**
 * Documentation: Public gym self-registration.
 *
 * - The list-your-gym flow for an owner with no account: gym details and a web address first, then who they are and the password they will sign in with.
 * - Two steps rather than one long form, because the second half is an account and the first half is a business — mixing them reads as one intimidating page.
 * - The address is checked against the API as it is typed, so a taken slug is caught before submission rather than in a rejection afterwards. It is also the one field that cannot be changed later from inside the app, which is why it gets its own explanation.
 * - Registering ends in the owner's dashboard, signed in. The gym itself is inactive until the platform approves it, and the confirmation says so plainly rather than implying the place is live.
 * - Primary exports: RegisterGymPage.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { publicApi } from "@/api/public";
import { getApiError } from "@/api/client";
import { toSlug } from "@fitconnect/shared/utils";
import { MIN_PASSWORD_LENGTH } from "@fitconnect/shared/constants";
import { readFileAsDataUrl } from "@/lib/file";
import { haptics } from "@/lib/haptics";
import { buildTenantPublicUrl, getRootHostname } from "@/lib/subdomain";
import { useAuthStore } from "@/stores/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoCapture } from "@/components/ui/photo-capture";
import { TURNSTILE_SITE_KEY, TurnstileWidget } from "@/components/ui/turnstile";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { TenantSignupResult } from "@/types/api";

type GymDetails = {
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  description: string;
};

type OwnerDetails = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

/** What the availability check currently says about the typed address. */
type SlugState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken"; reason: string };

const EMPTY_GYM: GymDetails = {
  name: "",
  slug: "",
  email: "",
  phone: "",
  address: "",
  description: "",
};

const EMPTY_OWNER: OwnerDetails = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterGymPage() {
  const navigate = useNavigate();
  // 1 = the gym, 2 = the owner's account.
  const [step, setStep] = React.useState(1);
  const [gym, setGym] = React.useState<GymDetails>(EMPTY_GYM);
  const [owner, setOwner] = React.useState<OwnerDetails>(EMPTY_OWNER);
  // True once the owner edits the address by hand, after which the gym name no
  // longer overwrites it — retyping the name should not undo a chosen address.
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [slugState, setSlugState] = React.useState<SlugState>({ kind: "idle" });

  // Both images are mandatory, so they are held as files until submission
  // rather than uploaded as they are picked — there is no session to upload
  // with, and nothing should land in the bucket for a registration abandoned
  // halfway.
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  // Null until the challenge is solved, and again when it expires.
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<TenantSignupResult | null>(null);

  const rootHost = getRootHostname() || "fitconnect.co.in";

  /**
   * Ask the API whether the address is free, a beat after typing stops.
   *
   * Debounced because this fires per keystroke otherwise, and the endpoint is
   * rate-limited per IP — a fast typist would exhaust their own budget before
   * reaching the second step.
   */
  React.useEffect(() => {
    const slug = gym.slug.trim();
    if (!slug) {
      setSlugState({ kind: "idle" });
      return;
    }

    setSlugState({ kind: "checking" });
    let cancelled = false;

    const timer = window.setTimeout(() => {
      publicApi
        .checkTenantSlug(slug)
        .then(({ data: resp }) => {
          if (cancelled) return;
          setSlugState(
            resp.data.available
              ? { kind: "available" }
              : {
                  kind: "taken",
                  reason: resp.data.reason ?? "That address is already taken.",
                },
          );
        })
        .catch(() => {
          // A failed check must not block the form. The API rejects a taken
          // address on submit regardless, so the worst case is a late answer.
          if (!cancelled) setSlugState({ kind: "idle" });
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [gym.slug]);

  const setGymField = (field: keyof GymDetails, value: string) => {
    setGym((current) => {
      const next = { ...current, [field]: value };
      // The address follows the gym name until the owner takes it over, so the
      // common case needs no thought and the deliberate case still wins.
      if (field === "name" && !slugTouched) {
        next.slug = toSlug(value).slice(0, 60);
      }
      return next;
    });
  };

  const setOwnerField = (field: keyof OwnerDetails, value: string) => {
    setOwner((current) => ({ ...current, [field]: value }));
  };

  const gymStepValid =
    gym.name.trim().length >= 2 &&
    gym.slug.trim().length >= 3 &&
    slugState.kind !== "taken" &&
    Boolean(logoFile);

  const passwordsMatch =
    owner.password.length > 0 && owner.password === owner.confirmPassword;

  const ownerStepValid =
    owner.name.trim().length >= 2 &&
    owner.email.trim().length > 0 &&
    Boolean(avatarFile) &&
    owner.password.length >= MIN_PASSWORD_LENGTH &&
    passwordsMatch &&
    (!TURNSTILE_SITE_KEY || Boolean(turnstileToken));

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerStepValid || submitting) return;
    if (!logoFile || !avatarFile) {
      // The steps will not advance without both, so this guards the types
      // rather than a path anyone reaches by using the page normally.
      setError("A logo and a photo are both required.");
      return;
    }

    setError("");
    setSubmitting(true);

    try {
      const [logoDataUrl, avatarDataUrl] = await Promise.all([
        readFileAsDataUrl(logoFile),
        readFileAsDataUrl(avatarFile),
      ]);

      const { data: resp } = await publicApi.registerTenant({
        name: gym.name.trim(),
        slug: gym.slug.trim(),
        logoDataUrl,
        ...(gym.email.trim() ? { email: gym.email.trim() } : {}),
        ...(gym.phone.trim() ? { phone: gym.phone.trim() } : {}),
        ...(gym.address.trim() ? { address: gym.address.trim() } : {}),
        ...(gym.description.trim() ? { description: gym.description.trim() } : {}),
        owner: {
          name: owner.name.trim(),
          email: owner.email.trim(),
          avatarDataUrl,
          ...(owner.phone.trim() ? { phone: owner.phone.trim() } : {}),
          password: owner.password,
        },
        ...(turnstileToken ? { "cf-turnstile-response": turnstileToken } : {}),
      });

      const result = resp.data;

      /**
       * Adopt the session the registration returned.
       *
       * `fetchMe` populates the membership the route guards read, so it has to
       * land before the owner navigates into the dashboard — otherwise the
       * guard sees a token with no gym and bounces them out.
       */
      const store = useAuthStore.getState();
      store.setTokens(result.auth.accessToken, result.auth.refreshToken);
      await store.fetchMe();

      haptics.member();
      setOutcome(result);
    } catch (err) {
      haptics.failure();
      setError(getApiError(err));
      // A consumed challenge cannot be replayed, so the widget has to be solved
      // again before the next attempt.
      setTurnstileToken(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (outcome) {
    const gymUrl = buildTenantPublicUrl(outcome.tenant.slug);

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
              <CheckCircle2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">{outcome.tenant.name} is registered</CardTitle>
            <CardDescription>
              You're signed in as the gym's admin. Set the place up now — plans,
              charges, shifts and staff — and it goes live the moment we approve it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">Awaiting approval</p>
                <p className="text-muted-foreground">
                  Until then your gym is inactive: it won't appear in the public gym
                  list, and members can't sign up yet. Everything you set up now is
                  kept.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Your gym's address</p>
              <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {gymUrl}
              </p>
              <p className="text-xs text-muted-foreground">
                It can take a few minutes for a new address to start working.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">You sign in with</p>
              <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {outcome.loginEmail}
              </p>
            </div>

            {/* A full page load, not a route change: the dashboard lives on the
                gym's own subdomain, which this host cannot navigate to with the
                router. */}
            <Button
              className="w-full"
              onClick={() => {
                window.location.href = `${gymUrl}/dashboard`;
              }}
            >
              Go to your dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">List your gym</CardTitle>
          <CardDescription>
            {step === 1
              ? "Tell us about the gym. Step 1 of 2."
              : "Now the account you'll manage it with. Step 2 of 2."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (gymStepValid) setStep(2);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="gym-name">Gym name</Label>
                <Input
                  id="gym-name"
                  value={gym.name}
                  onChange={(e) => setGymField("name", e.target.value)}
                  placeholder="Rudra Fitness"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gym-slug">Web address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="gym-slug"
                    value={gym.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setGymField("slug", e.target.value.toLowerCase());
                    }}
                    placeholder="rudra-fitness"
                    required
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">
                    .{rootHost}
                  </span>
                </div>
                <div className="flex min-h-5 items-center gap-1.5 text-xs">
                  {slugState.kind === "checking" && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">Checking…</span>
                    </>
                  )}
                  {slugState.kind === "available" && (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      <span className="text-emerald-600">That address is available.</span>
                    </>
                  )}
                  {slugState.kind === "taken" && (
                    <>
                      <XCircle className="h-3 w-3 text-destructive" />
                      <span className="text-destructive">{slugState.reason}</span>
                    </>
                  )}
                  {slugState.kind === "idle" && (
                    <span className="text-muted-foreground">
                      Lowercase letters, numbers and hyphens. This one is permanent.
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Gym logo</Label>
                {/* No face check: this is a logo, not a person. */}
                <PhotoCapture
                  value={logoPreview}
                  onChange={(file, preview) => {
                    setLogoFile(file);
                    setLogoPreview(preview);
                  }}
                  requireFace={false}
                  cropOutputWidth={512}
                  croppedFileName="logo.jpg"
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  Required. It appears on your public page, your members' ID cards,
                  and the app.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gym-phone">Gym phone</Label>
                  <Input
                    id="gym-phone"
                    type="tel"
                    value={gym.phone}
                    onChange={(e) => setGymField("phone", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gym-email">Gym email</Label>
                  <Input
                    id="gym-email"
                    type="email"
                    value={gym.email}
                    onChange={(e) => setGymField("email", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gym-address">Address</Label>
                <Textarea
                  id="gym-address"
                  value={gym.address}
                  onChange={(e) => setGymField("address", e.target.value)}
                  placeholder="Optional — where members will find you"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gym-description">One-line description</Label>
                <Input
                  id="gym-description"
                  value={gym.description}
                  onChange={(e) => setGymField("description", e.target.value)}
                  placeholder="Optional — shown on your public page"
                  maxLength={300}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => navigate("/")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" disabled={!gymStepValid}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleRegister}>
              <div className="space-y-2">
                <Label htmlFor="owner-name">Your name</Label>
                <Input
                  id="owner-name"
                  value={owner.name}
                  onChange={(e) => setOwnerField("name", e.target.value)}
                  placeholder="Rahul Sharma"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Your photo</Label>
                {/* Face check on, like every other avatar in the app. */}
                <PhotoCapture
                  value={avatarPreview}
                  onChange={(file, preview) => {
                    setAvatarFile(file);
                    setAvatarPreview(preview);
                  }}
                  croppedFileName="avatar.jpg"
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  Required. Your staff and members see it beside your name.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="owner-email">Your email</Label>
                  <Input
                    id="owner-email"
                    type="email"
                    value={owner.email}
                    onChange={(e) => setOwnerField("email", e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner-phone">Your phone</Label>
                  <Input
                    id="owner-phone"
                    type="tel"
                    value={owner.phone}
                    onChange={(e) => setOwnerField("phone", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-password">Password</Label>
                <Input
                  id="owner-password"
                  type="password"
                  value={owner.password}
                  onChange={(e) => setOwnerField("password", e.target.value)}
                  placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner-confirm">Confirm password</Label>
                <Input
                  id="owner-confirm"
                  type="password"
                  value={owner.confirmPassword}
                  onChange={(e) => setOwnerField("confirmPassword", e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {owner.confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-destructive">Passwords don't match.</p>
                )}
              </div>

              <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Your gym is created inactive and reviewed before it goes live. You
                  can sign in and set everything up straight away.
                </p>
              </div>

              <TurnstileWidget onToken={setTurnstileToken} className="pt-1" />

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button type="submit" disabled={!ownerStepValid || submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Registering…
                    </>
                  ) : (
                    "Register gym"
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
