import * as React from "react";
import { CloudOff, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import {
  getPendingCount,
  getConflictCount,
  flushPendingMutations,
  type SyncResult,
} from "@/lib/sync-engine";

type SyncState = "idle" | "syncing" | "synced" | "has-pending" | "has-conflicts";

/**
 * Floating pill that shows sync status:
 * - Hidden when idle & online with nothing pending.
 * - Shows pending count when mutations are queued.
 * - Shows success flash after a successful sync.
 * - Shows conflict warning when mutations failed with 409.
 */
export function SyncStatus() {
  const isOnline = useOnlineStatus();
  const [state, setState] = React.useState<SyncState>("idle");
  const [pending, setPending] = React.useState(0);
  const [conflicts, setConflicts] = React.useState(0);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  // Poll pending count every 2s (cheap IDB read)
  React.useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const [p, c] = await Promise.all([getPendingCount(), getConflictCount()]);
        if (!active) return;
        setPending(p);
        setConflicts(c);
        if (c > 0) setState("has-conflicts");
        else if (p > 0) setState("has-pending");
        else if (stateRef.current !== "synced") setState("idle");
      } catch {
        // IDB read failure — ignore
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []); // No deps — poll runs for the component's lifetime

  // Listen for sync-complete and mutation-queued events
  React.useEffect(() => {
    const onSyncComplete = (e: Event) => {
      const detail = (e as CustomEvent<SyncResult>).detail;
      if (detail.conflicts > 0) {
        setState("has-conflicts");
      } else if (detail.synced > 0) {
        setState("synced");
        setTimeout(() => setState("idle"), 3000);
      }
    };
    const onMutationQueued = () => {
      setState("has-pending");
    };
    window.addEventListener("sync-complete", onSyncComplete);
    window.addEventListener("mutation-queued", onMutationQueued);
    return () => {
      window.removeEventListener("sync-complete", onSyncComplete);
      window.removeEventListener("mutation-queued", onMutationQueued);
    };
  }, []);

  const handleRetry = () => {
    if (stateRef.current === "syncing") return; // Prevent double-click
    setState("syncing");
    flushPendingMutations()
      .catch(() => {})
      .finally(() => {
        // Only reset if we're still in syncing state (sync-complete event may have already updated)
        if (stateRef.current === "syncing") setState("idle");
      });
  };

  // Nothing to show
  if (state === "idle" && pending === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-2">
      {state === "synced" && (
        <span className="flex items-center gap-1.5 bg-emerald-500/90 text-white rounded-full px-3 py-1.5">
          <Check className="h-3.5 w-3.5" />
          Synced
        </span>
      )}
      {state === "has-pending" && (
        <button
          onClick={handleRetry}
          className="flex items-center gap-1.5 bg-amber-500/90 text-white rounded-full px-3 py-1.5 hover:bg-amber-600 transition-colors"
        >
          {isOnline ? <RefreshCw className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
          {pending} pending change{pending !== 1 ? "s" : ""}
        </button>
      )}
      {state === "has-conflicts" && (
        <span className="flex items-center gap-1.5 bg-destructive text-destructive-foreground rounded-full px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {conflicts} conflict{conflicts !== 1 ? "s" : ""}
        </span>
      )}
      {state === "syncing" && (
        <span className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-full px-3 py-1.5">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Syncing…
        </span>
      )}
    </div>
  );
}
