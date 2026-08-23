import * as React from "react";
import { getSystemTheme, useUIStore, type ResolvedTheme } from "@/stores/ui";

/**
 * Syncs the persisted theme preference to <html>.
 *
 * The preference may be "light", "dark", or "system"; only the *resolved*
 * value ends up as a class. When the preference is "system" we also listen for
 * OS-level changes so the app follows along without a reload.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  React.useEffect(() => {
    const apply = (resolved: ResolvedTheme) => {
      const root = document.documentElement;
      root.classList.remove("dark", "light");
      root.classList.add(resolved);
      root.style.colorScheme = resolved;
    };

    if (theme !== "system") {
      apply(theme);
      return;
    }

    apply(getSystemTheme());

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "light" : "dark");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return <>{children}</>;
}
