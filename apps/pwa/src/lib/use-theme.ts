import * as React from "react";

import { getSystemTheme, useUIStore, type ResolvedTheme, type Theme } from "@/stores/ui";

export type { Theme, ResolvedTheme };

const MEDIA = "(prefers-color-scheme: light)";

function subscribeToSystemTheme(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(MEDIA);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Convenience hook for reading and changing the app theme.
 *
 * Usage:
 *   const { theme, resolvedTheme, isDark, setTheme, toggleTheme } = useTheme();
 *
 * `theme` is the user's preference ("light" | "dark" | "system"); it is what a
 * settings UI should reflect. `resolvedTheme` is what is actually on screen and
 * tracks the OS while the preference is "system".
 */
export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);

  // Re-render when the OS preference changes, so consumers showing the active
  // theme stay accurate while the preference is "system".
  const systemTheme = React.useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    () => "dark" as ResolvedTheme,
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  return {
    /** The user's stored preference — "light", "dark", or "system" */
    theme,
    /** The theme actually applied to <html> */
    resolvedTheme,
    /** True when a dark palette is on screen */
    isDark: resolvedTheme === "dark",
    /** Set a specific preference (persisted) */
    setTheme,
    /** Flip between light and dark, based on what is currently shown */
    toggleTheme,
  };
}
