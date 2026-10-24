import { andalusianPattern, defaultTheme, patternStyleFor } from '@yusr/theme';
import { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Mask, Path, Pattern, Rect, Stop } from 'react-native-svg';
import { heroDriftClock, useReducedMotion } from '@/lib/motion';
import { useTheme } from '@/lib/theme';

const AnimatedG = Animated.createAnimatedComponent(G);
const TILE = andalusianPattern(144);

/**
 * «روضة العطاء» behind the home's opening, as on the website's hero: the pattern drifts slowly from
 * left to right and fades out towards the right edge and the bottom. The layer is one tile wider than
 * the view and moves by one tile, so the loop is seamless; with reduced motion it stays still.
 */
export function HeroPattern({ width, height }: { width: number; height: number }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const style = patternStyleFor(defaultTheme, theme.scheme);
  const drift = useMemo(
    () => (reduced ? null : heroDriftClock().interpolate({ inputRange: [0, 1], outputRange: ['translate(0 0)', `translate(${TILE.tile} 0)`] })),
    [reduced],
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          <Pattern id="hero-tile" width={TILE.tile} height={TILE.tile} patternUnits="userSpaceOnUse">
            <Path
              d={TILE.lattice}
              fill="none"
              stroke={style.stroke}
              strokeOpacity={style.strokeOpacity}
              strokeWidth={1.1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path d={TILE.rosette + TILE.seeds} fill={style.fill} fillOpacity={style.fillOpacity} />
          </Pattern>
          <LinearGradient id="hero-down" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0.3" stopColor="#fff" />
            <Stop offset="0.95" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="hero-across" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0.35" stopColor="#fff" />
            <Stop offset="0.98" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <Mask id="hero-fade-down" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <Rect width={width} height={height} fill="url(#hero-down)" />
          </Mask>
          <Mask id="hero-fade-across" maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <Rect width={width} height={height} fill="url(#hero-across)" />
          </Mask>
        </Defs>
        <G mask="url(#hero-fade-down)">
          <G mask="url(#hero-fade-across)">
            <AnimatedG transform={drift ?? 'translate(0 0)'}>
              <Rect x={-TILE.tile} width={width + TILE.tile} height={height} fill="url(#hero-tile)" />
            </AnimatedG>
          </G>
        </G>
      </Svg>
    </View>
  );
}
