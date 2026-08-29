import * as React from "react";
import { useNavigate } from "react-router-dom";
import { publicApi } from "@/api/public";
import { buildTenantPublicUrl } from "@/lib/subdomain";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AvatarCard from "@/components/ui/avatarCard";
import {
  Dumbbell,
  Users,
  Shield,
  CreditCard,
  Award,
  BarChart3,
  Building2,
  ArrowRight,
  ChevronRight,
  Smartphone,
  Layers,
  Zap,
  Globe,
  MapPin,
} from "lucide-react";
import type { PublicGymSummary } from "@/types/api";

const FEATURES = [
  {
    icon: Building2,
    title: "Multi-Tenant SaaS",
    description:
      "Each gym gets its own isolated workspace with custom branding, settings, and member management.",
  },
  {
    icon: Users,
    title: "Member Management",
    description:
      "Enroll members, assign roles (Admin / Coach / Member), manage profiles, and track attendance.",
  },
  {
    icon: CreditCard,
    title: "Payments & Subscriptions",
    description:
      "Create subscription plans, process payments, and keep a full payment history with status tracking.",
  },
  {
    icon: Dumbbell,
    title: "Workout Plans",
    description:
      "Coaches can create workout plans with detailed exercises and assign them to individual members.",
  },
  {
    icon: Award,
    title: "Badges & Achievements",
    description:
      "Motivate members with customisable badges — assign them with notes and track achievements.",
  },
  {
    icon: Shield,
    title: "Role-Based Access",
    description:
      "Platform-level and tenant-level RBAC. Admins, Coaches, and Members see only what they need.",
  },
  {
    icon: BarChart3,
    title: "Audit Logging",
    description:
      "Full audit trail of all actions — who did what, when, and from where. Platform & tenant scoped.",
  },
  {
    icon: Smartphone,
    title: "Mobile-First PWA",
    description:
      "Progressive Web App that works beautifully on any device — installable, fast, and offline-ready.",
  },
  {
    icon: Layers,
    title: "Subscription Plans",
    description:
      "Flexible subscription management with custom durations, pricing tiers, and automated renewals.",
  },
];

const STATS = [
  { label: "Modules", value: "10+" },
  { label: "API Endpoints", value: "40+" },
  { label: "Built With", value: "TypeScript" },
  { label: "Architecture", value: "Enterprise" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [gyms, setGyms] = React.useState<PublicGymSummary[]>([]);

  React.useEffect(() => {
    publicApi
      .listGyms(1, 6)
      .then((res) => setGyms(res.data.data.gyms))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* ─── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm mb-6">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>Enterprise-grade Gym Management</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Manage Your Gym{" "}
              <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Like a Pro
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              A modern, multi-tenant SaaS platform for gym owners and fitness studios. Members,
              payments, workout plans, badges — all in one beautiful, mobile-first app.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button size="lg" onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}>
                {isAuthenticated ? "Go to Dashboard" : "Start Free"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() =>
                  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })
                }
              >
                Explore Features
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ─────────────────────────────────────────────────── */}
      <section id="stats" className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-bold text-primary">{s.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ──────────────────────────────────────────────── */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything You Need</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              A comprehensive platform built with modern technologies for scalability, performance,
              and a delightful user experience.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="group hover:border-primary/40 transition-colors">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tech Stack ────────────────────────────────────────────── */}
      <section className="border-y bg-muted/30 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold tracking-tight">Built with Modern Tech</h2>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              "React 19",
              "TypeScript 5.9",
              "Hono",
              "Prisma ORM",
              "PostgreSQL",
              "Tailwind CSS v4",
              "Zustand",
              "Vite 8",
              "Bun Runtime",
              "pnpm Monorepo",
            ].map((t) => (
              <span
                key={t}
                className="rounded-full border bg-background px-4 py-2 text-sm font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Gyms Directory ────────────────────────────────────────── */}
      {gyms.length > 0 && (
        <section id="gyms" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Our Gyms</h2>
              <p className="mt-4 text-muted-foreground">
                Explore partner gyms and fitness studios on our platform.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {gyms.map((g) => {
                const gymUrl = buildTenantPublicUrl(g.slug);

                // Same tab: a gym's page is where the visitor was heading, not
                // a detour they should have to close afterwards.
                return (
                  <a key={g.id} href={gymUrl} className="group block">
                    <Card className="h-full hover:border-primary/40 transition-colors">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                          {/* The identity block takes the room that is left so
                              every card's chevron lands on the same edge, and a
                              four-figure member count keeps to one line. */}
                          <AvatarCard
                            name={g.name}
                            avatarUrl={g.logoUrl}
                            variant="md"
                            className="min-w-0 flex-1"
                          >
                            {g.address && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {g.address}
                              </p>
                            )}
                            <p className="mt-1 flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
                              <Users className="h-3 w-3 shrink-0" />
                              {g._count.memberships} members
                            </p>
                          </AvatarCard>
                          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ─── CTA ───────────────────────────────────────────────────── */}
      <section className="bg-primary/5 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <Globe className="h-12 w-12 text-primary mx-auto mb-6" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to Transform Your Gym?
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Join the platform and start managing your gym with enterprise-grade tools. Setup takes
            minutes, not months.
          </p>
          <div className="mt-8">
            <Button size="lg" onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")}>
              {isAuthenticated ? "Go to Dashboard" : "Get Started Now"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Dumbbell className="h-4 w-4" />
              <span>FitConnect — Gym Management System</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} GMS. Built with ❤️ using modern web technologies.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
