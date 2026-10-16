import { CATEGORY_META, type CaseCategory } from '@yusr/core';
import { andalusianPattern } from '@yusr/theme';
import { ICON_NODES } from '@yusr/ui/icons';
import { useId } from 'react';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { SVG_SHAPES } from '@/components/Icon';
import { useTheme } from '@/lib/theme';

const LATTICE = andalusianPattern(64);

/** The website's illustrated cover (no beneficiary photos), drawn natively from the same geometry. */
export function CaseCover({ category, seed, height = 170 }: { category: CaseCategory; seed: number; height?: number }) {
  const theme = useTheme();
  const tone = theme.tones[CATEGORY_META[category].tone];
  const id = `cover${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const variant = seed % 4;
  const orbX = 60 + (seed % 7) * 26;
  const orbY = 40 + (seed % 5) * 22;
  const glyphX = variant % 2 === 0 ? 196 : 76;
  const glyphY = 44 + (seed % 3) * 6;
  return (
    <Svg
      width="100%"
      height={height}
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <Pattern
          id={id}
          width={LATTICE.tile}
          height={LATTICE.tile}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${(seed * 13) % 64} ${(seed * 7) % 64})`}
        >
          <Path d={LATTICE.lattice} fill="none" stroke={tone.solid} strokeWidth={1} />
          <Path d={LATTICE.seeds} fill={tone.solid} />
        </Pattern>
      </Defs>
      <Rect width={320} height={180} fill={tone.soft} />
      <Rect width={320} height={180} fill={`url(#${id})`} opacity={0.2} />
      <Circle cx={orbX} cy={orbY} r={70 + variant * 12} fill={tone.solid} opacity={0.09} />
      <Circle cx={320 - orbX / 2} cy={170 - orbY / 3} r={36 + variant * 6} fill={tone.solid} opacity={0.07} />
      <G
        transform={`translate(${glyphX} ${glyphY}) scale(3.4)`}
        fill="none"
        stroke={tone.softForeground}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICON_NODES[CATEGORY_META[category].icon].map(([tag, attrs], index) => {
          const Shape = SVG_SHAPES[tag];
          return <Shape key={index} {...attrs} />;
        })}
      </G>
      <Circle cx={glyphX + 66} cy={glyphY + 4} r={5.5} fill={theme.colors.highlight} />
    </Svg>
  );
}
