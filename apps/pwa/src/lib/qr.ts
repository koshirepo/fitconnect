/**
 * Documentation: QR codes drawn in the browser.
 *
 * - Replaces `api.qrserver.com`, which every QR on this app used to call. That handed a third party the exact string being encoded — and for a member's ID card that string is the card token, which is the credential. Encoding here keeps it on the device.
 * - Returns SVG path data in module coordinates rather than an image, so a caller can scale it, colour it, and — the reason this exists — inline it in the ID card's own SVG. An `<img>` from another origin taints the canvas the card is exported through, which is why the code could never be part of the downloaded card before.
 * - Error correction defaults to M, the level that survives a phone camera at an angle without inflating the module count enough to matter at card size.
 * - Primary exports: qrPath.
 */
import qrcode from "qrcode-generator";

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export type QrPath = {
  /** SVG path data, one unit per module, origin at the code's top-left. */
  path: string;
  /** Modules per side, so the caller can set a viewBox or scale factor. */
  count: number;
};

/**
 * Encode `data` and return it as one SVG path.
 *
 * Type 0 asks the library to pick the smallest QR version that fits, so a
 * short token does not get padded out into a denser code than it needs.
 *
 * Every dark module becomes a 1×1 square in a single path rather than its own
 * `<rect>`: a 37-module code is ~500 dark modules, and 500 elements in a
 * document that gets serialised, re-parsed as an image, and drawn to a canvas
 * is a cost paid three times for no gain.
 */
export function qrPath(data: string, errorCorrection: QrErrorCorrection = "M"): QrPath {
  const qr = qrcode(0, errorCorrection);
  qr.addData(data);
  qr.make();

  const count = qr.getModuleCount();
  const parts: string[] = [];

  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      if (qr.isDark(row, column)) {
        parts.push(`M${column} ${row}h1v1h-1z`);
      }
    }
  }

  return { path: parts.join(""), count };
}
