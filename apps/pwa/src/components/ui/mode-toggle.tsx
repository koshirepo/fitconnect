import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/use-theme";

/**
 * Theme switcher for the header.
 *
 * Starts out following the OS ("system" is the default preference) and shows
 * whichever palette is currently on screen. Clicking flips to the opposite of
 * what is shown and pins that choice, which the UI store persists.
 */
export function ModeToggle({ className }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme();
  const next = isDark ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(className)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {isDark ? <Moon /> : <Sun />}
    </Button>
  );
}
