import { brand, lockup, wordmark, type LogoGeometry } from '@yusr/theme';
import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Mask, Path, Rect } from 'react-native-svg';
import { Text } from '@/components/Text';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** The mark's shapes on its 64-unit grid: the open bowl of ي, its two dots and the golden ḍamma. */
function MarkShapes({ logo, bowl, drop, size, maskId }: { logo: LogoGeometry; bowl: string; drop: string; size: number; maskId: string }) {
  const small = size < logo.dotsMinSize;
  const cutout = logo.dots.style === 'cutout' && !small;
  const [first, second] = logo.dots.items;
  return (
    <>
      {cutout && (
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
      {logo.dots.style === 'solid' &&
        (small ? (
          <Line x1={first.cx} y1={first.cy} x2={second.cx} y2={second.cy} stroke={bowl} strokeWidth={first.r * 2} strokeLinecap="round" />
        ) : (
          logo.dots.items.map((dot) => <Circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={bowl} />)
        ))}
      <Path d={logo.drop.d} fill={drop} transform={logo.drop.transform} />
    </>
  );
}

/**
 * The mark, drawn from @yusr/theme's geometry exactly like the website's <LogoMark>:
 * the open bowl of ي, its two dots and the golden ḍamma.
 */
export function LogoMark({ size = 28, bowl, drop, logo = brand.logo }: { size?: number; bowl?: string; drop?: string; logo?: LogoGeometry }) {
  const theme = useTheme();
  const maskId = `dots${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox={logo.viewBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MarkShapes logo={logo} bowl={bowl ?? theme.colors.primary} drop={drop ?? theme.colors.highlight} size={size} maskId={maskId} />
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
        <MarkShapes logo={brand.logo} bowl={color} drop={gold} size={size} maskId={maskId} />
      </G>
    </Svg>
  );
}
