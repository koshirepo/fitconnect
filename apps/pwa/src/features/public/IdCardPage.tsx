/**
 * Documentation: A member's ID card.
 *
 * - Opens from the link sent by email or WhatsApp, on the gym's own subdomain, with no sign-in. The token in the URL is the credential.
 * - Re-fetched on every visit and never cached. A member who changed their photo, renewed, or lapsed sees that here immediately — the link is permanent, its contents are not.
 * - The card is authored as an SVG with the photo, the logo, and the QR all inlined. That is what makes the PNG download work with no library: an SVG whose every asset is embedded can be drawn to a canvas and exported, where one referencing an external image would taint the canvas and fail.
 * - The QR opens this same page, which is the member's details as anyone holding the card may see them: name, number, standing, since when, which shift. It is not a check-in code — members are checked in at the gym's own machine — so scanning it identifies somebody rather than recording anything.
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
import { useSeo } from "@/lib/seo";

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

/** Padding either side of a footer line, and the width that leaves it. */
const ADDRESS_INSET = 32;
const ADDRESS_WIDTH = CARD_WIDTH - ADDRESS_INSET * 2;
/**
 * Characters that fit that width at 16px bold.
 *
 * Bold Inter averages a little over half its size per character, so 576px is
 * roughly 62 of them. An address that beats the estimate is squeezed to fit by
 * `fitToWidth` rather than allowed over the edge.
 */
const ADDRESS_MAX_CHARS = 62;

/**
 * Hold a line inside the card when it turns out wider than the estimate.
 *
 * Character counts cannot know that "WWWWW" is twice "iiiii", so the estimate
 * above is only that. `textLength` makes the browser fit the line exactly,
 * which for the small overshoot this catches is invisible — and much better
 * than an address running off the edge of a card someone is about to print.
 */
function fitToWidth(line: string) {
  return line.length > ADDRESS_MAX_CHARS - 6
    ? ` textLength="${ADDRESS_WIDTH}" lengthAdjust="spacingAndGlyphs"`
    : "";
}

/**
 * Break a line onto as many lines as it needs, up to a limit.
 *
 * The gym's address is the one field on the card written by a person with no
 * length in mind — "Rudra Gym, Bakhri Bazar, Begusarai (Bihar)" — and trimming
 * it to one line cut the state off the end. Only the last line is ellipsed, and
 * only if even the allowance runs out.
 */
function wrap(value: string, max: number, maxLines: number) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let dropped = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= max) {
      current = candidate;
      continue;
    }

    // The line is full. Start the next one, unless there are no more.
    if (lines.length + 1 === maxLines && current) {
      lines.push(current);
      current = "";
      dropped = true;
      break;
    }

    if (current) lines.push(current);
    // A single word longer than a whole line gets broken rather than
    // overflowing the card.
    current = word.length > max ? `${word.slice(0, max - 1)}…` : word;
  }

  if (current) lines.push(current);
  if (!lines.length) return [""];

  // Whatever did not fit is signalled rather than dropped silently.
  if (dropped && !lines[lines.length - 1]!.endsWith("…")) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  }

  return lines;
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

/**
 * The member's role, as a badge with a glyph and no word.
 *
 * It sits beside the status pill rather than under it, so the two facts about
 * standing — are they in good standing, and what are they here as — read as one
 * line. The glyphs are drawn rather than imported: this SVG is exported to PNG
 * by drawing it to a canvas, and every path in it has to be self-contained.
 *
 * A gym's own custom role has no glyph to draw, so it gets its initial. The
 * role name goes in a `<title>` either way, which is what a screen reader
 * reads and what a hover shows.
 */
function roleBadge(cx: number, cy: number, role: string, ink: string, fill: string) {
  const r = 19;
  const key = role.toUpperCase();

  const glyph =
    key === "ADMIN"
      ? // A shield: the role that guards the gym's own records.
        `<path d="M ${cx} ${cy - 9} l 9 3.6 v 5.4 c 0 5 -3.6 9.3 -9 10.8 c -5.4 -1.5 -9 -5.8 -9 -10.8 v -5.4 z"
              fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round" />`
      : key === "COACH"
        ? // A dumbbell, which is what a coach is on the floor.
          `<g stroke="${ink}" stroke-width="2" stroke-linecap="round" fill="none">
             <path d="M ${cx - 9} ${cy} h 18" />
             <path d="M ${cx - 9} ${cy - 5} v 10" />
             <path d="M ${cx - 5.5} ${cy - 7.5} v 15" />
             <path d="M ${cx + 5.5} ${cy - 7.5} v 15" />
             <path d="M ${cx + 9} ${cy - 5} v 10" />
           </g>`
        : key === "MEMBER"
          ? // A person.
            `<g stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round">
               <circle cx="${cx}" cy="${cy - 4.5}" r="4.5" />
               <path d="M ${cx - 8} ${cy + 9.5} a 8 8 0 0 1 16 0" />
             </g>`
          : // A custom role the gym invented: its initial, since nothing here
            // can know what it means.
            `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="${FONT}"
                   font-size="17" font-weight="700" fill="${ink}">${escapeXml(key.slice(0, 1))}</text>`;

  return `<g><title>${escapeXml(role)}</title>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${ink}" stroke-opacity="0.28" stroke-width="1.5" />
    ${glyph}
  </g>`;
}

