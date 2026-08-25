-- Documentation: add tenant-scoped WhatsApp template overrides.
-- - Stores per-tenant WhatsApp message templates in TenantSettings so admins can customize messaging without code changes.
-- - Keep the JSON object keyed by template purpose (for example: new_member_welcome, payment_reminder, payment_receipt).

ALTER TABLE "TenantSettings"
ADD COLUMN "whatsappTemplates" JSONB NOT NULL DEFAULT '{}';
