import { DIRECTIONAL_ICONS, ICON_NODES, type IconName, type IconNode } from '@yusr/ui/icons';
import type { ComponentType } from 'react';
import { I18nManager } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

/** react-native-svg's shapes take SVG attributes as props; the icon data (@yusr/ui/icons) supplies them as strings. */
type Shape = ComponentType<Record<string, string | number>>;
export const SVG_SHAPES = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, polygon: Polygon, ellipse: Ellipse } as unknown as Record<
  IconNode[0],
  Shape
>;

/** The website's icon set (same data, @yusr/ui/icons) drawn with react-native-svg; arrows mirror in RTL. */
export function Icon({ name, size = 20, color, strokeWidth = 1.8 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const mirror = DIRECTIONAL_ICONS.has(name) && I18nManager.isRTL;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={mirror ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      {ICON_NODES[name].map(([tag, attrs], index) => {
        const Shape = SVG_SHAPES[tag];
        return <Shape key={index} {...attrs} />;
      })}
    </Svg>
  );
}