function label(x: number, y: number, text: string) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="15" font-weight="600" letter-spacing="1.4" fill="${SUBTLE}">${escapeXml(text)}</text>`;
}

function value(x: number, y: number, text: string) {
  return `<text x="${x}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="19" font-weight="700" fill="${INK}">${escapeXml(text)}</text>`;
}

/** One row of the detail strip: a label on the left, its value on the right. */
type DetailRow = { label: string; value: string };

function buildCardSvg(
  card: MemberIdCard,
  photo: string | null,
  logo: string | null,
  /** What the QR encodes: this card's own address, which opens the member's details. */
  qrData: string,
  /**
   * The saved copy leaves out the expiry.
   *
   * A card on screen is re-fetched every time it opens, so a date on it is
   * always current. A PNG in a photo roll is not: it keeps whatever was true
   * the day it was saved, and an expiry that has quietly gone stale is worse
   * than no expiry at all — it is the one field on the card somebody would act
   * on at the door.
   */
  { includeValidUntil = true }: { includeValidUntil?: boolean } = {},
) {
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
  const PHOTO = { x: 44, y: 240, size: 184 };
  const RIGHT = PHOTO.x + PHOTO.size + 30;
  const HEADER_H = 200;
  const FOOTER_H = 118;
  const FOOTER_Y = CARD_HEIGHT - FOOTER_H;

  const photoBlock = photo
    ? `<image href="${photo}" x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.size}" height="${PHOTO.size}"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />`
    : `<rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.size}" height="${PHOTO.size}" rx="18" fill="${c.tint}" />
       <text x="${PHOTO.x + PHOTO.size / 2}" y="${PHOTO.y + PHOTO.size / 2 + 26}" text-anchor="middle"
             font-family="${FONT}" font-size="72" font-weight="700" fill="${brand}" opacity="0.55">${escapeXml(initials)}</text>`;

  const logoBlock = logo
    ? `<rect x="36" y="48" width="92" height="92" rx="22" fill="#ffffff" opacity="0.94" />
       <image href="${logo}" x="42" y="54" width="80" height="80"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : "";
  const headerTextX = logo ? 148 : 40;

  const shiftLine = member.shift
    ? `${member.shift.name} · ${member.shift.startTime}–${member.shift.endTime}`
    : "Any shift";

  /**
   * The name, sized to the space it has.
   *
   * A card belongs to whoever is named on it, so the name is the last thing
   * that should be cut. Two steps down in size buy eight more characters
   * before the ellipsis is reached at all.
   */
  const nameSize = member.name.length > 18 ? 24 : member.name.length > 14 ? 27 : 31;
  const nameMax = nameSize === 31 ? 15 : nameSize === 27 ? 18 : 23;

  // The strip of facts. The expiry is dropped from the saved copy, and the
  // rows below simply close up — which is why the panel is measured rather
  // than drawn at a fixed height.
  const rows: DetailRow[] = [
    { label: "MEMBER SINCE", value: formatDate(member.joinedAt) },
    ...(includeValidUntil
      ? [{ label: "VALID UNTIL", value: formatDate(member.validUntil) }]
      : []),
    { label: "SHIFT", value: fit(shiftLine, 24) },
  ];

  const PANEL = { x: 44, y: 452, w: 552, padY: 26, rowH: 56 };
  const panelH = PANEL.padY * 2 + (rows.length - 1) * PANEL.rowH + 12;
  const panelBottom = PANEL.y + panelH;

  const detailRows = rows
    .map((row, index) => {
      const y = PANEL.y + PANEL.padY + 12 + index * PANEL.rowH;
      const rule =
        index < rows.length - 1
          ? `<line x1="${PANEL.x + 28}" y1="${y + 24}" x2="${PANEL.x + PANEL.w - 28}" y2="${y + 24}" stroke="${c.tintEdge}" stroke-width="1.5" />`
          : "";
      return `${label(PANEL.x + 28, y, row.label)}
    ${value(PANEL.x + PANEL.w - 28, y, row.value)}
    ${rule}`;
    })
    .join("\n    ");

  /**
   * The stub, the way a ticket has one.
   *
   * Everything above the perforation is who this is; everything below it is
   * the part a machine reads. Separating them is what makes the QR look like
   * the purpose of the card rather than a fourth panel competing with three
   * others — and the notches bitten out of the edges say "tear here" without a
   * word of instruction.
   */
  const perforationY = panelBottom + 34;
  const stubMid = (perforationY + FOOTER_Y) / 2;

  const qr = qrPath(qrData);
  const QR = { size: 168, x: 70 };
  const qrY = stubMid - QR.size / 2;
  const qrScale = QR.size / qr.count;

  // The gym's address on the web, which is how a card earns its place in a
  // wallet: it is the one surface a member already carries that can point them
  // back at the gym.
  const webAddress = `${gym.slug}.fitconnect.co.in`;

  // Where the gym is, on up to two lines across the card's full width. The
  // phone number that used to sit under it is gone: a card is handed around and
  // photographed, and the number on it was the gym's own contact detail rather
  // than anything the holder needs.
  const addressLines = wrap(gym.address ?? gym.name, ADDRESS_MAX_CHARS, 2);
  const addressTop = FOOTER_Y + (addressLines.length > 1 ? 40 : 52);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <clipPath id="photoClip"><rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.size}" height="${PHOTO.size}" rx="18" /></clipPath>
    <clipPath id="logoClip"><rect x="42" y="54" width="80" height="80" rx="18" /></clipPath>
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
    <!-- The wash behind the stub: the gym's colour, almost gone. -->
    <linearGradient id="stubFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c.tint}" />
      <stop offset="100%" stop-color="#ffffff" />
    </linearGradient>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="28" fill="#ffffff" />

  <g clip-path="url(#cardClip)">
    <!-- Header, in the gym's colours -->
    <rect width="${CARD_WIDTH}" height="${HEADER_H}" fill="url(#headerFill)" />
    <!-- Two washes of light and one diagonal shine, so the band reads as a
         printed surface rather than a flat fill. All three are kept far right
         and very low contrast: the gym's name is set over this and has to stay
         first. -->
    <circle cx="588" cy="26" r="128" fill="#ffffff" opacity="0.10" />
    <circle cx="512" cy="200" r="86" fill="#ffffff" opacity="0.07" />
    <path d="M 380 0 L 640 0 L 640 ${HEADER_H} L 236 ${HEADER_H} Z" fill="#ffffff" opacity="0.05" />

    ${logoBlock}
    <text x="${headerTextX}" y="94" font-family="${FONT}" font-size="31" font-weight="700" fill="${onBrand}">${escapeXml(fit(gym.name, 20))}</text>
    <text x="${headerTextX}" y="124" font-family="${FONT}" font-size="14" font-weight="700" letter-spacing="3.2" fill="${onBrand}" opacity="0.8">MEMBERSHIP CARD</text>
    <text x="${headerTextX}" y="152" font-family="${FONT}" font-size="14" fill="${onBrand}" opacity="0.62">${escapeXml(webAddress)}</text>

    <!-- The rule that carries the whole palette across the card -->
    <rect y="${HEADER_H}" width="${CARD_WIDTH}" height="7" fill="url(#ruleFill)" />

    <!-- Photo, ringed in the gradient -->
    ${photoBlock}
    <rect x="${PHOTO.x - 2}" y="${PHOTO.y - 2}" width="${PHOTO.size + 4}" height="${PHOTO.size + 4}" rx="20"
          fill="none" stroke="url(#ringFill)" stroke-width="4" />

    <!-- Who this is -->
    <text x="${RIGHT}" y="${PHOTO.y + 50}" font-family="${FONT}" font-size="${nameSize}" font-weight="700" fill="${INK}">${escapeXml(fit(member.name, nameMax))}</text>
    <text x="${RIGHT}" y="${PHOTO.y + 88}" font-family="${FONT}" font-size="21" font-weight="700" fill="${brand}">Member #${member.memberId}</text>

    <!-- Standing and role, on one line: are they in good standing, and what
         are they here as. -->
    <rect x="${RIGHT}" y="${PHOTO.y + 110}" width="132" height="36" rx="18" fill="${statusFill}" stroke="${statusInk}" stroke-opacity="0.3" />
    <text x="${RIGHT + 66}" y="${PHOTO.y + 134}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="1.2" fill="${statusInk}">${active ? "ACTIVE" : "INACTIVE"}</text>
    ${roleBadge(RIGHT + 165, PHOTO.y + 128, member.role, brand, c.tint)}

    <!-- What it entitles them to, on a wash of the gym's colour -->
    <rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.w}" height="${panelH}" rx="20" fill="${c.tint}" stroke="${c.tintEdge}" stroke-width="2" />
    ${detailRows}

    <!-- Tear here. The notches are the card's own background, bitten out of
         each edge by the clip. -->
    <rect y="${perforationY}" width="${CARD_WIDTH}" height="${FOOTER_Y - perforationY}" fill="url(#stubFill)" />
    <line x1="34" y1="${perforationY}" x2="606" y2="${perforationY}" stroke="${c.tintEdge}" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 12" />
    <circle cx="0" cy="${perforationY}" r="15" fill="#ffffff" />
    <circle cx="${CARD_WIDTH}" cy="${perforationY}" r="15" fill="#ffffff" />

    <!-- The code the desk scans -->
    <rect x="${QR.x - 14}" y="${qrY - 14}" width="${QR.size + 28}" height="${QR.size + 28}" rx="16" fill="#ffffff" stroke="${c.tintEdge}" stroke-width="2" />
    <g transform="translate(${QR.x} ${qrY}) scale(${qrScale})">
      <path d="${qr.path}" fill="${INK}" shape-rendering="crispEdges" />
    </g>

    <text x="${QR.x + QR.size + 44}" y="${stubMid - 18}" font-family="${FONT}" font-size="22" font-weight="700" fill="${INK}">Scan for member details</text>
    <text x="${QR.x + QR.size + 44}" y="${stubMid + 12}" font-family="${FONT}" font-size="15" fill="${SUBTLE}">Opens this card, live.</text>
    <text x="${QR.x + QR.size + 44}" y="${stubMid + 36}" font-family="${FONT}" font-size="15" fill="${SUBTLE}">Check in at the gym's machine.</text>

    <!-- The gym, in full -->
    <rect y="${FOOTER_Y}" width="${CARD_WIDTH}" height="${FOOTER_H}" fill="url(#footerFill)" />
    <circle cx="72" cy="${FOOTER_Y + FOOTER_H}" r="96" fill="#ffffff" opacity="0.07" />

    ${addressLines
      .map(
        (line, index) =>
          `<text x="320" y="${addressTop + index * 24}" text-anchor="middle" font-family="${FONT}" font-size="16" font-weight="700" fill="${onDeep}"${fitToWidth(line)}>${escapeXml(line)}</text>`,
      )
      .join("")}

    <line x1="232" y1="${FOOTER_Y + 82}" x2="408" y2="${FOOTER_Y + 82}" stroke="${onDeep}" stroke-opacity="0.25" stroke-width="1.5" />
    <text x="320" y="${FOOTER_Y + 104}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="600" letter-spacing="2.4" fill="${onDeep}" opacity="0.7">POWERED BY FITCONNECT</text>
  </g>
</svg>`;
}

