import * as React from "react";
import { useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { publicApi } from "@/api/public";
import { isTenantSubdomain } from "@/lib/subdomain";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/ui/share-button";
import { QrCode } from "@/components/ui/qr-code";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge as BadgeUI } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveAssetUrl } from "@/lib/assets";
import { formatShiftWindow } from "@/lib/shifts";
import { formatDate } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  Users,
  Dumbbell,
  CreditCard,
  ArrowRight,
  ShoppingBag,
  Building2,
  Sparkles,
  ShieldCheck,
  Clock3,
  CircleDollarSign,
  MessageCircle,
  QrCode as QrCodeIcon,
} from "lucide-react";
import type { PublicTenantDetail } from "@/types/api";
import { useSeo, absoluteUrl } from "@/lib/seo";

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);

export default function TenantPublicPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [tenant, setTenant] = React.useState<PublicTenantDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // A gym's own site: this is the page that should rank for the gym's name, and
  // the one people paste into WhatsApp. The canonical stays "/" because a gym
  // is served from its own subdomain.
  useSeo({
    title: tenant?.name ?? "Gym",
    exactTitle: Boolean(tenant?.name),
    description:
      tenant?.description?.trim() ||
      (tenant
        ? `${tenant.name}${tenant.address ? ` in ${tenant.address}` : ""}. Memberships, timings, facilities and the gym store.`
        : "Gym memberships, timings and facilities."),
    canonicalPath: "/",
    image: tenant?.logoUrl ?? undefined,
    jsonLd: tenant
      ? {
          "@context": "https://schema.org",
          "@type": "HealthAndBeautyBusiness",
          additionalType: "https://schema.org/ExerciseGym",
          name: tenant.name,
          url: absoluteUrl("/"),
          ...(tenant.description ? { description: tenant.description } : {}),
          ...(tenant.logoUrl ? { image: tenant.logoUrl } : {}),
          ...(tenant.address ? { address: tenant.address } : {}),
          ...(tenant.phone ? { telephone: tenant.phone } : {}),
        }
      : undefined,
  });


  React.useEffect(() => {
    if (!isTenantSubdomain()) {
      setTenant(null);
      setError("Gym not found or unavailable.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const tenantHost = typeof window !== "undefined" ? window.location.host : "";

    publicApi
      .getTenantByHost(tenantHost)
      .then((res) => setTenant(res.data.data.tenant))
      .catch(() => setError("Gym not found or unavailable."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <CardSkeleton />;

  if (error || !tenant) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <EmptyState
          icon={Building2}
          title="Gym not found"
          description={error || "This gym page does not exist."}
          action={
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Button>
          }
        />
      </div>
    );
  }

  const estdYear = tenant.estd ? new Date(tenant.estd).getFullYear() : null;
  const aboutText = tenant.markdown?.trim();
  const subscriptions = tenant.subscriptions ?? [];
  const shifts = tenant.shifts ?? [];
  const memberCount = tenant._count?.memberships ?? 0;
  const lowestPlanAmount = subscriptions.length
    ? Math.min(...subscriptions.map((sub) => sub.amount))
    : null;
  const whatsappUrl = buildWhatsAppUrl(
    tenant.phone,
    `Hi ${tenant.name}, I would like to know more about your gym memberships.`,
  );
  const attendanceQrUrl =
    typeof window === "undefined"
      ? `/attendance/qr/${tenant.id}`
      : `${window.location.origin}/attendance/qr/${tenant.id}`;

  return (
    <div className="bg-[radial-gradient(1200px_500px_at_15%_-20%,rgba(59,130,246,0.12),transparent),radial-gradient(900px_500px_at_100%_0%,rgba(16,185,129,0.1),transparent)] text-foreground">
      <section className="border-b">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-5 lg:py-16 lg:px-8">
          <div className="space-y-6 lg:col-span-3">
            <BadgeUI variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Active Gym Profile
            </BadgeUI>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border bg-background/80 shadow-sm">
                  {tenant.logoUrl ? (
                    <img
                      key={tenant.logoUrl}
                      src={resolveAssetUrl(tenant.logoUrl) ?? tenant.logoUrl}
                      alt={`${tenant.name} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-3">
                  <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                    {tenant.name}
                  </h1>
                  {tenant.description && (
                    <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                      {tenant.description}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <BadgeUI variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {memberCount} active members
              </BadgeUI>
              <BadgeUI variant="secondary" className="gap-1">
                <CreditCard className="h-3 w-3" />
                {subscriptions.length} active plans
              </BadgeUI>
              <BadgeUI variant="secondary" className="gap-1">
                <Clock3 className="h-3 w-3" />
                {shifts.length} active shifts
              </BadgeUI>
              {estdYear && (
                <BadgeUI variant="secondary" className="gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Est. {estdYear}
                </BadgeUI>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate(isAuthenticated ? "/dashboard" : "/signup")}>
                {isAuthenticated ? "Go to Dashboard" : "Join This Gym"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              {!isAuthenticated && (
                <Button variant="outline" onClick={() => navigate("/login")}>
                  Sign In
                </Button>
              )}
              {/* The gym's own shop, in its public form for everybody. This
                  used to send a signed-in visitor to /dashboard/store, which
                  sits behind the tenant and permission guards — so anyone
                  signed in without STORE_READ at *this* gym was redirected away
                  rather than shown the shop they clicked on. The public
                  storefront answers for all of them, and a member still reaches
                  the buying view from their own dashboard. */}
              <Button
                variant="outline"
                onClick={() => navigate("/shop")}
              >
                <ShoppingBag className="h-4 w-4" />
                Visit Store
              </Button>

            </div>
          </div>

          <Card className="lg:col-span-2 bg-background/80">
            <CardHeader>
              <CardTitle className="text-lg">Gym Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                  {tenant.logoUrl ? (
                    <img
                      key={tenant.logoUrl}
                      src={resolveAssetUrl(tenant.logoUrl) ?? tenant.logoUrl}
                      alt={`${tenant.name} logo`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground">Slug: {tenant.slug}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  Listed on {formatDate(tenant.createdAt)}
                </div>
                {lowestPlanAmount !== null && (
                  <div className="flex items-center gap-2">
                    <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                    Plans starting at {fmt(lowestPlanAmount)}
                  </div>
                )}
                {tenant.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <span>{tenant.address}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-3 lg:py-12 lg:px-8">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>About {tenant.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {aboutText ? (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-img:rounded-lg">
                  <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {aboutText}
                  </Markdown>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  This gym has not added a public description yet.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Why People Join
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Community</p>
                <p className="mt-1 text-sm font-medium">
                  {memberCount} members already enrolled.
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Plan Flexibility</p>
                <p className="mt-1 text-sm font-medium">
                  {subscriptions.length > 0
                    ? `${subscriptions.length} active subscription options.`
                    : "Plans can be configured by gym admins."}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Direct Support</p>
                <p className="mt-1 text-sm font-medium">
                  {tenant.phone
                    ? "Call support directly from this page."
                    : "Support details can be shared by the gym."}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Shift Options</p>
                <p className="mt-1 text-sm font-medium">
                  {shifts.length > 0
                    ? `${shifts.length} active shift windows published.`
                    : "Shift timings can be shared by the gym."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <QrCodeIcon className="h-5 w-5" />
                Attendance QR
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <QrCode
                value={attendanceQrUrl}
                size={192}
                label={`${tenant.name} attendance QR`}
                className="mx-auto border"
              />
              <p className="break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {attendanceQrUrl}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {/* Share rather than copy: on a phone this opens the share
                    sheet, which is how a QR link actually reaches the person
                    who needs it. Desktop still copies. */}
                <ShareButton
                  url={attendanceQrUrl}
                  title={`${tenant.name} attendance`}
                  label="Share"
                  size="default"
                />
                <Button type="button" onClick={() => navigate(`/attendance/qr/${tenant.id}`)}>
                  Mark
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Subscription Plans
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No public plans available right now.
                </p>
              ) : (
                subscriptions.map((sub, index) => (
                  <div
                    key={sub.id}
                    className="rounded-lg border p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold">{sub.title}</h4>
                      {index === 0 && <BadgeUI variant="secondary">Popular</BadgeUI>}
                    </div>
                    {sub.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{sub.description}</p>
                    )}
                    <div className="mt-3 flex items-end justify-between">
                      <p className="text-xl font-bold text-primary">{fmt(sub.amount)}</p>
                      <p className="text-xs text-muted-foreground">{sub.durationDays} days</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock3 className="h-5 w-5" />
                Shift Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {shifts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No public shift timings available right now.
                </p>
              ) : (
                shifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="rounded-lg border p-4 transition-colors hover:border-primary/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-semibold">{shift.name}</h4>
                      <BadgeUI variant="secondary">
                        {formatShiftWindow(shift.startTime, shift.endTime)}
                      </BadgeUI>
                    </div>
                    {shift.description && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {shift.description}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tenant.email && (
                <a
                  href={`mailto:${tenant.email}`}
                  className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {tenant.email}
                </a>
              )}
              {tenant.phone && (
                <a
                  href={`tel:${tenant.phone}`}
                  className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {tenant.phone}
                </a>
              )}
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                >
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  Chat on WhatsApp
                </a>
              )}
              {tenant.address && (
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  {tenant.address}
                </div>
              )}
              {!tenant.email && !tenant.phone && !tenant.address && !whatsappUrl && (
                <p className="text-sm text-muted-foreground">No contact details available.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/25 bg-primary/5">
            <CardContent className="py-6 text-center">
              <Dumbbell className="mx-auto h-8 w-8 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">Ready to start?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {isAuthenticated
                  ? "Pick up where you left off with this gym."
                  : "Sign up, pick a plan, and pay online to activate your membership."}
              </p>
              <Button
                className="mt-4 w-full"
                onClick={() => navigate(isAuthenticated ? "/dashboard" : "/signup")}
              >
                {isAuthenticated ? "Open Dashboard" : "Join Now"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              {!isAuthenticated && (
                <Button
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => navigate("/login")}
                >
                  I already have an account
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* No footer of its own. The shared frame draws one that speaks as this
          gym; the one that used to live here signed the gym's own page with the
          platform's name. */}
    </div>
  );
}
