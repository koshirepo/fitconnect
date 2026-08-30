/**
 * Documentation: A member's ID card.
 *
 * - Opens from the link sent by email or WhatsApp, on the gym's own subdomain, with no sign-in. The token in the URL is the credential.
 * - Re-fetched on every visit and never cached. A member who changed their photo, renewed, or lapsed sees that here immediately — the link is permanent, its contents are not.
 * - The card is authored as an SVG with the photo inlined as a data URL. That is what makes the PNG download work with no library: an SVG whose every asset is embedded can be drawn to a canvas and exported, where one referencing an external image would taint the canvas and fail.
 * - Primary exports: IdCardPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { publicApi } from "@/api/public";
import { getApiError } from "@/api/client";
import { resolveAssetUrl } from "@/lib/assets";
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

function buildCardSvg(
  card: MemberIdCard,
  photo: string | null,
  logo: string | null,
) {
  const { member, gym } = card;
  const active = member.status === "ACTIVE";
  const accent = active ? "#059669" : "#d97706";
  const initials = member.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const photoBlock = photo
    ? `<image href="${photo}" x="200" y="250" width="240" height="240"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />`
    : `<rect x="200" y="250" width="240" height="240" rx="20" fill="#e2e8f0" />
       <text x="320" y="400" text-anchor="middle" font-family="Inter, system-ui, sans-serif"
             font-size="86" font-weight="700" fill="#94a3b8">${escapeXml(initials)}</text>`;

  const logoBlock = logo
    ? `<image href="${logo}" x="40" y="36" width="72" height="72"
             preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)" />`
    : "";

  const shiftLine = member.shift
    ? `${member.shift.name} · ${member.shift.startTime}–${member.shift.endTime}`
    : "Any shift";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <clipPath id="photoClip"><rect x="200" y="250" width="240" height="240" rx="20" /></clipPath>
    <clipPath id="logoClip"><rect x="40" y="36" width="72" height="72" rx="16" /></clipPath>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="28" fill="#ffffff" />
  <rect width="${CARD_WIDTH}" height="150" rx="28" fill="#0f172a" />
  <rect y="120" width="${CARD_WIDTH}" height="30" fill="#0f172a" />

  ${logoBlock}
  <text x="${logo ? 132 : 40}" y="72" font-family="Inter, system-ui, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${escapeXml(fit(gym.name, 24))}</text>
  <text x="${logo ? 132 : 40}" y="104" font-family="Inter, system-ui, sans-serif" font-size="17" fill="#94a3b8">MEMBERSHIP CARD</text>

  ${photoBlock}

  <text x="320" y="560" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="38" font-weight="700" fill="#0f172a">${escapeXml(fit(member.name, 22))}</text>
  <text x="320" y="602" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="600" fill="#64748b">Member #${member.memberId}</text>

  <rect x="230" y="628" width="180" height="38" rx="19" fill="${accent}" opacity="0.12" />
  <text x="320" y="654" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="18" font-weight="700" fill="${accent}">${active ? "ACTIVE" : "INACTIVE"}</text>

  <line x1="60" y1="706" x2="580" y2="706" stroke="#e2e8f0" stroke-width="2" />

  <text x="60" y="748" font-family="Inter, system-ui, sans-serif" font-size="17" fill="#94a3b8">MEMBER SINCE</text>
  <text x="580" y="748" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="600" fill="#0f172a">${escapeXml(formatDate(member.joinedAt))}</text>

  <text x="60" y="798" font-family="Inter, system-ui, sans-serif" font-size="17" fill="#94a3b8">VALID UNTIL</text>
  <text x="580" y="798" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="600" fill="#0f172a">${escapeXml(formatDate(member.validUntil))}</text>

  <text x="60" y="848" font-family="Inter, system-ui, sans-serif" font-size="17" fill="#94a3b8">SHIFT</text>
  <text x="580" y="848" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="600" fill="#0f172a">${escapeXml(fit(shiftLine, 26))}</text>

  <rect y="${CARD_HEIGHT - 90}" width="${CARD_WIDTH}" height="90" fill="#f8fafc" />
  <text x="320" y="${CARD_HEIGHT - 52}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="16" fill="#64748b">${escapeXml(fit(gym.address ?? gym.name, 46))}</text>
  <text x="320" y="${CARD_HEIGHT - 26}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="16" fill="#94a3b8">${escapeXml(gym.phone ?? "")}</text>
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

      setSvg(buildCardSvg(data, photo, logo));
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
        alt={`Membership card for ${card.member.name}`}
        className="w-full rounded-2xl border shadow-lg"
      />

      {/* The code the desk scans.
          Kept out of the card SVG on purpose: that image is rendered to PNG
          through a canvas for the download, and an image loaded from another
          origin would taint the canvas and break it. On the page it does the
          job anyway — a member holds up their phone, the desk reads it. */}
      <div className="flex w-full flex-col items-center gap-3 rounded-2xl border bg-card p-5">
        <p className="text-sm font-medium">Show this at the desk</p>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(window.location.href)}`}
          alt="Your check-in code"
          className="h-44 w-44 rounded-lg bg-white p-2"
        />
        <p className="text-center text-xs text-muted-foreground">
          A coach scans this to mark you present. Keep it to yourself — it is
          your card.
        </p>
      </div>

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
        This card always shows your current membership details. Keep the link —
        it stays the same when you renew.
      </p>
    </div>
  );
}
