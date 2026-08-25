import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive px-4 py-1.5 text-center text-sm text-destructive-foreground">
      <WifiOff className="mr-2 inline h-4 w-4" />
      You're offline — showing cached data
    </div>
  );
}
