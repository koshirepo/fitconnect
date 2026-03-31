import type { WhatsAppTemplate, WhatsAppTemplateKey } from "../shared/types/models";

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
  "payment_receipt",
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
    ],
    defaultBody: `Welcome to *{{gymName}}*!

Hi *{{memberName}}*,
Your membership has been created successfully.
Member ID: *{{memberId}}*

{{paymentSummarySection}}{{subscriptionLine}}Your login password is your phone number and your username is {{email}}.

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
  payment_receipt: {
    label: "Payment Receipt",
    description: "Opened after a payment is recorded.",
    variables: [
      "memberName",
      "amount",
      "subscriptionTitle",
      "gymName",
      "status",
      "validUntilLine",
      "noteLine",
    ],
    defaultBody: `Hi {{memberName}},

Your payment of {{amount}} for *{{subscriptionTitle}}* at *{{gymName}}* has been recorded.
Status: {{status}}
{{validUntilLine}}{{noteLine}}Thank you.`,
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
