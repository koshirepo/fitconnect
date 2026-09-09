/**
 * Documentation: An occupation's icon.
 *
 * - Turns the icon key stored on an occupation row into the glyph a screen draws, so no caller has to resolve one itself.
 * - Built with `createElement` rather than `<Icon />`: a component picked out of a map and rendered as a local binding counts as declaring a component mid-render, which remounts the icon on every pass.
 * - An unknown key, or none at all, draws a briefcase — see `lib/occupation`.
 * - Primary exports: OccupationGlyph.
 */
import * as React from "react";
import { occupationIcon } from "@/lib/occupation";

export function OccupationGlyph({
  icon,
  className,
}: {
  icon?: string | null;
  className?: string;
}) {
  return React.createElement(occupationIcon(icon), { className });
}
