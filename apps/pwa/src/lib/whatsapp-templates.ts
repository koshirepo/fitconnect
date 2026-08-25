import type { TenantSettings, WhatsAppTemplateKey } from "@/types/api";

type TemplateContextValue = string | number | null | undefined;

const FALLBACK_WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKey, string> = {
  new_member_welcome: `Welcome to *{{gymName}}*!

Hi *{{memberName}}*,
Your membership has been created successfully.
Member ID: *{{memberId}}*

{{paymentSummarySection}}{{subscriptionLine}}Your login password is your phone number and your username is {{email}}.

Thank you for joining us.`,
  payment_reminder: `Hi {{memberName}},

This is a friendly reminder from *{{gymName}}* that your subscription has expired{{expirySuffix}}.

Please renew your membership at the earliest to continue enjoying uninterrupted access to the gym.

Thank you.`,
  payment_receipt: `Hi {{memberName}},

Your payment of {{amount}} for *{{subscriptionTitle}}* at *{{gymName}}* has been recorded.
Status: {{status}}
{{validUntilLine}}{{noteLine}}Thank you.`,
};

export function getTenantWhatsAppTemplateBody(
  settings: TenantSettings | null | undefined,
  key: WhatsAppTemplateKey,
) {
  return (
    settings?.whatsappTemplates.find((template) => template.key === key)?.body ??
    FALLBACK_WHATSAPP_TEMPLATES[key]
  );
}

export function renderWhatsAppTemplateBody(
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
