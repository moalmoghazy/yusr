import { CATEGORY_META, type CaseCategory } from '@yusr/core';
import { andalusianPattern, brand } from '@yusr/theme';
import { ICON_NODES } from '@yusr/ui/icons';
import { useId, useMemo } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Pattern, Rect, Stop } from 'react-native-svg';
import { SVG_SHAPES } from '@/components/Icon';
import { coverDriftClock, morphClock, useReducedMotion } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const AnimatedG = Animated.createAnimatedComponent(G);

const LATTICE = andalusianPattern(64);

/** Same layout as the website's cover (packages/ui/src/case-cover.tsx): the motif at the start, centred. */
const GLYPH_SCALE = 3.4;
const GLYPH_X = 40;
const GLYPH_Y = (180 - 24 * GLYPH_SCALE) / 2;
const LOGO = brand.logo;
const MARK_SCALE = (24 * GLYPH_SCALE * 0.92) / LOGO.bounds.height;
const MARK_X = GLYPH_X + 12 * GLYPH_SCALE - MARK_SCALE * (LOGO.bounds.x + LOGO.bounds.width / 2);
const MARK_Y = GLYPH_Y + 12 * GLYPH_SCALE - MARK_SCALE * (LOGO.bounds.y + LOGO.bounds.height / 2);
const r2 = (value: number) => Math.round(value * 100) / 100;

/** Scale about a point, as a transform string Animated can interpolate (only the scale changes). */
const scaleAbout =
  (cx: number, cy: number) =>
  (sx: number, sy = sx, dy = 0) =>
    `translate(${cx} ${cy + dy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;
const markScale = scaleAbout(LOGO.bounds.x + LOGO.bounds.width / 2, LOGO.bounds.y + LOGO.bounds.height / 2);
const iconScale = scaleAbout(12, 12);
const dropScale = scaleAbout(LOGO.guides.drop.cx, LOGO.guides.drop.cy);

/**
 * The website's illustrated cover (no beneficiary photos), drawn natively from the same geometry and
 * moving the same way: the lattice drifts left to right and fades out, and the motif loops — the Yusr
 * mark appears and its golden ḍamma falls onto it like a drop of water, then the ḍamma fades as the mark
 * turns into the category's motif, and back. Covers start the loop at different moments (by seed).
 * With reduced motion the cover is still and shows the motif only.
 */
export function CaseCover({ category, seed, height = 170 }: { category: CaseCategory; seed: number; height?: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const tone = theme.tones[CATEGORY_META[category].tone];
  const id = `cover${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const variant = seed % 4;
  const orbX = 60 + (seed % 7) * 26;
  const orbY = 40 + (seed % 5) * 22;

  const motion = useMemo(() => {
    if (reduced) return null;
    // As on the web (--morph-delay): each cover is ahead in the 9s loop by its own amount.
    const t = Animated.modulo(Animated.add(morphClock(), ((seed * 1.7) % 9) / 9), 1);
    const at = (inputRange: number[], outputRange: (number | string)[]) => t.interpolate({ inputRange, outputRange: outputRange as never });
    return {
      drift: coverDriftClock().interpolate({ inputRange: [0, 1], outputRange: ['translate(0 0)', `translate(${LATTICE.tile} 0)`] }),
      markOpacity: at([0, 0.04, 0.32, 0.4, 1], [0, 1, 1, 0, 0]),
      mark: at([0, 0.14, 0.28, 0.4, 1], [markScale(0.85), markScale(1), markScale(1), markScale(1.08), markScale(1.08)]),
      iconOpacity: at([0, 0.32, 0.36, 0.86, 0.94, 1], [0, 0, 1, 1, 0, 0]),
      icon: at([0, 0.32, 0.5, 0.8, 0.94, 1], [iconScale(0.85), iconScale(0.85), iconScale(1), iconScale(1), iconScale(0.9), iconScale(0.9)]),
      // Falls from above, lands with a small splash, rests, then fades with the mark.
      dropOpacity: at([0, 0.08, 0.1, 0.28, 0.36, 1], [0, 0, 1, 1, 0, 0]),
      drop: at(
        [0, 0.08, 0.16, 0.19, 0.22, 0.28, 0.36, 1],
        [
          dropScale(0.85, 1.15, -34),
          dropScale(0.85, 1.15, -34),
          dropScale(1.18, 0.82, 0),
          dropScale(0.94, 1.06, -2),
          dropScale(1, 1, 0),
          dropScale(1, 1, 0),
          dropScale(0.6, 0.6, 0),
          dropScale(0.6, 0.6, 0),
        ],
      ),
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
      <Defs>
        <Pattern
          id={id}
          width={LATTICE.tile}
          height={LATTICE.tile}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${(seed * 13) % LATTICE.tile} ${(seed * 7) % LATTICE.tile})`}
        >
          <Path d={LATTICE.lattice} fill="none" stroke={tone.solid} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={LATTICE.seeds} fill={tone.solid} />
        </Pattern>
        <LinearGradient id={`${id}g`} x1="0" x2="1" y1="0" y2="0">
          <Stop offset="0.3" stopColor="#fff" />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </LinearGradient>
        <Mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="180">
          <Rect width={320} height={180} fill={`url(#${id}g)`} />
        </Mask>
      </Defs>
      <Rect width={320} height={180} fill={tone.soft} />
      <G mask={`url(#${id}m)`}>
        <AnimatedG transform={motion?.drift ?? 'translate(0 0)'}>
          <Rect x={-LATTICE.tile} width={320 + LATTICE.tile} height={180} fill={`url(#${id})`} opacity={0.2} />
        </AnimatedG>
      </G>
      <Circle cx={orbX} cy={orbY} r={70 + variant * 12} fill={tone.solid} opacity={0.09} />
      <Circle cx={320 - orbX / 2} cy={170 - orbY / 3} r={36 + variant * 6} fill={tone.solid} opacity={0.07} />
      {motion && (
        <G transform={`translate(${r2(MARK_X)} ${r2(MARK_Y)}) scale(${r2(MARK_SCALE)})`}>
          <AnimatedG opacity={motion.markOpacity} transform={motion.mark}>
            <Path d={LOGO.bowl.d} fill="none" stroke={tone.softForeground} strokeWidth={LOGO.bowl.strokeWidth} strokeLinecap="round" />
            {LOGO.dots.items.map((dot) => (
              <Circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={tone.softForeground} />
            ))}
          </AnimatedG>
        </G>
      )}
      <G transform={`translate(${GLYPH_X} ${GLYPH_Y}) scale(${GLYPH_SCALE})`}>
        <AnimatedG
          opacity={motion?.iconOpacity ?? 1}
          transform={motion?.icon ?? iconScale(1)}
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
      {motion && (
        <G transform={`translate(${r2(MARK_X)} ${r2(MARK_Y)}) scale(${r2(MARK_SCALE)})`}>
          <AnimatedG opacity={motion.dropOpacity} transform={motion.drop}>
            <Path d={LOGO.drop.d} transform={LOGO.drop.transform} fill={theme.colors.highlight} />
          </AnimatedG>
        </G>
      )}
    </Svg>
  );
}
