/**
 * Documentation: Transient notifications.
 *
 * - One place for the "that worked" / "that didn't" feedback that a screen would otherwise have to carry as its own piece of state. Most actions in this app either navigate away or leave the user guessing; a toast is the honest answer for the ones with nothing else to say.
 * - Deliberately hand-rolled, like the rest of `components/ui`, rather than pulling in a toast library for four states and a timer.
 * - Positioned above the sync pill and out of the way of thumbs, and announced to screen readers as a live region so a success is not visible-only.
 * - Errors stay until dismissed. A success can afford to vanish; a failure the person did not read is a failure they think succeeded.
 * - Primary exports: ToastProvider, useToast.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  variant: ToastVariant;
  message: string;
  /** Optional second line for detail the headline should not carry. */
  description?: string;
};

type ToastInput = string | { message: string; description?: string };

type ToastApi = {
  success: (input: ToastInput) => void;
  error: (input: ToastInput) => void;
  info: (input: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = React.createContext<ToastApi | null>(null);

/** How long a self-dismissing toast stays. Errors ignore this. */
const AUTO_DISMISS_MS = 4000;

const VARIANT_STYLE: Record<ToastVariant, { icon: React.ElementType; className: string }> = {
  success: {
    icon: CheckCircle2,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  error: {
    icon: AlertCircle,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  info: {
    icon: Info,
    className: "border-border bg-background text-foreground",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = React.useCallback(
    (variant: ToastVariant, input: ToastInput) => {
      const id = nextId.current++;
      const toast: Toast =
        typeof input === "string"
          ? { id, variant, message: input }
          : { id, variant, ...input };

      // Cap the stack so a loop of failures cannot bury the screen.
      setToasts((current) => [...current.slice(-2), toast]);

      if (variant !== "error") {
        window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (input) => push("success", input),
      error: (input) => push("error", input),
      info: (input) => push("info", input),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Above the sync pill, which owns the bottom-right corner. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-16 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-20"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const { icon: Icon, className } = VARIANT_STYLE[toast.variant];
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm",
                "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200",
                className,
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{toast.message}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs opacity-80">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * The toast API for the current tree.
 *
 * Throws when used outside the provider, which is a wiring mistake rather than
 * a runtime condition worth handling silently.
 */
export function useToast(): ToastApi {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }
  return context;
}
