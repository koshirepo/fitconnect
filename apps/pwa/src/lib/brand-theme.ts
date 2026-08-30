/**
 * Documentation: Painting a gym's own colour over the platform's.
 *
 * - A gym with its own logo on the page looked like it was borrowing somebody else's software, because every accent on it was the platform's orange. This overrides the handful of tokens that carry the accent — and only those — so a gym's pages read as the gym's without anybody restyling a component.
 * - One stored value, everything else derived. The gradient's second stop comes from `color-mix`, which the browser computes; the readable text colour on top comes from the colour's own luminance. Storing those instead would be three values that can disagree with each other.
 * - Applied on the root element rather than compiled in, because the colour belongs to a gym and this bundle serves all of them. Removing it restores the defaults exactly, which is what happens when a gym clears its colour or the reader leaves for the app host.
 * - Primary exports: applyBrandColor, clearBrandColor, useBrandTheme.
 */
import * as React from "react";

/** The tokens the accent actually reaches. Everything else stays as designed. */
const BRAND_TOKENS = [
  "--primary",
  "--primary-foreground",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--ring",
] as const;

function normaliseHex(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : null;
}

/**
 * Whether text on this colour should be dark.
 *
 * Relative luminance, the same measure the contrast guidelines use. A gym that
 * picks lemon yellow gets black text rather than the white that would be
 * unreadable on it.
 */
function prefersDarkText(hex: string) {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

  return luminance > 0.45;
}

/** Paint the gym's colour onto the document. */
export function applyBrandColor(value: string | null | undefined) {
  if (typeof document === "undefined") return;

  const hex = value ? normaliseHex(value) : null;
  const root = document.documentElement;

  if (!hex) {
    clearBrandColor();
    return;
  }

  const foreground = prefersDarkText(hex) ? "oklch(0.15 0 0)" : "oklch(0.99 0 0)";

  root.style.setProperty("--primary", hex);
  root.style.setProperty("--primary-foreground", foreground);
  // The gradient's far end. `color-mix` keeps the shift perceptually even
  // across hues, which a fixed darkening in sRGB does not.
  root.style.setProperty(
    "--sidebar-primary",
    `color-mix(in oklab, ${hex}, black 22%)`,
  );
  root.style.setProperty("--sidebar-primary-foreground", foreground);
  // The focus ring is an accent too, and a ring in the platform's colour on a
  // gym's own button is the one place the seam would show.
  root.style.setProperty("--ring", `color-mix(in oklab, ${hex}, transparent 45%)`);

  // The browser chrome on Android, so the colour reaches past the page.
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", hex);
}

/** Put every token back to whatever the stylesheet says. */
export function clearBrandColor() {
  if (typeof document === "undefined") return;
  for (const token of BRAND_TOKENS) {
    document.documentElement.style.removeProperty(token);
  }
}

/**
 * Keep the document painted in one gym's colour for as long as it is shown.
 *
 * Mounted once at the app root: the accent belongs to the gym rather than to a
 * page, so the storefront, the signup form, the ID card, and the dashboard all
 * inherit it without any of them knowing it exists.
 */
export function useBrandTheme(brandColor: string | null | undefined) {
  React.useEffect(() => {
    applyBrandColor(brandColor);
    return clearBrandColor;
  }, [brandColor]);
}
