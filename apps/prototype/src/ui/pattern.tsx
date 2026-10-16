import { andalusianPattern, type PatternGeometry } from '@yusr/theme';

/** Small-scale geometry for case covers and thumbnails (lattice and seeds, no rosettes). */
export const COVER_PATTERN = andalusianPattern(64);

/**
 * The brand pattern as an SVG <pattern> for use inside another SVG. Lines take the
 * current colour; drops and seeds take the brand gold (see .y-pattern-* in ui.css).
 */
export function PatternDefs({
  id,
  geometry = COVER_PATTERN,
  rosettes = false,
  transform,
}: {
  id: string;
  geometry?: PatternGeometry;
  rosettes?: boolean;
  transform?: string;
}) {
  return (
    <pattern id={id} width={geometry.tile} height={geometry.tile} patternUnits="userSpaceOnUse" patternTransform={transform}>
      <path d={geometry.lattice} className="y-pattern-lines" />
      <path d={rosettes ? geometry.rosette + geometry.seeds : geometry.seeds} className="y-pattern-drops" />
    </pattern>
  );
}
