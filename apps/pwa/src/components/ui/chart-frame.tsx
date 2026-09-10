/**
 * Documentation: A held-open space for a chart that has not loaded yet.
 *
 * - Charts on the analytics screen come from a lazily-loaded module, so something has to stand in their place: this keeps the exact height the chart will take, which means nothing under it jumps when the chart arrives.
 * - It also decides *when* to load. Children mount once the frame is within a screen of the viewport, so a gym owner who opens the page for the month's figures and never scrolls never downloads the charting library at all.
 * - No IntersectionObserver (a very old browser, a test environment) means render immediately. Failing towards showing the chart is the right way round.
 * - Primary exports: ChartFrame.
 */
import * as React from "react";

export function ChartFrame({
  height,
  children,
}: {
  /** What the chart will occupy, so the placeholder does not resize the page. */
  height: number;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(
    () => typeof IntersectionObserver === "undefined",
  );

  React.useEffect(() => {
    if (visible || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // A screen's worth of warning: the chunk is fetched and parsed while the
      // frame is still below the fold, so scrolling to it finds it drawn.
      { rootMargin: "600px 0px" },
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} style={{ minHeight: height }}>
      {visible ? (
        <React.Suspense fallback={<ChartPlaceholder height={height} />}>{children}</React.Suspense>
      ) : (
        <ChartPlaceholder height={height} />
      )}
    </div>
  );
}

/** Quiet, and exactly the size of what is coming. */
function ChartPlaceholder({ height }: { height: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-md bg-muted/40"
      style={{ height }}
      aria-hidden
    />
  );
}
