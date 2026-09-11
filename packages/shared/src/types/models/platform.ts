/**
 * Documentation: What a gym pays the platform.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

// ─── Platform Billing ─────────────────────────────────────────────────────────

export interface PlatformPayment {
  id: string;
  tenantId: string;
  amount: number;
  note?: string | null;
  extendsUntil: string;
  recordedBy: string;
  recordedByUser: { id: string; name: string };
  createdAt: string;
}

export interface RecordPlatformPaymentPayload {
  amount: number;
  note?: string;
  extendsUntil: string;
}
