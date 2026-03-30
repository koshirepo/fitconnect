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
  /** Output size in px (square). Default 400 */
  outputSize?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

export function PhotoCrop({ src, onConfirm, onCancel, outputSize = 400 }: PhotoCropProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  // Transform state
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = React.useState(false);

  // Drag state (not in React state for perf — use refs)
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

  // ─── Compute how the image fits the viewport ────────────────────────────
  const getLayout = React.useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img || !img.naturalWidth) return null;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const cropSize = Math.min(cw, ch) * 0.82; // circle diameter

    // Base scale: image covers the crop circle
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const baseScale = cropSize / Math.min(iw, ih);

    return { cw, ch, cropSize, iw, ih, baseScale };
  }, []);

  // ─── Clamp offset so the image always covers the crop circle ─────────────
  const clampOffset = React.useCallback(
    (ox: number, oy: number, z: number) => {
      const layout = getLayout();
      if (!layout) return { x: ox, y: oy };

      const { cropSize, iw, ih, baseScale } = layout;
      const s = baseScale * z;
      const dispW = iw * s;
      const dispH = ih * s;
      const r = cropSize / 2;

      // The image center is at (cw/2 + ox, ch/2 + oy)
      // We need the crop circle edges to stay within the image
      const maxOx = Math.max(0, dispW / 2 - r);
      const maxOy = Math.max(0, dispH / 2 - r);

      return {
        x: Math.max(-maxOx, Math.min(maxOx, ox)),
        y: Math.max(-maxOy, Math.min(maxOy, oy)),
      };
    },
    [getLayout],
  );

  // ─── Mouse / Touch handlers ─────────────────────────────────────────────
  const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch" && e.isPrimary === false) return; // handled by touch events for pinch
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

  // ─── Pinch-to-zoom (touch events — native listeners for passive: false) ──
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

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // ─── Scroll-to-zoom ────────────────────────────────────────────────────
  const handleWheel = React.useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => {
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta));
        setOffset((o) => clampOffset(o.x, o.y, next));
        return next;
      });
    },
    [clampOffset],
  );

  // ─── Zoom buttons ──────────────────────────────────────────────────────
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

  // ─── Render the cropped output ──────────────────────────────────────────
  const handleConfirm = React.useCallback(() => {
    const layout = getLayout();
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!layout || !img || !canvas) return;

    const { cw, ch, cropSize, iw, ih, baseScale } = layout;
    const s = baseScale * zoom;

    // Image top-left in container coordinates
    const imgLeft = (cw - iw * s) / 2 + offset.x;
    const imgTop = (ch - ih * s) / 2 + offset.y;

    // Crop circle bounds in container coordinates
    const cropLeft = (cw - cropSize) / 2;
    const cropTop = (ch - cropSize) / 2;

    // Map crop rectangle back to image natural coordinates
    const srcX = (cropLeft - imgLeft) / s;
    const srcY = (cropTop - imgTop) / s;
    const srcSize = cropSize / s;

    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, outputSize, outputSize);

    // Clip to circle
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outputSize, outputSize);

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.9,
    );
  }, [getLayout, zoom, offset, outputSize, onConfirm]);

  // ─── Layout state (recomputed when image loads or window resizes) ────────
  const [layout, setLayout] = React.useState<ReturnType<typeof getLayout>>(null);

  // ─── Load image ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = src;
  }, [src]);

  // Recompute layout when image loads or container resizes
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

      {/* Header */}
      <div className="flex items-center justify-between bg-zinc-900/90 px-4 py-2 text-sm font-medium text-white">
        <span>Zoom &amp; Crop</span>
        <span className="text-xs text-zinc-400">Pinch, scroll, or drag to adjust</span>
      </div>

      {/* Crop area */}
      <div
        ref={containerRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {/* The image */}
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

        {/* Dark overlay with circular cutout */}
        {layout && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <mask id="crop-mask">
                <rect width="100%" height="100%" fill="white" />
                <circle
                  cx={layout.cw / 2}
                  cy={layout.ch / 2}
                  r={layout.cropSize / 2}
                  fill="black"
                />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#crop-mask)" />
            <circle
              cx={layout.cw / 2}
              cy={layout.ch / 2}
              r={layout.cropSize / 2}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="2"
            />
          </svg>
        )}
      </div>

      {/* Zoom slider + controls */}
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
              const z = parseFloat(e.target.value);
              setZoom(z);
              setOffset((o) => clampOffset(o.x, o.y, z));
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

      {/* Bottom actions */}
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

        {/* Spacer to center the confirm button */}
        <div className="h-12 w-12" />
      </div>
    </div>
  );
}
