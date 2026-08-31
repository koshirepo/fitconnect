/**
 * Documentation: A QR code rendered on the device.
 *
 * - Draws the code as one SVG path from `lib/qr`, so nothing about it leaves the browser. Every QR in this app used to be an `<img>` pointing at `api.qrserver.com`, which handed a third party the exact string being encoded — a gym's check-in address, or a member's card token.
 * - Always paints its own white ground and quiet zone. A QR on a transparent background is unreadable in dark mode, and one flush against its container is unreadable to some scanners regardless of theme.
 * - Sized by the `size` prop in CSS pixels; the code itself is vector, so it stays sharp at any of them.
 * - Primary exports: QrCode.
 */
import * as React from "react";
import { qrPath } from "@/lib/qr";
import { cn } from "@/lib/utils";

export type QrCodeProps = {
  /** The string to encode — usually a url. */
  value: string;
  /** Rendered size in CSS pixels, including the quiet zone. */
  size?: number;
  /** Describes where the code leads, for anyone not reading it with a camera. */
  label?: string;
  className?: string;
};

/** Modules of clear space around the code. Four is the spec's minimum. */
const QUIET_ZONE = 4;

export function QrCode({ value, size = 200, label, className }: QrCodeProps) {
  const { path, count } = React.useMemo(() => qrPath(value), [value]);

  const extent = count + QUIET_ZONE * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label ?? "QR code"}
      className={cn("rounded-lg", className)}
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <g transform={`translate(${QUIET_ZONE} ${QUIET_ZONE})`}>
        {/* crispEdges keeps module boundaries on whole pixels; antialiased
            edges are what makes a small on-screen code fail to scan. */}
        <path d={path} fill="#0f172a" shapeRendering="crispEdges" />
      </g>
    </svg>
  );
}
