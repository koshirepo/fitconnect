/**
 * Documentation: The desk reading member cards.
 *
 * - The other half of the QR story. The gym already posts a code members scan with their own phone; this is one phone at the counter reading the card each member already carries — quicker at a queue, and it works for members who never installed the app.
 * - Every scan is answered on screen with a face and a name, because the person doing the scanning is looking at a queue rather than at the phone. A lapsed membership is said out loud rather than silently accepted, since that is the moment the desk can do something about it.
 * - Renders an explanation instead of a camera where `BarcodeDetector` is missing, which today means Safari and Firefox. There is no polyfill worth the weight; the member picker beside it still works.
 * - Primary exports: ScanCheckIn.
 */
import * as React from "react";
import { Camera, CameraOff, CheckCircle2, ScanLine, X } from "lucide-react";

import { useBarcodeScanner, isBarcodeScanningSupported } from "@/lib/use-barcode-scanner";
import { useScanCheckIn } from "@/api/queries/attendance";
import { getApiError } from "@/api/client";
import { haptics } from "@/lib/haptics";
import { useWakeLock } from "@/lib/use-wake-lock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Outcome = {
  name: string;
  memberId: number;
  avatarUrl: string | null;
  suspended: boolean;
  at: number;
};

export function ScanCheckIn() {
  const [supported] = React.useState(isBarcodeScanningSupported);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);

  const checkIn = useScanCheckIn();

  const handleScan = React.useCallback(
    async (code: string) => {
      setFailure(null);
      try {
        const result = await checkIn.mutateAsync(code);
        haptics.member();
        setOutcome({
          name: result.member.name,
          memberId: result.member.memberId,
          avatarUrl: result.member.avatarUrl,
          suspended: result.member.status !== "ACTIVE",
          at: Date.now(),
        });
      } catch (error) {
        haptics.failure();
        setFailure(getApiError(error));
      }
    },
    [checkIn],
  );

  const {
    videoRef,
    scanning,
    error: cameraError,
    start,
    stop,
  } = useBarcodeScanner(handleScan);

  // A phone propped at the desk is not being touched between members.
  useWakeLock(scanning);

  if (!supported) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CameraOff className="h-5 w-5" />
            Scanning needs a different browser
          </CardTitle>
          <CardDescription>
            This one cannot read QR codes. Chrome on Android can — or mark members
            present from the list below.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanLine className="h-5 w-5" />
          Scan member cards
        </CardTitle>
        <CardDescription>
          Point the camera at the QR on a member&apos;s ID card to check them in.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div
          className={cn(
            "relative overflow-hidden rounded-lg bg-muted",
            scanning ? "aspect-video" : "hidden",
          )}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {/* A frame to aim with. Nothing reads the code but the detector; this
              is only so somebody knows where to hold the card. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-lg border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        </div>

        {outcome && (
          <div
            key={outcome.at}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3",
              outcome.suspended
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-emerald-500/40 bg-emerald-500/10",
            )}
          >
            <span className="grid h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
              {outcome.avatarUrl ? (
                <img src={outcome.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <CheckCircle2 className="m-auto h-5 w-5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">
                #{outcome.memberId} {outcome.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {outcome.suspended ? "Checked in — membership is inactive" : "Checked in"}
              </p>
            </div>
            {outcome.suspended && (
              <Badge variant="warning" className="ml-auto shrink-0">
                Inactive
              </Badge>
            )}
          </div>
        )}

        {failure && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <X className="mt-0.5 h-4 w-4 shrink-0" />
            {failure}
          </div>
        )}

        {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}

        <div className="flex gap-2">
          {scanning ? (
            <Button variant="outline" onClick={stop}>
              <CameraOff className="h-4 w-4" />
              Stop scanning
            </Button>
          ) : (
            <Button onClick={start}>
              <Camera className="h-4 w-4" />
              Start scanning
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
