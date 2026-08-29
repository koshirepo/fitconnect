/**
 * Documentation: A product's photos and its video.
 *
 * - One large frame with thumbnails under it, because a gym photographing a tub of protein takes the label, the back, and the scoop, and a reader wants to move between them without scrolling.
 * - The video is a thumbnail like any other. Putting it in the same strip means a product with a video and three photos has one control surface rather than two competing ones, and a product with only a video still gets the large frame.
 * - Renders nothing at all when there is neither. An empty grey box saying "no image" is worse than the card simply being shorter.
 * - Primary exports: ProductMedia.
 */
import * as React from "react";
import { Play } from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { youTubeEmbedUrl } from "@/lib/youtube";
import { cn } from "@/lib/utils";

type Slide = { kind: "photo"; url: string } | { kind: "video"; embedUrl: string };

export function ProductMedia({
  photos,
  videoUrl,
  name,
  className,
}: {
  photos: string[];
  videoUrl?: string | null;
  /** Used for the alt text, so a screen reader hears which product this is. */
  name: string;
  className?: string;
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

  if (!active) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="overflow-hidden rounded-xl border bg-muted">
        {active.kind === "video" ? (
          <iframe
            src={active.embedUrl}
            title={`${name} video`}
            className="aspect-video w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <OptimizedImage
            src={active.url}
            alt={name}
            className="aspect-square w-full object-cover"
          />
        )}
      </div>

      {slides.length > 1 && (
        <div className="flex flex-wrap gap-2">
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
                "h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2",
                position === index ? "border-primary" : "border-transparent",
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