export default function IdCardPage() {
  useSeo({
    title: "Member ID Card",
    description: "A gym membership card.",
    noIndex: true,
  });

  const { token } = useParams<{ token: string }>();

  const [card, setCard] = React.useState<MemberIdCard | null>(null);
  const [svg, setSvg] = React.useState<string | null>(null);
  /**
   * The photo and logo, kept after they are inlined.
   *
   * The saved card is not the card on screen — it leaves out the expiry — so
   * the download rebuilds the SVG, and rebuilding it needs the same embedded
   * assets rather than a second fetch.
   */
  const [assets, setAssets] = React.useState<{ photo: string | null; logo: string | null }>({
    photo: null,
    logo: null,
  });
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
        inlineAsset(data.member.avatarUrl),
        inlineAsset(data.gym.logoUrl),
      ]);

      setAssets({ photo, logo });
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
      // Built again rather than reusing what is on screen: a PNG in a photo
      // roll keeps whatever was true the day it was saved, so it carries no
      // expiry date to go quietly stale.
      const exportSvg = buildCardSvg(card, assets.photo, assets.logo, window.location.href, {
        includeValidUntil: false,
      });

      const blob = new Blob([exportSvg], { type: "image/svg+xml;charset=utf-8" });
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
/**
 * Inline a stored asset, trying the proxy first and the stored URL after.
 *
 * The card is built as one self-contained SVG, so a photo that fails to fetch
 * is not a broken image on the page — it is a card printed with initials where
 * the face should be. That makes the second attempt worth making: older
 * records hold an absolute bucket address, `resolveAssetUrl` points those at
 * the API's proxy, and the proxy only has the file where its bucket does.
 */
async function inlineAsset(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  const proxied = resolveAssetUrl(url);
  const viaProxy = proxied ? await toDataUrl(proxied) : null;
  if (viaProxy) return viaProxy;

  return proxied === url ? null : toDataUrl(url);
}

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
