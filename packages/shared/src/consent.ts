/**
 * Documentation: The terms a member accepts when they join.
 *
 * - Lives in the shared package for the same reason the WhatsApp templates do: the PWA renders the wording on the signup form and the API snapshots it onto the membership. Two copies would drift, and here that would mean showing somebody one thing and recording another.
 * - `DEFAULT_CONSENT_TEXT` exists so the box is never empty on a gym that has not written its own — not because it suits any particular gym. It is deliberately plain and short, and the settings screen says plainly that a gym should replace it with wording it has had checked.
 * - Primary exports: DEFAULT_CONSENT_TEXT, CONSENT_MAX_LENGTH, resolveConsentText, normalizeConsentText.
 */

/**
 * Placeholder wording, shown until a gym writes its own.
 *
 * Three things a gym generally wants acknowledged before somebody trains:
 * that they are fit to, that they will follow the rules of the room, and that
 * they know what the gym does with their details. It is written to be
 * understood rather than to be thorough — a member who cannot follow the
 * sentence has not really consented to it.
 *
 * This is a starting point, not legal advice, and the settings screen says so.
 */
export const DEFAULT_CONSENT_TEXT = `I confirm that I am physically fit to exercise and that I have told the gym about any medical condition or injury that could affect my training.

I understand that I train at my own risk, that I will follow the gym's rules and the instructions of its staff, and that I will use the equipment as I have been shown.

I agree that the gym may hold my contact details, photograph and attendance record for the purpose of managing my membership.`;

/**
 * Cap on a gym's own wording.
 *
 * Long enough for a real waiver, short enough that the signup form stays a
 * thing somebody will actually read. Consent nobody reads is the failure mode
 * worth designing against, not consent that ran out of characters.
 */
export const CONSENT_MAX_LENGTH = 4000;

/** Trim and collapse the stray blank lines a textarea collects. */
export function normalizeConsentText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The wording a given gym is asking for: its own, or the default.
 *
 * A gym that clears the box gets the default back rather than an empty
 * consent. Consent is required on every join, so "no wording" is not a state
 * the join flow can do anything sensible with — it would mean asking somebody
 * to agree to nothing.
 */
export function resolveConsentText(override?: string | null): string {
  const trimmed = typeof override === "string" ? normalizeConsentText(override) : "";
  return trimmed.length > 0 ? trimmed : DEFAULT_CONSENT_TEXT;
}

/**
 * The paragraphs, for rendering.
 *
 * Consent is read on a phone by somebody deciding whether to hand over money.
 * One unbroken block is the shape people skip; the gym's own line breaks are
 * the structure it was written with, so they are kept.
 */
export function consentParagraphs(text: string): string[] {
  return normalizeConsentText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
