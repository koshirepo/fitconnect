import { create } from "zustand";
import { persist } from "zustand/middleware";

/** User preference. "system" follows the OS setting. */
export type Theme = "dark" | "light" | "system";

/** The theme actually applied to <html> — "system" is resolved to one of these. */
export type ResolvedTheme = "dark" | "light";

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  isMobile: boolean;
  setIsMobile: (mobile: boolean) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/** Reads the OS colour-scheme preference. Falls back to dark when unavailable. */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      isMobile: false,
      setIsMobile: (mobile) => set({ isMobile: mobile, sidebarOpen: !mobile }),
      theme: "system",
      setTheme: (theme) => set({ theme }),
      // Flips to the opposite of what is currently *shown*, so toggling out of
      // "system" does the visually obvious thing.
      toggleTheme: () =>
        set((s) => {
          const shown = s.theme === "system" ? getSystemTheme() : s.theme;
          return { theme: shown === "dark" ? "light" : "dark" };
        }),
    }),
    {
      name: "gms-ui",
      // Only persist theme — sidebar state resets on load
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
);
