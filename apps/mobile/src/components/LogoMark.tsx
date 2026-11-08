import { brand, lockup, markShine, markViewBox, shineBandPath, wordmark, type LogoGeometry } from '@yusr/theme';
import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Mask, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/Text';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** The light inside the bowl, as on the website (@yusr/ui MarkShine): turquoise and gold bands, fading up the right arm. */
function MarkShine({ logo, shine, gold, id }: { logo: LogoGeometry; shine: string; gold: string; id: string }) {
  if (!logo.shine) return null;
  const { bands, top, fade } = logo.shine;
  return (
    <>
      <Defs>
        {bands.map((band, index) => (
          <RadialGradient
            key={index}
            id={`${id}b${index}`}
            gradientUnits="userSpaceOnUse"
            cx={0}
            cy={0}
            r={1}
            gradientTransform={`translate(${band.cx} ${band.cy}) scale(${band.rx} ${band.ry})`}
          >
            {band.stops.map(([offset, opacity], stop) => (
              <Stop key={stop} offset={offset} stopColor={band.tone === 'gold' ? gold : shine} stopOpacity={opacity} />
            ))}
          </RadialGradient>
        ))}
        <LinearGradient id={`${id}f`} gradientUnits="userSpaceOnUse" x1={fade.x1} y1={fade.y1} x2={fade.x2} y2={fade.y2}>
          <Stop offset={0} stopColor="#fff" />
          <Stop offset={1} stopColor="#000" />
        </LinearGradient>
        <Mask id={`${id}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={64} height={64}>
          <Path d={logo.bowl.d} fill="none" stroke={`url(#${id}f)`} strokeWidth={logo.bowl.strokeWidth} strokeLinecap="round" />
        </Mask>
      </Defs>
      <G mask={`url(#${id}m)`}>
        {bands.map((band, index) => (
          <Path key={index} d={shineBandPath(band, top)} fill={`url(#${id}b${index})`} />
        ))}
      </G>
    </>
  );
}

/** The mark's shapes on its 64-unit grid: the open bowl of ي with its light (and, in the earlier versions, its two dots and the golden ḍamma). */
function MarkShapes({
  logo,
  bowl,
  drop,
  shine,
  size,
  maskId,
}: {
  logo: LogoGeometry;
  bowl: string;
  drop: string;
  shine: string;
  size: number;
  maskId: string;
}) {
  const small = size < logo.dotsMinSize;
  const cutout = logo.dots?.style === 'cutout' && !small;
  return (
    <>
      {cutout && logo.dots && (
        <Defs>
          <Mask id={maskId} maskUnits="userSpaceOnUse" x={-8} y={-8} width={80} height={80}>
            <Rect x={-8} y={-8} width={80} height={80} fill="#fff" />
            {logo.dots.items.map((dot) => (
              <Circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill="#000" />
            ))}
          </Mask>
        </Defs>
      )}
      <Path d={logo.bowl.d} fill="none" stroke={bowl} strokeWidth={logo.bowl.strokeWidth} strokeLinecap="round" mask={cutout ? `url(#${maskId})` : undefined} />
      <MarkShine logo={logo} shine={shine} gold={drop} id={`${maskId}s`} />
      {logo.dots?.style === 'solid' &&
        (small ? (
          <Line
            x1={logo.dots.items[0].cx}
            y1={logo.dots.items[0].cy}
            x2={logo.dots.items[1].cx}
            y2={logo.dots.items[1].cy}
            stroke={bowl}
            strokeWidth={logo.dots.items[0].r * 2}
            strokeLinecap="round"
          />
        ) : (
          logo.dots.items.map((dot) => <Circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={bowl} />)
        ))}
      {logo.drop && <Path d={logo.drop.d} fill={drop} transform={logo.drop.transform} />}
    </>
  );
}

/** The bright band's colour for the current scheme (white ink means the bowl sits on the brand colour). */
function useShine(ink?: string): string {
  const theme = useTheme();
  if (ink?.toUpperCase() === '#FFFFFF') return markShine('inverse').shine;
  return markShine(theme.scheme).shine;
}

/**
 * The mark, drawn from @yusr/theme's geometry exactly like the website's <LogoMark>: the open bowl of ي,
 * lit from within with turquoise and gold. The box is cropped to the mark, so `size` is about its width.
 */
export function LogoMark({ size = 28, bowl, drop, logo = brand.logo }: { size?: number; bowl?: string; drop?: string; logo?: LogoGeometry }) {
  const theme = useTheme();
  const shine = useShine(bowl);
  const maskId = `dots${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox={markViewBox(logo)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MarkShapes logo={logo} bowl={bowl ?? theme.colors.primary} drop={drop ?? theme.colors.highlight} shine={shine} size={size} maskId={maskId} />
    </Svg>
  );
}

/**
 * Mark + name, as on the website: the name set in the logo face (Reem Kufi) beside the mark, or —
 * with brand.wordmark = 'lettered' — the approved lettering of «يُسر» on the mark's grid
 * (@yusr/theme wordmark.ts). `size` is the mark's size; label the parent for screen readers.
 */
export function Lockup({ size = 30, ink, drop }: { size?: number; ink?: string; drop?: string }) {
  const theme = useTheme();
  const { locale } = useI18n();
  const maskId = `lockup${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const color = ink ?? theme.colors.primary;
  const gold = drop ?? theme.colors.highlight;
  const shine = useShine(ink);
  if (locale !== 'ar' || brand.wordmark === 'typeset') {
    // The row follows the layout direction: the mark leads on the right in Arabic, on the left in English.
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LogoMark size={size} bowl={color} drop={gold} />
        <Text
          variant="title"
          color={color}
          style={{ fontFamily: theme.fonts.logo, fontSize: Math.round(size * (locale === 'ar' ? 0.84 : 0.78)), lineHeight: Math.round(size * 1.3) }}
        >
          {brand.name[locale]}
        </Text>
      </View>
    );
  }
  const scale = size / 64;
  return (
    <Svg
      width={Math.round(lockup.width * scale)}
      height={Math.round(lockup.height * scale)}
      viewBox={lockup.viewBox}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={wordmark.ink.d} fill={color} fillRule="evenodd" />
      <Path d={wordmark.damma.d} fill={gold} fillRule="evenodd" />
      <G transform={`translate(${lockup.markX} 0)`}>
        <MarkShapes logo={brand.logo} bowl={color} drop={gold} shine={shine} size={size} maskId={maskId} />
      </G>
    </Svg>
  );
}
