/**
 * Documentation: Occupation presentation.
 *
 * - One place that turns an occupation row's stored `icon` key into the glyph every screen draws, so the member form, the member card and the manage screen can never disagree.
 * - The icon set is curated rather than the whole of lucide: the manage screen has to offer a grid somebody can choose from, and an unbounded list is not a choice.
 * - Anything unknown — a null icon, or a key from a newer release than this build — falls back to a briefcase instead of drawing nothing.
 * - Age lives here too, because the only place a date of birth is read out loud is next to the occupation on a member's record.
 * - Primary exports: OCCUPATION_ICONS, OCCUPATION_ICON_KEYS, occupationIcon, DEFAULT_OCCUPATION_NAME, toDateInputValue, ageFromDateOfBirth.
 * - The glyph component that draws these lives in `components/ui/occupation-glyph`, because this file is data and helpers.
 */
import {
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Brush,
  Building2,
  Bus,
  Camera,
  ChefHat,
  Cog,
  Cpu,
  Dumbbell,
  Ellipsis,
  Factory,
  Gavel,
  GraduationCap,
  Hammer,
  HardHat,
  Heart,
  House,
  Landmark,
  Laptop,
  Leaf,
  Mic,
  Music,
  Palette,
  PenTool,
  Plane,
  Scale,
  Scissors,
  ShieldCheck,
  Ship,
  ShoppingBag,
  Stethoscope,
  Store,
  Syringe,
  Tractor,
  TreePalm,
  Truck,
  Wrench,
} from "lucide-react";

/**
 * The icons an occupation may use, by the key stored on the row.
 *
 * Keys are lowercase-and-dashes, matching what the API accepts. Add to this map
 * to offer a new one; nothing else has to change, because the manage screen
 * renders its picker straight from here.
 */
export const OCCUPATION_ICONS: Record<string, React.ElementType> = {
  baby: Baby,
  bike: Bike,
  "book-open": BookOpen,
  briefcase: Briefcase,
  brush: Brush,
  "building-2": Building2,
  bus: Bus,
  camera: Camera,
  "chef-hat": ChefHat,
  cog: Cog,
  cpu: Cpu,
  dumbbell: Dumbbell,
  ellipsis: Ellipsis,
  factory: Factory,
  gavel: Gavel,
  "graduation-cap": GraduationCap,
  hammer: Hammer,
  "hard-hat": HardHat,
  heart: Heart,
  house: House,
  landmark: Landmark,
  laptop: Laptop,
  leaf: Leaf,
  mic: Mic,
  music: Music,
  "palm-tree": TreePalm,
  palette: Palette,
  "pen-tool": PenTool,
  plane: Plane,
  scale: Scale,
  scissors: Scissors,
  "shield-check": ShieldCheck,
  ship: Ship,
  "shopping-bag": ShoppingBag,
  stethoscope: Stethoscope,
  store: Store,
  syringe: Syringe,
  tractor: Tractor,
  truck: Truck,
  wrench: Wrench,
};

/** Every offerable icon key, in the order the picker shows them. */
export const OCCUPATION_ICON_KEYS = Object.keys(OCCUPATION_ICONS);

/** The glyph for a stored key. Unknown or missing keys get a briefcase. */
export function occupationIcon(icon?: string | null): React.ElementType {
  if (!icon) return Briefcase;
  return OCCUPATION_ICONS[icon] ?? Briefcase;
}

/**
 * What a member form starts on, matched by name against the list the API sends.
 *
 * By name rather than by id because the list is data: a gym's database may have
 * been seeded, edited or renamed, and a hardcoded id that no longer exists
 * would leave the field mysteriously blank. If nothing matches, the form simply
 * starts with nothing selected.
 */
export const DEFAULT_OCCUPATION_NAME = "Student";

/**
 * The stored value as a date input wants it: "1998-04-23".
 *
 * Dates of birth are stored at UTC midnight, so the UTC calendar day is the
 * right one to read off — a local-time reading turns that midnight into the
 * previous day for anyone west of Greenwich.
 */
export function toDateInputValue(dateOfBirth?: string | null): string {
  if (!dateOfBirth) return "";

  const parsed = new Date(dateOfBirth);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

/** Whole years, the way a person would say their age. Null when nothing is on file. */
export function ageFromDateOfBirth(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;

  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;

  const today = new Date();
  let age = today.getUTCFullYear() - born.getUTCFullYear();

  // Their birthday has not come round yet this year.
  const monthDiff = today.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }

  return age >= 0 && age < 130 ? age : null;
}

