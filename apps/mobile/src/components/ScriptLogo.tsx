import { SCRIPT_LOGO, SCRIPT_LOGO_COLORS } from '@yusr/theme';
import Svg, { Path } from 'react-native-svg';

/**
 * «خطّ اليُسر»: the logo, «يُسر» written by hand, in its own green with the orange ḍamma, as on the website
 * (@yusr/ui ScriptLogo), drawn from @yusr/theme's geometry. `height` sets the size; the width follows.
 * Decorative: label the parent for screen readers.
 */
export function ScriptLogo({ height = 36 }: { height?: number }) {
  const width = Math.round((height * SCRIPT_LOGO.width) / SCRIPT_LOGO.height);
  return (
    <Svg width={width} height={height} viewBox={SCRIPT_LOGO.viewBox} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SCRIPT_LOGO.parts.map((part) => (
        <Path key={part.id} d={part.fill} fill={SCRIPT_LOGO_COLORS[part.color].dark} />
      ))}
    </Svg>
  );
}
