/**
 * Documentation: A member's ID card.
 *
 * - Opens from the link sent by email or WhatsApp, on the gym's own subdomain, with no sign-in. The token in the URL is the credential.
 * - Re-fetched on every visit and never cached. A member who changed their photo, renewed, or lapsed sees that here immediately — the link is permanent, its contents are not.
 * - The card is authored as an SVG with the photo, the logo, and the QR all inlined. That is what makes the PNG download work with no library: an SVG whose every asset is embedded can be drawn to a canvas and exported, where one referencing an external image would taint the canvas and fail.
 * - Colour is derived from the gym's own, not picked per element: one brand hex becomes a gradient, a deep shade, and two tints by rotating hue and lightness, so a card is colourful in the gym's colours rather than in this file's. A gym that has chosen nothing gets the app's orange rather than grey.
 * - Primary exports: IdCardPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "@/api/public";
import { getApiError } from "@/api/client";
import { resolveAssetUrl } from "@/lib/assets";
import { qrPath } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { AlertCircle, Download, RefreshCw } from "lucide-react";
import type { MemberIdCard } from "@/types/api";

/** Card geometry, in the proportions of a printed membership card. */
const CARD_WIDTH = 640;
const CARD_HEIGHT = 1010;
/** Exported at 2× so the PNG stays sharp when printed or zoomed. */
const EXPORT_SCALE = 2;

/**
 * The card's colour when a gym has not chosen one.
 *
 * This is the app's own `--primary`, converted from the oklch the stylesheet
 * declares it in. A card is a printed thing that leaves the app, so it takes
 * the light-mode value rather than whichever theme the member happened to be
 * looking at when they opened the link.
 */
const DEFAULT_BRAND = "#ca3500";

const INK = "#0f172a";
const MUTED = "#94a3b8";
const SUBTLE = "#64748b";

