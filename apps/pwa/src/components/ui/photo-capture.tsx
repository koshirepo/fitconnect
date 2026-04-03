import * as React from "react";
import { Camera, Upload, X, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "@/lib/assets";
import { validateFace, detectFacesLive, type LiveFaceResult } from "@/lib/face-detection";
import { PhotoCrop } from "@/components/ui/photo-crop";

interface PhotoCaptureProps {
  value: string | null;
  onChange: (file: File | null, previewUrl: string | null) => void;
  /** Set to false to skip face validation (e.g. for logos) */
  requireFace?: boolean;
  cropAspectRatio?: number;
  cropShape?: "circle" | "rect";
  cropOutputWidth?: number;
  cropOutputHeight?: number;
  croppedFileName?: string;
  disabled?: boolean;
  className?: string;
}

export function PhotoCapture({
  value,
  onChange,
  requireFace = true,
  cropAspectRatio = 1,
  cropShape = "circle",
  cropOutputWidth,
  cropOutputHeight,
  croppedFileName = "avatar.jpg",
  disabled,
  className,
}: PhotoCaptureProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const rafRef = React.useRef<number>(0);
  const detectingRef = React.useRef(false);

  const [cameraActive, setCameraActive] = React.useState(false);
  const [cameraError, setCameraError] = React.useState("");
  const [facingMode, setFacingMode] = React.useState<"user" | "environment">("environment");
  const [validating, setValidating] = React.useState(false);
  const [faceError, setFaceError] = React.useState("");
  const [liveFace, setLiveFace] = React.useState<LiveFaceResult>({ count: 0, boxes: [] });

  // Crop step – holds raw image URL before cropping
  const [cropSrc, setCropSrc] = React.useState<string | null>(null);
  const resolvedValue = React.useMemo(() => resolveAssetUrl(value), [value]);

  // Cleanup camera on unmount
  React.useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setLiveFace({ count: 0, boxes: [] });
  };

  // ─── Real-time face detection loop ─────────────────────────────────────────
  const runFaceDetectionLoop = React.useCallback(() => {
    let lastDetectTime = 0;
    const DETECT_INTERVAL = 300; // ms between detections

    const loop = async (timestamp: number) => {
      if (!videoRef.current || !streamRef.current) return;

      if (timestamp - lastDetectTime >= DETECT_INTERVAL && !detectingRef.current) {
        detectingRef.current = true;
        lastDetectTime = timestamp;

        try {
          const result = await detectFacesLive(videoRef.current);
          setLiveFace(result);
          drawFaceOverlay(result);
        } catch {
          // ignore detection failures
        } finally {
          detectingRef.current = false;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const drawFaceOverlay = (result: LiveFaceResult) => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !overlay) return;

    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    // Match overlay canvas to the video's display size
    const rect = video.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (result.boxes.length === 0) return;

    // Compute scale between natural video and displayed size
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // object-cover: figure out the displayed region
    const displayAspect = rect.width / rect.height;
    const videoAspect = vw / vh;

    let scaleX: number, scaleY: number, offsetX: number, offsetY: number;

    if (videoAspect > displayAspect) {
      // Video is wider – cropped on sides
      scaleY = rect.height / vh;
      scaleX = scaleY;
      offsetX = (rect.width - vw * scaleX) / 2;
      offsetY = 0;
    } else {
      // Video is taller – cropped on top/bottom
      scaleX = rect.width / vw;
      scaleY = scaleX;
      offsetX = 0;
      offsetY = (rect.height - vh * scaleY) / 2;
    }

    const isGood = result.count === 1;

    for (const box of result.boxes) {
      const bx = box.x * scaleX + offsetX;
      const by = box.y * scaleY + offsetY;
      const bw = box.width * scaleX;
      const bh = box.height * scaleY;

      ctx.strokeStyle = isGood ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);

      // Rounded rectangle
      const radius = 12;
      ctx.beginPath();
      ctx.moveTo(bx + radius, by);
      ctx.lineTo(bx + bw - radius, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
      ctx.lineTo(bx + bw, by + bh - radius);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
      ctx.lineTo(bx + radius, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
      ctx.lineTo(bx, by + radius);
      ctx.quadraticCurveTo(bx, by, bx + radius, by);
      ctx.closePath();
      ctx.stroke();

      // Subtle fill
      ctx.fillStyle = isGood ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)";
      ctx.fill();
    }
  };

  const startCamera = async (facing: "user" | "environment" = facingMode) => {
    setCameraError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera is not supported in this browser. Try uploading a photo instead.");
      return;
    }

    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
      } catch (innerErr) {
        // If facingMode constraint fails, retry with just video: true
        if (innerErr instanceof OverconstrainedError || (innerErr instanceof DOMException && innerErr.name === "OverconstrainedError")) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw innerErr;
        }
      }

      streamRef.current = stream;
      setCameraActive(true);
      setFacingMode(facing);
      setLiveFace({ count: 0, boxes: [] });

      // Wait for ref to be available
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            if (requireFace) {
              runFaceDetectionLoop();
            }
          });
        }
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError") {
        setCameraError("Camera permission was denied. Please allow camera access in your browser settings.");
      } else if (name === "NotFoundError") {
        setCameraError("No camera found on this device. Try uploading a photo instead.");
      } else if (name === "NotReadableError") {
        setCameraError("Camera is in use by another application. Close it and try again.");
      } else {
        setCameraError("Camera is not available. Try uploading a photo instead.");
      }
      setCameraActive(false);
    }
  };

  // ─── Face Validation Helper ────────────────────────────────────────────────
  const acceptPhoto = React.useCallback(
    async (blob: Blob, fileName: string) => {
      setFaceError("");

      if (requireFace) {
        setValidating(true);
        try {
          const result = await validateFace(blob);
          if (result.error) {
            setValidating(false);
            setFaceError(result.error);
            return;
          }
        } catch {
          // If detection completely fails, allow the photo through
        }
        setValidating(false);
      }

      const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
      const previewUrl = URL.createObjectURL(blob);
      onChange(file, previewUrl);
    },
    [requireFace, onChange],
  );

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Capture full-resolution frame (not pre-cropped) so user can zoom/crop
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        stopCamera();
        if (blob) {
          const url = URL.createObjectURL(blob);
          setCropSrc(url);
        }
      },
      "image/jpeg",
      0.92,
    );
  };

  const switchCamera = () => {
    const newFacing = facingMode === "user" ? "environment" : "user";
    startCamera(newFacing);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type & size
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      return;
    }

    // Open crop editor instead of immediately accepting
    const url = URL.createObjectURL(file);
    setCropSrc(url);

    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const handleCropConfirm = React.useCallback(
    (blob: Blob) => {
      // Revoke the raw image URL
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      acceptPhoto(blob, croppedFileName);
    },
    [acceptPhoto, cropSrc, croppedFileName],
  );

  const handleCropCancel = React.useCallback(() => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }, [cropSrc]);

  const handleRemove = () => {
    setFaceError("");
    onChange(null, null);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />

      {/* ─── Fullscreen Camera Overlay ─────────────────────────────────────── */}
      {cameraActive && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          {/* Face status bar */}
          {requireFace && (
            <div
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors",
                liveFace.count === 1
                  ? "bg-green-600/90 text-white"
                  : liveFace.count === 0
                    ? "bg-zinc-800/90 text-zinc-300"
                    : "bg-red-600/90 text-white",
              )}
            >
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full",
                  liveFace.count === 1
                    ? "bg-green-300 animate-pulse"
                    : liveFace.count === 0
                      ? "bg-zinc-500"
                      : "bg-red-300 animate-pulse",
                )}
              />
              {liveFace.count === 0 && "Position your face in the frame"}
              {liveFace.count === 1 && "Face detected — ready to capture!"}
              {liveFace.count > 1 && `${liveFace.count} faces detected — only one allowed`}
            </div>
          )}

          {/* Video + overlay container */}
          <div className="relative flex-1 overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {/* Face detection bounding box overlay */}
            {requireFace && (
              <canvas
                ref={overlayCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
            )}

            {/* Subtle guide circle */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={cn(
                  "rounded-full border-2 border-dashed transition-colors duration-300",
                  "h-56 w-56 sm:h-64 sm:w-64 md:h-72 md:w-72",
                  liveFace.count === 1
                    ? "border-green-400/60"
                    : liveFace.count > 1
                      ? "border-red-400/60"
                      : "border-white/30",
                )}
              />
            </div>
          </div>

          {/* Bottom controls */}
          <div className="flex items-center justify-center gap-6 bg-black/90 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-12 w-12 rounded-full text-white hover:bg-white/20"
              onClick={switchCamera}
            >
              <RotateCcw className="h-5 w-5" />
            </Button>

            <button
              type="button"
              className={cn(
                "flex h-18 w-18 items-center justify-center rounded-full border-4 transition-colors",
                requireFace && liveFace.count === 1
                  ? "border-green-400 bg-white"
                  : "border-white/80 bg-white",
              )}
              onClick={capturePhoto}
            >
              <Camera className="h-7 w-7 text-black" />
            </button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-12 w-12 rounded-full text-white hover:bg-white/20"
              onClick={stopCamera}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Crop Editor Overlay ──────────────────────────────────────────── */}
      {cropSrc && (
        <PhotoCrop
          src={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          aspectRatio={cropAspectRatio}
          shape={cropShape}
          outputWidth={cropOutputWidth}
          outputHeight={cropOutputHeight}
        />
      )}

      {/* Validating face overlay */}
      {validating && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/50 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Detecting face…</p>
        </div>
      )}

      {/* Face validation error (no preview yet) */}
      {!validating && !value && faceError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
          <p className="text-sm font-medium text-destructive">{faceError}</p>
          <p className="mt-1 text-xs text-muted-foreground">Try again with a different photo.</p>
        </div>
      )}

      {/* Preview */}
      {!cameraActive && !validating && value && (
        <div className="relative mx-auto w-fit">
          <img
            src={resolvedValue ?? value}
            alt="Member photo"
            className="h-32 w-32 rounded-full border-2 border-border object-cover"
          />
          {!disabled && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Action buttons (hidden when camera is active or has preview) */}
      {!cameraActive && !validating && !value && (
        <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Add a member photo</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => startCamera()}
              disabled={disabled}
            >
              <Camera className="mr-2 h-4 w-4" />
              Take Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </div>
          {cameraError && (
            <div className="w-full rounded-md bg-destructive/10 px-3 py-2 text-center">
              <p className="text-xs text-destructive">{cameraError}</p>
            </div>
          )}
        </div>
      )}

      {/* Replace buttons when preview is shown */}
      {!cameraActive && !validating && value && (
        <div className="flex justify-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => startCamera()}
            disabled={disabled}
          >
            <Camera className="mr-2 h-4 w-4" />
            Retake
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Upload className="mr-2 h-4 w-4" />
            Change
          </Button>
        </div>
      )}
    </div>
  );
}
