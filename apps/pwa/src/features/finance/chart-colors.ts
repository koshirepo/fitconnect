/**
 * Documentation: The analytics screen's palette.
 *
 * - Its own module so the page and the chart bundle can both read it without the page importing the charts — which would pull recharts back into the page's own chunk and undo the deferring.
 * - Primary exports: CHART_COLORS.
 */
export const CHART_COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#a855f7",
  muted: "#94a3b8",
};
