import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function UpdatePrompt() {
  const [show, setShow] = React.useState(false);
  const updateRef = React.useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      updateRef.current = detail.updateSW;
      setShow(true);
    };
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-lg border bg-card p-4 shadow-lg">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-5 w-5 text-primary animate-spin" />
        <div className="flex-1">
          <p className="text-sm font-medium">Update available</p>
          <p className="text-xs text-muted-foreground">A new version of GymPro is ready.</p>
        </div>
        <Button size="sm" onClick={() => updateRef.current?.(true)}>
          Update
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShow(false)}>
          Later
        </Button>
      </div>
    </div>
  );
}
