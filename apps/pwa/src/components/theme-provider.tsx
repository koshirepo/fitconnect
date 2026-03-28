import * as React from "react";
import { useUIStore } from "@/stores/ui";

/**
 * Syncs the persisted theme from the UI store to <html>.
 * Swap .dark ↔ .light by calling toggleTheme() / setTheme() from useUIStore.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(theme);
  }, [theme]);

  return <>{children}</>;
}
