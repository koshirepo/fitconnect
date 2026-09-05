/**
 * Documentation: A product's photos and its video, for either storefront.
 *
 * - One large frame with thumbnails under it, because somebody photographing a tub of protein takes the label, the back, and the scoop, and a reader wants to move between them without scrolling.
 * - Was `features/store/ProductMedia`, used only by the gym store. The platform shop had its own copy of the same idea written inline in the product page: raw `<img>` tags with no lazy loading, no video support, and no guard on the selected index. This is that component with the shop's two additions folded in as props, so neither surface keeps a private version.
 * - `OptimizedImage` throughout. That was the substantive difference between the two implementations — the shop's gallery loaded every full-size photo eagerly.
 * - The video is a thumbnail like any other. Putting it in the same strip means a product with a video and three photos has one control surface rather than two competing ones, and a product with only a video still gets the large frame.
 * - Renders nothing at all when there is neither, unless the caller passes a `fallback`. An empty grey box saying "no image" is worse than the card simply being shorter — but a product *page* needs to fill the column, so it may say otherwise.
 * - Primary exports: ProductGallery.
 */
import * as React from "react";
import { Play } from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { youTubeEmbedUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

type Slide = { kind: "photo"; url: string } | { kind: "video"; embedUrl: string };

export function ProductGallery({
  photos,
  videoUrl,
  name,
  className,
  frameClassName = "aspect-square",
  thumbsClassName = "flex flex-wrap gap-2",
  overlay,
  fallback,
}: {
  photos: string[];
  videoUrl?: string | null;
  /** Used for the alt text, so a screen reader hears which product this is. */
  name: string;
  className?: string;
  /** The shop runs 4:3 and capped at 70vh; the store runs square. */
  frameClassName?: string;
  /** The shop lays thumbnails on a fixed grid; the store wraps them. */
  thumbsClassName?: string;
  /** Absolutely positioned over the frame — stock badges, a discount flag. */
  overlay?: React.ReactNode;
  /** Shown instead of nothing when there is no media at all. */
  fallback?: React.ReactNode;
}) {
  const slides = React.useMemo<Slide[]>(() => {
    const embedUrl = youTubeEmbedUrl(videoUrl);
    return [
      ...photos.map((url) => ({ kind: "photo" as const, url })),
      ...(embedUrl ? [{ kind: "video" as const, embedUrl }] : []),
    ];
  }, [photos, videoUrl]);

  const [index, setIndex] = React.useState(0);
  // A product whose photos changed under us — an edit saved in another tab —
  // must not leave the frame pointing past the end of the strip.
  const active = slides[Math.min(index, slides.length - 1)];

  if (!active) {
    if (!fallback) return null;
    return (
      <div className={cn("space-y-3", className)}>
        <div className={cn("relative overflow-hidden rounded-xl border bg-muted", frameClassName)}>
          {fallback}
          {overlay}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("relative overflow-hidden rounded-xl border bg-muted", frameClassName)}>
        {active.kind === "video" ? (
          <iframe
            src={active.embedUrl}
            title={`${name} video`}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <OptimizedImage src={active.url} alt={name} className="h-full w-full object-cover" />
        )}
        {overlay}
      </div>

      {slides.length > 1 && (
        <div className={thumbsClassName}>
          {slides.map((slide, position) => (
            <button
              key={slide.kind === "photo" ? slide.url : slide.embedUrl}
              type="button"
              onClick={() => setIndex(position)}
              aria-label={
                slide.kind === "video" ? `Play ${name} video` : `Photo ${position + 1} of ${name}`
              }
              aria-current={position === index}
              className={cn(
                // A fixed size, not just an aspect. A bare `aspect-square` in a
                // flex row has no width to be square against, so each thumbnail
                // grew to fill the strip.
                "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2",
                position === index ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              {slide.kind === "video" ? (
                <span className="flex h-full w-full items-center justify-center bg-muted">
                  <Play className="h-5 w-5" />
                </span>
              ) : (
                <OptimizedImage src={slide.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
