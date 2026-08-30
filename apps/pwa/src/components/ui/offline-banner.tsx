/**
 * Documentation: The strip that says why the app is behaving differently.
 *
 * - Two states, and offline wins when both are true. Being disconnected explains everything; a note about connection quality underneath it would only compete.
 * - The slow-connection strip exists because the app quietly changes what it fetches on a bad link — the roster and the ledger stop being downloaded whole — and a list that is shorter than usual with no explanation reads as missing data rather than as a decision.
 * - Primary exports: OfflineBanner.
 */
import { Gauge, WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/lib/use-online-status";
import { useNetworkQuality } from "@/lib/network-status";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { isSlow, saveData } = useNetworkQuality();

  if (!isOnline) {
    return (
      <div className="fixed top-0 right-0 left-0 z-[100] bg-destructive px-4 py-1.5 text-center text-sm text-destructive-foreground">
        <WifiOff className="mr-2 inline h-4 w-4" />
        You're offline — showing cached data
      </div>
    );
  }

  if (isSlow) {
    return (
      <div className="fixed top-0 right-0 left-0 z-[100] bg-amber-500/90 px-4 py-1.5 text-center text-sm text-amber-950">
        <Gauge className="mr-2 inline h-4 w-4" />
        {saveData
          ? "Data Saver is on — loading less at a time"
          : "Slow connection — loading less at a time"}
      </div>
    );
  }

  return null;
}
