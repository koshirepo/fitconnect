/**
 * Documentation: Reading a QR code from the camera.
 *
 * - Built on the native `BarcodeDetector`, which is doing the work a dedicated scanner would: a phone at the desk becomes the reader, and the gym buys nothing. Chromium on Android has it; Safari and Firefox do not, and the hook says so rather than failing halfway through opening a camera.
 * - The camera stream and the detection loop are one lifecycle. Everything is torn down on unmount, because a page that leaves the camera running is a page with a light on in an empty room.
 * - The same code is rejected for a few seconds after it is read. A camera pointed at one card produces the same result thirty times a second, and every one of them would otherwise be a check-in.
 * - Primary exports: useBarcodeScanner, isBarcodeScanningSupported.
 */
import * as React from "react";

type DetectedBarcode = { rawValue: string };

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

type WindowWithDetector = Window & { BarcodeDetector?: BarcodeDetectorConstructor };

/** How long the same code is ignored after being read. */
const REPEAT_COOLDOWN_MS = 4000;

/** Roughly ten looks a second: fast enough to feel instant, cheap enough to hold. */
const SCAN_INTERVAL_MS = 100;

export function isBarcodeScanningSupported() {
  return (
    typeof window !== "undefined" &&
    typeof (window as WindowWithDetector).BarcodeDetector !== "undefined"
  );
}

export type ScannerState = {
  /** Attach to a `<video>`; the stream is bound to it while scanning. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scanning: boolean;
  /** Why it is not running, in words worth showing somebody. */
  error: string | null;
  start: () => void;
  stop: () => void;
};

export function useBarcodeScanner(onScan: (value: string) => void): ScannerState {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Held in refs so the loop below never restarts on a re-render mid-scan.
  const onScanRef = React.useRef(onScan);
  const lastSeen = React.useRef<{ value: string; at: number } | null>(null);

  React.useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const start = React.useCallback(() => {
    if (!isBarcodeScanningSupported()) {
      setError("This browser cannot read QR codes. Chrome on Android can.");
      return;
    }
    setError(null);
    setScanning(true);
  }, []);

  const stop = React.useCallback(() => setScanning(false), []);

  React.useEffect(() => {
    if (!scanning) return;

    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;
    // Held so the cleanup can detach from the element it actually attached
      // to, rather than whatever the ref points at by then.
    let attached: HTMLVideoElement | null = null;

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The back camera: somebody is pointing the phone at a card held by
          // the person opposite them, not at themselves.
          video: { facingMode: "environment" },
        });
      } catch {
        if (!cancelled) {
          setError("The camera could not be opened. Check the permission and try again.");
          setScanning(false);
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      attached = video;
      video.srcObject = stream;
      await video.play().catch(() => {
        // Autoplay refused. The stream is still attached; a tap on the video
        // starts it, and the loop below simply reads nothing until it does.
      });

      const Detector = (window as WindowWithDetector).BarcodeDetector!;
      const detector = new Detector({ formats: ["qr_code"] });

      const tick = async () => {
        if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;

        try {
          const found = await detector.detect(videoRef.current);
          const value = found[0]?.rawValue?.trim();
          if (!value) return;

          const now = Date.now();
          const previous = lastSeen.current;
          // One card held in front of a camera is read continuously. Without
          // this every frame would be a separate check-in.
          if (previous?.value === value && now - previous.at < REPEAT_COOLDOWN_MS) return;

          lastSeen.current = { value, at: now };
          onScanRef.current(value);
        } catch {
          // A frame that cannot be decoded is the normal case, not an error:
          // most frames have no code in them at all.
        }
      };

      timer = window.setInterval(() => void tick(), SCAN_INTERVAL_MS);
    };

    void run();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (attached) attached.srcObject = null;
    };
  }, [scanning]);

  return { videoRef, scanning, error, start, stop };
}
