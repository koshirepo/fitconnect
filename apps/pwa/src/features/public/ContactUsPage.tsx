import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Mail,
  MessageSquare,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Headphones,
} from "lucide-react";

const CONTACT_CARDS = [
  {
    icon: Mail,
    title: "Email Us",
    description: "Drop us a line and we'll get back to you within one business day.",
    detail: "support@gms.app",
    href: "mailto:support@gms.app",
  },
  {
    icon: Headphones,
    title: "Support Centre",
    description: "Browse our knowledge base for guides, FAQs and troubleshooting tips.",
    detail: "help.gms.app",
    href: "#",
  },
  {
    icon: Clock,
    title: "Support Hours",
    description: "Our team is available to help you during business hours.",
    detail: "Mon – Fri, 9 am – 6 pm UTC",
    href: null,
  },
  {
    icon: MapPin,
    title: "Headquarters",
    description: "GMS is a fully remote company with team members across the globe.",
    detail: "Remote-first, worldwide",
    href: null,
  },
];

const FAQ = [
  {
    q: "How quickly will I receive a reply?",
    a: "We aim to respond to all enquiries within one business day. Urgent issues are typically addressed within a few hours.",
  },
  {
    q: "Do you offer onboarding support?",
    a: "Yes — every new gym gets a guided setup session to help you configure members, plans, and payments.",
  },
  {
    q: "Can I request a new feature?",
    a: "Absolutely. Use the contact form and select 'Feature Request' as the subject. We review all requests for our roadmap.",
  },
  {
    q: "Is there a phone number I can call?",
    a: "We currently handle all support via email and the contact form to give every customer an equal level of written, trackable support.",
  },
];

type FormState = "idle" | "submitting" | "success" | "error";

export default function ContactUsPage() {
  const [formState, setFormState] = React.useState<FormState>("idle");
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = React.useState<Partial<typeof form>>({});

  function validate() {
    const e: Partial<typeof form> = {};
    if (!form.name.trim()) e.name = "Name is required.";
    if (!form.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Enter a valid email address.";
    if (!form.subject.trim()) e.subject = "Subject is required.";
    if (!form.message.trim()) e.message = "Message is required.";
    else if (form.message.trim().length < 20) e.message = "Please provide at least 20 characters.";
    return e;
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof typeof form]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    // Simulate submission — replace with a real API call when available
    setFormState("submitting");
    setTimeout(() => {
      setFormState("success");
      setForm({ name: "", email: "", subject: "", message: "" });
    }, 1200);
  }

  return (
    <>
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm mb-6">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <span>We'd love to hear from you</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Get in{" "}
              <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Touch
              </span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Have a question, feedback, or just want to say hello? Fill in the form below or reach
              out via one of the channels listed here and we'll get back to you quickly.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Contact Cards ─────────────────────────────────────── */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CONTACT_CARDS.map(({ icon: Icon, title, description, detail, href }) => (
              <Card key={title} className="border bg-card">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    {description}
                  </p>
                  {href ? (
                    <a href={href} className="text-sm font-medium text-primary hover:underline">
                      {detail}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-foreground">{detail}</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Form + FAQ ────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-16 lg:grid-cols-2">
          {/* Contact Form */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Send Us a Message</h2>
            <p className="text-sm text-muted-foreground mb-8">
              All fields are required. We will never share your information with third parties.
            </p>

            {formState === "success" ? (
              <div className="flex flex-col items-center gap-4 rounded-xl border bg-muted/30 px-8 py-16 text-center">
                <CheckCircle2 className="h-12 w-12 text-primary" />
                <h3 className="text-xl font-semibold">Message Sent!</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Thanks for reaching out. We'll get back to you within one business day.
                </p>
                <Button variant="outline" onClick={() => setFormState("idle")} className="mt-2">
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                {/* Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Full Name</Label>
                  <Input
                    id="contact-name"
                    name="name"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={handleChange}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? "contact-name-error" : undefined}
                    disabled={formState === "submitting"}
                    autoComplete="name"
                  />
                  {errors.name && (
                    <p
                      id="contact-name-error"
                      className="flex items-center gap-1.5 text-xs text-destructive"
                    >
                      <AlertCircle className="h-3.5 w-3.5" /> {errors.name}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Email Address</Label>
                  <Input
                    id="contact-email"
                    name="email"
                    type="email"
                    placeholder="jane@example.com"
                    value={form.email}
                    onChange={handleChange}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "contact-email-error" : undefined}
                    disabled={formState === "submitting"}
                    autoComplete="email"
                  />
                  {errors.email && (
                    <p
                      id="contact-email-error"
                      className="flex items-center gap-1.5 text-xs text-destructive"
                    >
                      <AlertCircle className="h-3.5 w-3.5" /> {errors.email}
                    </p>
                  )}
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <Label htmlFor="contact-subject">Subject</Label>
                  <select
                    id="contact-subject"
                    name="subject"
                    value={form.subject}
                    onChange={handleChange}
                    disabled={formState === "submitting"}
                    aria-invalid={!!errors.subject}
                    aria-describedby={errors.subject ? "contact-subject-error" : undefined}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select a subject…</option>
                    <option value="General Enquiry">General Enquiry</option>
                    <option value="Sales">Sales</option>
                    <option value="Technical Support">Technical Support</option>
                    <option value="Billing">Billing</option>
                    <option value="Feature Request">Feature Request</option>
                    <option value="Bug Report">Bug Report</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.subject && (
                    <p
                      id="contact-subject-error"
                      className="flex items-center gap-1.5 text-xs text-destructive"
                    >
                      <AlertCircle className="h-3.5 w-3.5" /> {errors.subject}
                    </p>
                  )}
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <Label htmlFor="contact-message">Message</Label>
                  <textarea
                    id="contact-message"
                    name="message"
                    rows={5}
                    placeholder="Tell us how we can help…"
                    value={form.message}
                    onChange={handleChange}
                    disabled={formState === "submitting"}
                    aria-invalid={!!errors.message}
                    aria-describedby={errors.message ? "contact-message-error" : undefined}
                    className="flex min-h-30 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                  />
                  {errors.message && (
                    <p
                      id="contact-message-error"
                      className="flex items-center gap-1.5 text-xs text-destructive"
                    >
                      <AlertCircle className="h-3.5 w-3.5" /> {errors.message}
                    </p>
                  )}
                </div>

                {formState === "error" && (
                  <p className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Something went wrong. Please try again.
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={formState === "submitting"}
                >
                  {formState === "submitting" ? (
                    "Sending…"
                  ) : (
                    <>
                      Send Message <Send className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>

          {/* FAQ */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Frequently Asked Questions</h2>
            <p className="text-sm text-muted-foreground mb-8">
              Quick answers to the questions we hear most often.
            </p>
            <div className="space-y-4">
              {FAQ.map(({ q, a }) => (
                <div key={q} className="rounded-lg border bg-card p-5">
                  <h3 className="text-sm font-semibold mb-2">{q}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
