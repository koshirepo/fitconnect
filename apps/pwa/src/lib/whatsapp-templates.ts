/**
 * Documentation: WhatsApp template helpers for the PWA.
 *
 * - Resolves the body to use for a message, preferring the gym's saved override from tenant settings and falling back to the shared default.
 * - The default bodies and the placeholder renderer live in `@fitconnect/shared/whatsapp-templates`, so an edit to a template reaches the API and the PWA together instead of drifting between them.
 * - Primary exports: getTenantWhatsAppTemplateBody, renderWhatsAppTemplateBody.
 */
import {
  renderTemplateBody,
  resolveWhatsAppTemplateBody,
} from "@fitconnect/shared/whatsapp-templates";
import type { TenantSettings, WhatsAppTemplateKey } from "@/types/api";

/**
 * The body this gym should use for a message: its own saved override when it has
 * one, otherwise the shared default.
 */
export function getTenantWhatsAppTemplateBody(
  settings: TenantSettings | null | undefined,
  key: WhatsAppTemplateKey,
) {
  const override = settings?.whatsappTemplates.find((template) => template.key === key)?.body;
  return override ?? resolveWhatsAppTemplateBody(key);
}

/** Substitute `{{placeholders}}` and tidy the resulting whitespace. */
export const renderWhatsAppTemplateBody = renderTemplateBody;
