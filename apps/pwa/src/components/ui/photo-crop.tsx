import * as React from "react";
import { Check, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PhotoCropProps {
  /** The image source URL (object URL or data URL) to crop */
  src: string;
  /** Called with the cropped blob when the user confirms */
  onConfirm: (blob: Blob) => void;
  /** Called when the user cancels cropping */
  onCancel: () => void;
  /** Crop area width / height ratio. Defaults to 1 */
  aspectRatio?: number;
  /** Crop output shape. Defaults to circle for avatar flows */
  shape?: "circle" | "rect";
  /** Output width in px. Height is derived when omitted. */
  outputWidth?: number;
  /** Output height in px. Defaults to width / aspect ratio. */
  outputHeight?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
const DEFAULT_OUTPUT_WIDTH = 400;
const CROP_FRAME_SCALE = 0.82;
const RECT_RADIUS = 24;

export function PhotoCrop({
  src,
  onConfirm,
  onCancel,
  aspectRatio = 1,
  shape = "circle",
  outputWidth,
  outputHeight,
}: PhotoCropProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const safeAspectRatio = aspectRatio > 0 ? aspectRatio : 1;
  const targetWidth = outputWidth ?? DEFAULT_OUTPUT_WIDTH;
  const targetHeight = outputHeight ?? Math.round(targetWidth / safeAspectRatio);

  // Transform state
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = React.useState(false);

  // Drag state (not in React state for perf - use refs)
  const dragging = React.useRef(false);
  const lastPos = React.useRef({ x: 0, y: 0 });
  // Pinch state
  const lastPinchDist = React.useRef(0);
  const zoomRef = React.useRef(zoom);
  const offsetRef = React.useRef(offset);

  // Keep refs in sync
  React.useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  React.useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  // Compute how the image fits the viewport
  const getLayout = React.useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth) return null;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const maxCropWidth = cw * CROP_FRAME_SCALE;
    const maxCropHeight = ch * CROP_FRAME_SCALE;

    let cropWidth = Math.min(maxCropWidth, maxCropHeight * safeAspectRatio);
    let cropHeight = cropWidth / safeAspectRatio;

    if (cropHeight > maxCropHeight) {
      cropHeight = maxCropHeight;
      cropWidth = cropHeight * safeAspectRatio;
    }

    // Base scale: image covers the crop frame
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const baseScale = Math.max(cropWidth / iw, cropHeight / ih);

    return { cw, ch, cropWidth, cropHeight, iw, ih, baseScale };
  }, [safeAspectRatio]);

  // Clamp offset so the image always covers the crop frame
  const clampOffset = React.useCallback(
    (ox: number, oy: number, z: number) => {
      const layout = getLayout();
      if (!layout) return { x: ox, y: oy };

      const { cropWidth, cropHeight, iw, ih, baseScale } = layout;
      const s = baseScale * z;
      const dispW = iw * s;
      const dispH = ih * s;
      const halfCropWidth = cropWidth / 2;
      const halfCropHeight = cropHeight / 2;

      const maxOx = Math.max(0, dispW / 2 - halfCropWidth);
      const maxOy = Math.max(0, dispH / 2 - halfCropHeight);

      return {
        x: Math.max(-maxOx, Math.min(maxOx, ox)),
        y: Math.max(-maxOy, Math.min(maxOy, oy)),
      };
    },
    [getLayout],
  );

  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch" && e.isPrimary === false) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };

      setOffset((prev) => clampOffset(prev.x + dx, prev.y + dy, zoomRef.current));
    },
    [clampOffset],
  );

  const handlePointerUp = React.useCallback(() => {
    dragging.current = false;
  }, []);

  const clampOffsetRef = React.useRef(clampOffset);
  React.useEffect(() => {
    clampOffsetRef.current = clampOffset;
  }, [clampOffset]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);

        if (lastPinchDist.current > 0) {
          const scale = dist / lastPinchDist.current;
          setZoom((prev) => {
            const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * scale));
            setOffset((o) => clampOffsetRef.current(o.x, o.y, next));
            return next;
          });
        }
        lastPinchDist.current = dist;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastPinchDist.current = 0;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
        setOffset((o) => clampOffsetRef.current(o.x, o.y, next));
        return next;
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const adjustZoom = React.useCallback(
    (delta: number) => {
      setZoom((prev) => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
        setOffset((o) => clampOffset(o.x, o.y, next));
        return next;
      });
    },
    [clampOffset],
  );

  const resetTransform = React.useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleConfirm = React.useCallback(() => {
    const layout = getLayout();
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!layout || !img || !canvas) return;

    const { cw, ch, cropWidth, cropHeight, iw, ih, baseScale } = layout;
    const s = baseScale * zoom;

    // Image top-left in container coordinates
    const imgLeft = (cw - iw * s) / 2 + offset.x;
    const imgTop = (ch - ih * s) / 2 + offset.y;

    // Crop frame bounds in container coordinates
    const cropLeft = (cw - cropWidth) / 2;
    const cropTop = (ch - cropHeight) / 2;

    // Map crop rectangle back to image natural coordinates
    const srcX = (cropLeft - imgLeft) / s;
    const srcY = (cropTop - imgTop) / s;
    const srcWidth = cropWidth / s;
    const srcHeight = cropHeight / s;

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, targetWidth, targetHeight);

    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(targetWidth / 2, targetHeight / 2, Math.min(targetWidth, targetHeight) / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }

    ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.9,
    );
  }, [getLayout, offset, onConfirm, shape, targetHeight, targetWidth, zoom]);

  const [layout, setLayout] = React.useState<ReturnType<typeof getLayout>>(null);

  React.useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = src;
  }, [src]);

  React.useEffect(() => {
    if (!imgLoaded) return;
    const update = () => setLayout(getLayout());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [imgLoaded, getLayout]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-center justify-between bg-zinc-900/90 px-4 py-2 text-sm font-medium text-white">
        <span>Zoom &amp; Crop</span>
        <span className="text-xs text-zinc-400">Pinch, scroll, or drag to adjust</span>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {imgLoaded && layout && (
          <img
            src={src}
            alt="Crop preview"
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: layout.iw * layout.baseScale * zoom,
              height: layout.ih * layout.baseScale * zoom,
              left: `calc(50% - ${(layout.iw * layout.baseScale * zoom) / 2 - offset.x}px)`,
              top: `calc(50% - ${(layout.ih * layout.baseScale * zoom) / 2 - offset.y}px)`,
            }}
          />
        )}

        {layout && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <mask id="crop-mask">
                <rect width="100%" height="100%" fill="white" />
                {shape === "circle" ? (
                  <circle
                    cx={layout.cw / 2}
                    cy={layout.ch / 2}
                    r={Math.min(layout.cropWidth, layout.cropHeight) / 2}
                    fill="black"
                  />
                ) : (
                  <rect
                    x={(layout.cw - layout.cropWidth) / 2}
                    y={(layout.ch - layout.cropHeight) / 2}
                    width={layout.cropWidth}
                    height={layout.cropHeight}
                    rx={RECT_RADIUS}
                    ry={RECT_RADIUS}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#crop-mask)" />
            {shape === "circle" ? (
              <circle
                cx={layout.cw / 2}
                cy={layout.ch / 2}
                r={Math.min(layout.cropWidth, layout.cropHeight) / 2}
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
              />
            ) : (
              <rect
                x={(layout.cw - layout.cropWidth) / 2}
                y={(layout.ch - layout.cropHeight) / 2}
                width={layout.cropWidth}
                height={layout.cropHeight}
                rx={RECT_RADIUS}
                ry={RECT_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="2"
              />
            )}
          </svg>
        )}
      </div>

      <div className="flex flex-col gap-3 bg-zinc-900/90 px-4 pt-3">
        <div className="flex items-center justify-center gap-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-full text-white hover:bg-white/20"
            onClick={() => adjustZoom(-0.25)}
            disabled={zoom <= MIN_ZOOM}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(e) => {
              const nextZoom = parseFloat(e.target.value);
              setZoom(nextZoom);
              setOffset((o) => clampOffset(o.x, o.y, nextZoom));
            }}
            className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-zinc-600 accent-white sm:w-56"
          />

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-full text-white hover:bg-white/20"
            onClick={() => adjustZoom(0.25)}
            disabled={zoom >= MAX_ZOOM}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-full text-white hover:bg-white/20"
            onClick={resetTransform}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <span className="text-center text-xs text-zinc-400">{Math.round(zoom * 100)}%</span>
      </div>

      <div className="flex items-center justify-center gap-6 bg-zinc-900/90 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-12 w-12 rounded-full text-white hover:bg-white/20"
          onClick={onCancel}
        >
          <X className="h-6 w-6" />
        </Button>

        <button
          type="button"
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full border-4 border-green-400 bg-green-500 text-white transition-colors hover:bg-green-600",
          )}
          onClick={handleConfirm}
        >
          <Check className="h-7 w-7" />
        </button>

        <div className="h-12 w-12" />
      </div>
    </div>
  );
}
