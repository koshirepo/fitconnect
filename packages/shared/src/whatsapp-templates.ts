/**
 * Documentation: WhatsApp message templates.
 *
 * - Owns the template keys, their default bodies, and the placeholder renderer used to produce outgoing messages.
 * - Lives in the shared package because both sides render the same messages: the API sends them, and the PWA opens pre-filled WhatsApp links. Two copies of the default bodies would silently drift the moment either was edited.
 * - Primary exports: whatsappTemplateKeys, normalizeWhatsAppTemplateOverrides, resolveWhatsAppTemplateBody, getWhatsAppTemplates, renderTemplateBody, renderWhatsAppTemplate.
 */
import type { WhatsAppTemplate, WhatsAppTemplateKey } from "./types/models";

type TemplateContextValue = string | number | null | undefined;
type TemplateMetadata = {
  label: string;
  description: string;
  variables: string[];
  defaultBody: string;
};

export const whatsappTemplateKeys = [
  "new_member_welcome",
  "payment_reminder",
  "pending_payment_reminder",
  "payment_receipt",
  "salary_payment",
  "salary_updated",
] as const satisfies readonly WhatsAppTemplateKey[];

const WHATSAPP_TEMPLATE_METADATA: Record<WhatsAppTemplateKey, TemplateMetadata> = {
  new_member_welcome: {
    label: "New Member Welcome",
    description: "Opened after a new member is added.",
    variables: [
      "gymName",
      "memberName",
      "memberId",
      "email",
      "paymentSummarySection",
      "subscriptionLine",
      "idCardLine",
    ],
    defaultBody: `Welcome to *{{gymName}}*!

Hi *{{memberName}}*,
Your membership has been created successfully.
Member ID: *{{memberId}}*

{{paymentSummarySection}}{{subscriptionLine}}Your login password is your phone number and your username is {{email}}.{{idCardLine}}

Thank you for joining us.`,
  },
  payment_reminder: {
    label: "Payment Reminder",
    description: "Used when a member's subscription is due or expired.",
    variables: ["memberName", "gymName", "expirySuffix"],
    defaultBody: `Hi {{memberName}},

This is a friendly reminder from *{{gymName}}* that your subscription has expired{{expirySuffix}}.

Please renew your membership at the earliest to continue enjoying uninterrupted access to the gym.

Thank you.`,
  },
  pending_payment_reminder: {
    label: "Pending Payment Reminder",
    description:
      "Used when a member has an unpaid payment — a signup that never finished checkout, or a bill the desk recorded as pending.",
    variables: ["memberName", "gymName", "amountLine"],
    defaultBody: `Hi {{memberName}},

We have a pending payment on your account at *{{gymName}}*.{{amountLine}}

Please complete it to activate your membership and start training with us.

Thank you.`,
  },
  payment_receipt: {
    label: "Payment Receipt",
    description:
      "Opened after a payment is recorded. Carries the part-payment lines too, so a member who paid some of what they owe is told what is left rather than being sent a receipt that reads as settled.",
    variables: [
      "memberName",
      "amount",
      "subscriptionTitle",
      "gymName",
      "status",
      "totalLine",
      "duesLine",
      "balanceLine",
      "validUntilLine",
      "noteLine",
    ],
    // The three new lines carry their own labels and newline, so a receipt for
    // a payment in full renders exactly as it did before: the placeholders
    // resolve to nothing and the blank lines collapse.
    defaultBody: `Hi {{memberName}},

Your payment of {{amount}} for *{{subscriptionTitle}}* at *{{gymName}}* has been recorded.
Status: {{status}}
{{totalLine}}{{duesLine}}{{balanceLine}}{{validUntilLine}}{{noteLine}}Thank you.`,
  },
  salary_payment: {
    label: "Salary Payment",
    description:
      "Opened after a salary payment is recorded for a staff member. Carries the outstanding line, so somebody paid part of a month is told what is still to come rather than being sent a slip that reads as settled.",
    variables: [
      "staffName",
      "gymName",
      "amount",
      "monthLabel",
      "method",
      "paidLine",
      "outstandingLine",
      "noteLine",
    ],
    defaultBody: `Hi {{staffName}},

{{gymName}} has recorded a salary payment of *{{amount}}* to you for *{{monthLabel}}*.
Paid by: {{method}}
{{paidLine}}{{outstandingLine}}{{noteLine}}
Thank you.`,
  },
  salary_updated: {
    label: "Salary Updated",
    description:
      "Opened when a staff member's pay changes — a new monthly figure, or a bonus, incentive, benefit or deduction added to a month.",
    variables: ["staffName", "gymName", "changeLine", "monthLabel", "payableLine"],
    defaultBody: `Hi {{staffName}},

There is an update to your pay at *{{gymName}}*.
{{changeLine}}{{payableLine}}
Please speak to the desk if anything looks wrong.`,
  },
};

export function normalizeWhatsAppTemplateOverrides(
  input: unknown,
): Partial<Record<WhatsAppTemplateKey, string>> {
  if (!input || typeof input !== "object") return {};

  const overrides: Partial<Record<WhatsAppTemplateKey, string>> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      (whatsappTemplateKeys as readonly string[]).includes(key) &&
      typeof value === "string" &&
      value.trim().length > 0
    ) {
      overrides[key as WhatsAppTemplateKey] = value.trim();
    }
  }
  return overrides;
}

export function resolveWhatsAppTemplateBody(
  key: WhatsAppTemplateKey,
  overrides?: unknown,
) {
  const normalized = normalizeWhatsAppTemplateOverrides(overrides);
  return normalized[key] ?? WHATSAPP_TEMPLATE_METADATA[key].defaultBody;
}

export function getWhatsAppTemplates(overrides?: unknown): WhatsAppTemplate[] {
  const normalized = normalizeWhatsAppTemplateOverrides(overrides);

  return whatsappTemplateKeys.map((key) => {
    const metadata = WHATSAPP_TEMPLATE_METADATA[key];
    const body = normalized[key] ?? metadata.defaultBody;
    return {
      key,
      label: metadata.label,
      description: metadata.description,
      variables: metadata.variables,
      body,
      defaultBody: metadata.defaultBody,
      isCustom: body !== metadata.defaultBody,
    };
  });
}

export function renderTemplateBody(
  body: string,
  context: Record<string, TemplateContextValue>,
) {
  return body
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) =>
      String(context[key] ?? ""),
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderWhatsAppTemplate(
  key: WhatsAppTemplateKey,
  context: Record<string, TemplateContextValue>,
  overrides?: unknown,
) {
  return renderTemplateBody(resolveWhatsAppTemplateBody(key, overrides), context);
}
