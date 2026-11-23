import { CATEGORY_META, type CaseCategory } from '@yusr/core';
import { ICON_NODES } from '@yusr/ui/icons';
import { useMemo } from 'react';
import { Animated } from 'react-native';
import Svg, { G, Rect } from 'react-native-svg';
import { SVG_SHAPES } from '@/components/Icon';
import { morphClock, useReducedMotion } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const AnimatedG = Animated.createAnimatedComponent(G);

/** Same layout as the website's cover (packages/ui/src/case-cover.tsx): the motif at the start, centred. */
const GLYPH_SCALE = 3.4;
const GLYPH_X = 40;
const GLYPH_Y = (180 - 24 * GLYPH_SCALE) / 2;

/** Scale about the icon's centre, as a transform string Animated can interpolate. */
const iconScale = (scale: number) => `translate(12 12) scale(${scale}) translate(-12 -12)`;

/**
 * The website's illustrated cover (no beneficiary photos), drawn natively: the category's motif on its own
 * plain tone, with no ornament behind it (as on the web since 2026-11-17). The motif appears, rests and
 * fades in a 9 s loop; covers start the loop at different moments (by seed). With reduced motion it is still.
 */
export function CaseCover({ category, seed, height = 170 }: { category: CaseCategory; seed: number; height?: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const tone = theme.tones[CATEGORY_META[category].tone];

  const motion = useMemo(() => {
    if (reduced) return null;
    // As on the web (--morph-delay): each cover is ahead in the 9s loop by its own amount.
    const t = Animated.modulo(Animated.add(morphClock(), ((seed * 1.7) % 9) / 9), 1);
    return {
      opacity: t.interpolate({ inputRange: [0, 0.08, 0.86, 0.96, 1], outputRange: [0, 1, 1, 0, 0] }),
      scale: t.interpolate({
        inputRange: [0, 0.2, 0.86, 0.96, 1],
        outputRange: [iconScale(0.88), iconScale(1), iconScale(1), iconScale(0.94), iconScale(0.88)],
      }),
    };
  }, [reduced, seed]);

  return (
    <Svg
      width="100%"
      height={height}
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Rect width={320} height={180} fill={tone.soft} />
      <G transform={`translate(${GLYPH_X} ${GLYPH_Y}) scale(${GLYPH_SCALE})`}>
        <AnimatedG
          opacity={motion?.opacity ?? 1}
          transform={motion?.scale ?? iconScale(1)}
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
        </AnimatedG>
      </G>
    </Svg>
  );
}
