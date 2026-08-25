/**
 * Documentation: Gender presentation.
 *
 * - One place that decides which icon, label, and accent colour a gender gets, so the form chips, the person card, and the member detail page can never drift apart.
 * - `GENDER_OPTIONS` is the order the form offers them in; `genderMeta` resolves a stored value, returning null for the accounts that predate the field.
 * - Primary exports: GENDER_OPTIONS, genderMeta, DEFAULT_GENDER.
 */
import { Mars, Transgender, Venus } from "lucide-react";
import type { Gender } from "@/types/api";

export type GenderMeta = {
  value: Gender;
  label: string;
  icon: React.ElementType;
  /** Chip colouring, kept legible in both themes. */
  chipClass: string;
};

export const GENDER_OPTIONS: GenderMeta[] = [
  {
    value: "MALE",
    label: "Male",
    icon: Mars,
    chipClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    value: "FEMALE",
    label: "Female",
    icon: Venus,
    chipClass: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  },
  {
    value: "OTHER",
    label: "Other",
    icon: Transgender,
    chipClass: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
];

/** What a new member form starts on. */
export const DEFAULT_GENDER: Gender = "MALE";

/** Presentation for a stored value, or null when there is nothing on file. */
export function genderMeta(gender: string | null | undefined): GenderMeta | null {
  if (!gender) return null;
  return GENDER_OPTIONS.find((option) => option.value === gender) ?? null;
}
