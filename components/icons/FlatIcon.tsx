/**
 * Flat, two-tone icons (see flat-icon-shapes.ts for the artwork).
 * Same props as lucide icons (`size`, `color`), so they drop into ChannelCard / QuickActions.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { FLAT_ICONS, FlatIconName, IconShape, ShapePaint, SOFT_OPACITY, WHITE_OPACITY } from './flat-icon-shapes';

export interface FlatIconProps {
  size?: number;
  color?: string;
  /** Accepted for lucide compatibility; flat icons are filled, so it is ignored. */
  strokeWidth?: number;
}

function paintProps(paint: ShapePaint, color: string, mode: 'fill' | 'stroke') {
  const value = paint === 'white' ? '#FFFFFF' : color;
  const opacity = paint === 'white' ? WHITE_OPACITY : paint === 'soft' ? SOFT_OPACITY : 1;
  return mode === 'fill' ? { fill: value, fillOpacity: opacity } : { stroke: value, strokeOpacity: opacity, fill: 'none' };
}

function renderShape(shape: IconShape, color: string, key: number) {
  switch (shape.kind) {
    case 'rect':
      return <Rect key={key} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r ?? 0} {...paintProps(shape.paint, color, 'fill')} />;
    case 'circle':
      return <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...paintProps(shape.paint, color, 'fill')} />;
    case 'path':
      return <Path key={key} d={shape.d} {...paintProps(shape.paint, color, 'fill')} />;
    case 'line':
      return (
        <Path
          key={key}
          d={shape.d}
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...paintProps(shape.paint, color, 'stroke')}
        />
      );
  }
}

export function FlatIcon({ name, size = 24, color = '#11181C' }: FlatIconProps & { name: FlatIconName }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" testID={`flat-icon-${name}`}>
      {(FLAT_ICONS[name] as readonly IconShape[]).map((shape, i) => renderShape(shape, color, i))}
    </Svg>
  );
}

/** A named icon component with the lucide-style signature. */
function make(name: FlatIconName) {
  const Icon = (props: FlatIconProps) => <FlatIcon name={name} {...props} />;
  Icon.displayName = `FlatIcon(${name})`;
  return Icon;
}

export const NewOrderIcon = make('newOrder');
export const DineInIcon = make('dineIn');
export const PickupIcon = make('pickup');
export const DeliveryIcon = make('delivery');
export const KitchenIcon = make('kitchen');
export const FloorIcon = make('floor');
export const BookingsIcon = make('bookings');
export const TablesIcon = make('tables');
export const RidersIcon = make('riders');
export const MarketingIcon = make('marketing');
export const ReportsIcon = make('reports');