const FONT = "Inter, system-ui, -apple-system, Segoe UI, sans-serif";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** SVG has no HTML escaping; a member named `A & B` would break the document. */
function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Trim to fit the card rather than letting a long name run off the edge. */
function fit(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// ─── Colour ──────────────────────────────────────────────────────────────────

/**
 * A gym's colour, or the app's.
 *
 * The value is a gym's own text going straight into an SVG attribute, so only
 * a literal hex colour is let through — `red; }` and friends never reach the
 * document. Three-digit hex is expanded so everything below has six digits to
 * work with.
 */
function safeColor(value: string | null | undefined, fallback = DEFAULT_BRAND) {
  const candidate = (value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(candidate)) {
    const [, r, g, b] = candidate.toLowerCase().match(/^#(.)(.)(.)$/)!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function channels(hex: string) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ] as const;
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
    .join("")}`;
}

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  const [r, g, b] = channels(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  h = (h * 60 + 360) % 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s, l };
}

function hslToHex({ h, s, l }: Hsl) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60 ? [c, x, 0]
      : h < 120 ? [x, c, 0]
        : h < 180 ? [0, c, x]
          : h < 240 ? [0, x, c]
            : h < 300 ? [x, 0, c]
              : [c, 0, x];

  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * A whole palette from one colour.
 *
 * Every shade is a rotation and a lightness step away from the gym's own hue,
 * rather than a fixed second colour. That is what keeps the card colourful for
 * a gym that picked crimson and for one that picked teal, without either
 * looking like it borrowed the other's design.
 *
 * A near-grey brand (a gym that chose charcoal) would rotate into more grey, so
 * saturation is floored before deriving — the gradient stays visible instead of
 * collapsing into a flat band.
 */
function palette(brandHex: string) {
  const base = hexToHsl(brandHex);
  const s = Math.max(base.s, 0.35);

  return {
    brand: brandHex,
    /** Warmer and lighter — the far end of the header gradient. */
    lift: hslToHex({ h: (base.h + 22) % 360, s: clamp01(s * 1.02), l: clamp01(base.l + 0.14) }),
    /** Deeper and cooler — grounds the footer and the band under the header. */
    deep: hslToHex({ h: (base.h - 14 + 360) % 360, s: clamp01(s * 1.05), l: clamp01(base.l - 0.13) }),
    /** Barely-there wash for the panels, so the body is not plain white. */
    tint: hslToHex({ h: base.h, s: clamp01(s * 0.55), l: 0.965 }),
    /** A visible tint for the detail strip's own hairlines. */
    tintEdge: hslToHex({ h: base.h, s: clamp01(s * 0.5), l: 0.9 }),
  };
}

/**
 * Text that stays readable on a given background.
 *
 * A gym is free to pick a pale yellow, and white-on-pale-yellow is a card
 * nobody can read. Relative luminance decides it rather than a guess.
 */
function readableOn(hex: string) {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.45 ? INK : "#ffffff";
}

// ─── Card ────────────────────────────────────────────────────────────────────

function label(x: number, y: number, text: string) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="15" font-weight="600" letter-spacing="1.4" fill="${SUBTLE}">${escapeXml(text)}</text>`;
}

function value(x: number, y: number, text: string) {
  return `<text x="${x}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="19" font-weight="700" fill="${INK}">${escapeXml(text)}</text>`;
}

function buildCardSvg(card: MemberIdCard, photo: string | null, logo: string | null, qrData: string) {
  const { member, gym } = card;

  const brand = safeColor(gym.brandColor);
  const c = palette(brand);
  const onBrand = readableOn(brand);
  const onDeep = readableOn(c.deep);

  const active = member.status === "ACTIVE";
  const statusInk = active ? "#047857" : "#b45309";
  const statusFill = active ? "#ecfdf5" : "#fffbeb";

  const initials = member.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  // Geometry. Named rather than inlined because the photo, its ring, and its
  // clip path have to agree, and three loose numbers drift apart.
  const PHOTO = { x: 44, y: 236, size: 196 };
  const RIGHT = PHOTO.x + PHOTO.size + 32;
  const HEADER_H = 196;
  const FOOTER_H = 122;
  const FOOTER_Y = CARD_HEIGHT - FOOTER_H;

  const photoBlock = photo
    ? `<image href="${photo}" x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.size}" height="${PHOTO.size}"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />`
    : `<rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.size}" height="${PHOTO.size}" rx="18" fill="${c.tint}" />
       <text x="${PHOTO.x + PHOTO.size / 2}" y="${PHOTO.y + PHOTO.size / 2 + 26}" text-anchor="middle"
             font-family="${FONT}" font-size="72" font-weight="700" fill="${brand}" opacity="0.55">${escapeXml(initials)}</text>`;

  const logoBlock = logo
    ? `<rect x="36" y="46" width="92" height="92" rx="22" fill="#ffffff" opacity="0.92" />
       <image href="${logo}" x="42" y="52" width="80" height="80"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : "";
  const headerTextX = logo ? 148 : 40;

  const shiftLine = member.shift
    ? `${member.shift.name} · ${member.shift.startTime}–${member.shift.endTime}`
    : "Any shift";

  // The QR, inlined. This is the whole reason the code can be part of the
  // downloaded card: an <img> from another origin taints the export canvas.
  const qr = qrPath(qrData);
  const QR = { x: 74, y: 676, size: 152 };
  const qrScale = QR.size / qr.count;

  // The gym's address on the web, which is how a card earns its place in a
  // wallet: it is the one surface a member already carries that can point them
  // back at the gym.
  const webAddress = `${gym.slug}.fitconnect.co.in`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <clipPath id="photoClip"><rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.size}" height="${PHOTO.size}" rx="18" /></clipPath>
    <clipPath id="logoClip"><rect x="42" y="52" width="80" height="80" rx="18" /></clipPath>
    <clipPath id="cardClip"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="28" /></clipPath>

    <linearGradient id="headerFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.deep}" />
      <stop offset="55%" stop-color="${c.brand}" />
      <stop offset="100%" stop-color="${c.lift}" />
    </linearGradient>
    <linearGradient id="footerFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${c.brand}" />
      <stop offset="100%" stop-color="${c.deep}" />
    </linearGradient>
    <linearGradient id="ruleFill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${c.lift}" />
      <stop offset="50%" stop-color="${c.brand}" />
      <stop offset="100%" stop-color="${c.deep}" />
    </linearGradient>
    <linearGradient id="ringFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.lift}" />
      <stop offset="100%" stop-color="${c.deep}" />
    </linearGradient>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="28" fill="#ffffff" />

  <g clip-path="url(#cardClip)">
    <!-- Header, in the gym's colours -->
    <rect width="${CARD_WIDTH}" height="${HEADER_H}" fill="url(#headerFill)" />
    <!-- Two washes of light, so the band reads as a printed surface rather
         than a flat fill. Kept far right and very low contrast: the gym's name
         is set over this and has to stay first. -->
    <circle cx="588" cy="26" r="128" fill="#ffffff" opacity="0.10" />
    <circle cx="512" cy="196" r="86" fill="#ffffff" opacity="0.07" />

    ${logoBlock}
    <text x="${headerTextX}" y="92" font-family="${FONT}" font-size="31" font-weight="700" fill="${onBrand}">${escapeXml(fit(gym.name, 20))}</text>
    <text x="${headerTextX}" y="122" font-family="${FONT}" font-size="14" font-weight="700" letter-spacing="3.2" fill="${onBrand}" opacity="0.8">MEMBERSHIP CARD</text>
    <text x="${headerTextX}" y="150" font-family="${FONT}" font-size="14" fill="${onBrand}" opacity="0.62">${escapeXml(webAddress)}</text>

    <!-- The rule that carries the whole palette across the card -->
    <rect y="${HEADER_H}" width="${CARD_WIDTH}" height="7" fill="url(#ruleFill)" />

    <!-- Photo, ringed in the gradient -->
    ${photoBlock}
    <rect x="${PHOTO.x - 2}" y="${PHOTO.y - 2}" width="${PHOTO.size + 4}" height="${PHOTO.size + 4}" rx="20"
          fill="none" stroke="url(#ringFill)" stroke-width="4" />

    <!-- Who this is -->
    <text x="${RIGHT}" y="${PHOTO.y + 48}" font-family="${FONT}" font-size="31" font-weight="700" fill="${INK}">${escapeXml(fit(member.name, 15))}</text>
    <text x="${RIGHT}" y="${PHOTO.y + 84}" font-family="${FONT}" font-size="21" font-weight="700" fill="${brand}">Member #${member.memberId}</text>

    <rect x="${RIGHT}" y="${PHOTO.y + 106}" width="132" height="36" rx="18" fill="${statusFill}" stroke="${statusInk}" stroke-opacity="0.3" />
    <text x="${RIGHT + 66}" y="${PHOTO.y + 130}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="1.2" fill="${statusInk}">${active ? "ACTIVE" : "INACTIVE"}</text>

    <text x="${RIGHT}" y="${PHOTO.y + 178}" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="1.4" fill="${MUTED}">${escapeXml(member.role.toUpperCase())}</text>

    <!-- What it entitles them to, on a wash of the gym's colour -->
    <rect x="44" y="466" width="552" height="176" rx="18" fill="${c.tint}" stroke="${c.tintEdge}" stroke-width="2" />
    ${label(72, 512, "MEMBER SINCE")}
    ${value(568, 512, formatDate(member.joinedAt))}
    <line x1="72" y1="536" x2="568" y2="536" stroke="${c.tintEdge}" stroke-width="1.5" />

    ${label(72, 570, "VALID UNTIL")}
    ${value(568, 570, formatDate(member.validUntil))}
    <line x1="72" y1="594" x2="568" y2="594" stroke="${c.tintEdge}" stroke-width="1.5" />

    ${label(72, 628, "SHIFT")}
    ${value(568, 628, fit(shiftLine, 24))}

    <!-- The code the desk scans, on the card itself -->
    <rect x="44" y="660" width="552" height="184" rx="18" fill="${c.tint}" stroke="${c.tintEdge}" stroke-width="2" />
    <rect x="${QR.x - 12}" y="${QR.y - 12}" width="${QR.size + 24}" height="${QR.size + 24}" rx="12" fill="#ffffff" />
    <g transform="translate(${QR.x} ${QR.y}) scale(${qrScale})">
      <path d="${qr.path}" fill="${INK}" shape-rendering="crispEdges" />
    </g>

    <text x="272" y="738" font-family="${FONT}" font-size="21" font-weight="700" fill="${INK}">Scan to check in</text>
    <text x="272" y="768" font-family="${FONT}" font-size="15" fill="${SUBTLE}">Show this at the front desk.</text>

    <!-- The gym, in full -->
    <rect y="${FOOTER_Y}" width="${CARD_WIDTH}" height="${FOOTER_H}" fill="url(#footerFill)" />
    <circle cx="72" cy="${FOOTER_Y + FOOTER_H}" r="96" fill="#ffffff" opacity="0.07" />

    <text x="320" y="${FOOTER_Y + 40}" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="700" fill="${onDeep}">${escapeXml(fit(gym.address ?? gym.name, 44))}</text>
    <text x="320" y="${FOOTER_Y + 66}" text-anchor="middle" font-family="${FONT}" font-size="16" fill="${onDeep}" opacity="0.78">${escapeXml(gym.phone ?? webAddress)}</text>

    <line x1="232" y1="${FOOTER_Y + 84}" x2="408" y2="${FOOTER_Y + 84}" stroke="${onDeep}" stroke-opacity="0.25" stroke-width="1.5" />
    <text x="320" y="${FOOTER_Y + 106}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="600" letter-spacing="2.4" fill="${onDeep}" opacity="0.7">POWERED BY FITCONNECT</text>
  </g>
</svg>`;
}

export default function IdCardPage() {
  const { token } = useParams<{ token: string }>();

  const [card, setCard] = React.useState<MemberIdCard | null>(null);
  const [svg, setSvg] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const res = await publicApi.getIdCard(token);
      const data = res.data.data.card;
      setCard(data);

      // Both assets are inlined before the SVG is built, so what is rendered is
      // exactly what gets exported.
      const [photo, logo] = await Promise.all([
        data.member.avatarUrl
          ? toDataUrl(resolveAssetUrl(data.member.avatarUrl) ?? data.member.avatarUrl)
          : Promise.resolve(null),
        data.gym.logoUrl
          ? toDataUrl(resolveAssetUrl(data.gym.logoUrl) ?? data.gym.logoUrl)
          : Promise.resolve(null),
      ]);

      setSvg(buildCardSvg(data, photo, logo, window.location.href));
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setLoading(false);
    }
  }, [token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async () => {
    if (!svg || !card) return;
    setDownloading(true);

    try {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });

      const canvas = document.createElement("canvas");
      canvas.width = CARD_WIDTH * EXPORT_SCALE;
      canvas.height = CARD_HEIGHT * EXPORT_SCALE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      const png = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!png) throw new Error("Could not render the card");

      const link = document.createElement("a");
      link.href = URL.createObjectURL(png);
      link.download = `${card.gym.slug}-member-${card.member.memberId}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError("The card could not be saved. Try again, or use your browser's print option.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <PageLoader />;

  if (error || !card || !svg) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {error || "This card could not be loaded."}
            </p>
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 p-4 py-8">
      <img
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        alt={`Membership card for ${card.member.name} at ${card.gym.name}`}
        className="w-full rounded-2xl border shadow-lg"
      />

      <div className="flex w-full flex-col gap-2">
        <Button onClick={handleDownload} disabled={downloading} className="w-full">
          <Download className="mr-2 h-4 w-4" />
          {downloading ? "Preparing…" : "Download card"}
        </Button>
        <Button variant="outline" onClick={() => void load()} className="w-full">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        This card always shows your current membership details, and the code on
        it is how the desk checks you in. Keep the link — it stays the same when
        you renew.
      </p>
    </div>
  );
}

/**
 * Fetch an image and inline it.
 *
 * Returns null rather than throwing: a missing photo should still produce a
 * card, just one with initials where the picture goes.
 */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!response.ok) return null;
    const blob = await response.blob();

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
