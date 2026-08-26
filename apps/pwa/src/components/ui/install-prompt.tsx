import * as React from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import {
  clearDeferredInstallPrompt,
  getDeferredInstallPrompt,
  INSTALL_PROMPT_AVAILABLE,
  type BeforeInstallPromptEvent,
} from "@/lib/install-prompt-event";
import { readCachedTenantBranding } from "@/lib/tenant-branding";
import { isTenantSubdomain } from "@/lib/subdomain";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    // Don't show if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Don't show if user previously dismissed (24hr cooldown)
    const lastDismissed = localStorage.getItem("pwa-install-dismissed");
    if (lastDismissed && Date.now() - Number(lastDismissed) < 24 * 60 * 60 * 1000) return;

    // The event may already have fired — `main.tsx` starts listening before the
    // first render precisely because it usually has.
    const held = getDeferredInstallPrompt();
    if (held) {
      setDeferredPrompt(held);
      return;
    }

    const handler = () => setDeferredPrompt(getDeferredInstallPrompt());
    window.addEventListener(INSTALL_PROMPT_AVAILABLE, handler);
    return () => window.removeEventListener(INSTALL_PROMPT_AVAILABLE, handler);
  }, []);

  // On a gym subdomain the app being installed is that gym, not the platform.
  const gymName = isTenantSubdomain() ? readCachedTenantBranding()?.name : null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      clearDeferredInstallPrompt();
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
    setDeferredPrompt(null);
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-99 mx-auto max-w-md rounded-lg border bg-card p-4 shadow-lg">
      <div className="flex items-center gap-3">
        <Download className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Install {gymName ?? "FitConnect"}</p>
          <p className="text-xs text-muted-foreground">
            Add to home screen for the best experience.
          </p>
        </div>
        <Button size="sm" onClick={handleInstall}>
          Install
        </Button>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
