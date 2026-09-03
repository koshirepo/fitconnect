import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSeo } from "@/lib/seo";
import {
  Dumbbell,
  Users,
  Shield,
  CreditCard,
  Award,
  BarChart3,
  Heart,
  Zap,
  Target,
  Globe,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const VALUES = [
  {
    icon: Target,
    title: "Mission-Driven",
    description:
      "We exist to give gym owners powerful, enterprise-grade tools without the enterprise complexity or price tag.",
  },
  {
    icon: Heart,
    title: "Community First",
    description:
      "Every feature we build starts with a real need from gym owners and their members. Your feedback shapes the product.",
  },
  {
    icon: Shield,
    title: "Security & Trust",
    description:
      "Multi-tenant isolation, role-based access control, and a full audit trail mean your data stays yours — always.",
  },
  {
    icon: Zap,
    title: "Performance",
    description:
      "Built on a modern TypeScript stack with a mobile-first PWA frontend — fast, reliable, and works offline.",
  },
  {
    icon: Globe,
    title: "Transparency",
    description: "Open architecture, clear pricing, and no hidden fees. We grow when you grow.",
  },
  {
    icon: Users,
    title: "Inclusive",
    description:
      "From solo trainers to multi-location chains — GMS scales with you at every stage of your journey.",
  },
];

const PLATFORM_HIGHLIGHTS = [
  { icon: Dumbbell, label: "Workout Plan Builder" },
  { icon: Users, label: "Member Management" },
  { icon: CreditCard, label: "Payments & Subscriptions" },
  { icon: Award, label: "Badges & Achievements" },
  { icon: BarChart3, label: "Analytics & Audit Logs" },
  { icon: Shield, label: "Role-Based Access Control" },
];

const MILESTONES = [
  { year: "2023", event: "GMS founded with a vision to modernise gym management software." },
  {
    year: "2024",
    event: "Launched multi-tenant SaaS platform with payments and member management.",
  },
  { year: "2025", event: "Introduced PWA, offline support, badges, and a public product store." },
  { year: "2026", event: "Serving gyms worldwide with enterprise-grade tools built for everyone." },
];

export default function AboutUsPage() {
  useSeo({
    title: "About Us",
    description:
      "Why FitConnect exists, who builds it, and how it helps gyms run the everyday work of memberships, payments and attendance.",
    canonicalPath: "/about",
  });

  return (
    <>
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm mb-6">
              <Dumbbell className="h-3.5 w-3.5 text-primary" />
              <span>Our Story</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Built for Gym Owners,{" "}
              <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                By Fitness Lovers
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              GMS was born out of frustration with clunky, overpriced gym software. We set out to
              build the platform we always wished existed — powerful enough for enterprise gyms,
              simple enough for independent coaches.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Mission ───────────────────────────────────────────── */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Our Mission</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                We believe every gym — from a single-room box gym to a multi-location chain —
                deserves software that works as hard as their members. GMS provides an all-in-one,
                multi-tenant platform that handles everything from onboarding to payments, so gym
                owners can focus on what matters: their community.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Reduce admin overhead with automation",
                  "Keep members engaged with achievements and plans",
                  "Get clear financial insights in real time",
                  "Scale from 1 to 1,000 members without friction",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {PLATFORM_HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 rounded-lg border bg-card p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Values ────────────────────────────────────────────── */}
      <section id="values" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight">What We Stand For</h2>
          <p className="mt-4 text-muted-foreground">
            These principles guide every decision we make — from product design to how we support
            our customers.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="border bg-card">
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ─── Timeline ──────────────────────────────────────────── */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight">Our Journey</h2>
            <p className="mt-4 text-muted-foreground">
              From idea to a platform trusted by gyms worldwide.
            </p>
          </div>
          <div className="mx-auto max-w-2xl space-y-0">
            {MILESTONES.map((m, i) => (
              <div key={m.year} className="flex gap-6">
                {/* line + dot */}
                <div className="flex flex-col items-center">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-xs font-bold text-primary">
                    {m.year.slice(2)}
                  </div>
                  {i < MILESTONES.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
                </div>
                <div className="pb-10">
                  <p className="text-sm font-semibold text-primary">{m.year}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{m.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="rounded-2xl border bg-muted/30 px-8 py-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to Transform Your Gym?</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Join hundreds of gym owners who have already made the switch to smarter management.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/login" className={cn(buttonVariants({ size: "lg" }))}>
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/contact" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
