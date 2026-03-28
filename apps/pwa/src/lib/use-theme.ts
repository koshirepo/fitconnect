import { useUIStore, type Theme } from "@/stores/ui";

export type { Theme };

/**
 * Convenience hook for reading and changing the app theme.
 *
 * Usage:
 *   const { theme, isDark, toggleTheme, setTheme } = useTheme();
 *
 * To add a new theme:
 *   1. Add its name to the Theme union in src/stores/ui.ts
 *   2. Add the corresponding CSS class block to src/styles/themes.css
 *   3. Call setTheme("my-new-theme") from anywhere in the app
 */
export function useTheme() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);

  return {
    /** Active theme name — matches the class on <html> */
    theme,
    /** True when the dark-blue theme is active */
    isDark: theme === "dark",
    /** Switch to a specific theme */
    setTheme,
    /** Toggle between "dark" and "light" */
    toggleTheme,
  };
}
