/**
 * Flat, two-tone icons for the home screen (order channels + quick actions).
 *
 * Each icon is a list of simple shapes on a 24×24 grid, painted in three layers:
 *   main  – the icon colour (solid)
 *   soft  – the same colour, lighter (SOFT_OPACITY)
 *   white – small highlights / details
 * Pure data (no React Native), so the same shapes render in the app (FlatIcon.tsx)
 * and in tests or previews.
 */

export type ShapePaint = 'main' | 'soft' | 'white';

export type IconShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number; paint: ShapePaint }
  | { kind: 'circle'; cx: number; cy: number; r: number; paint: ShapePaint }
  | { kind: 'path'; d: string; paint: ShapePaint }
  /** An open line drawn with round ends (no fill). */
  | { kind: 'line'; d: string; width: number; paint: ShapePaint };

/** How strong the lighter layer is. */
export const SOFT_OPACITY = 0.38;
/** White details are slightly translucent so they sit on any colour. */
export const WHITE_OPACITY = 0.9;

export const FLAT_ICONS = {
  /** New order: a receipt with a plus badge. */
  newOrder: [
    { kind: 'path', d: 'M5.5 2.5h10a1.5 1.5 0 0 1 1.5 1.5v6.2a7 7 0 0 0-6.6 10.6L8.6 21.5 7 20.4l-1.5 1.1A1.5 1.5 0 0 1 4 20V4a1.5 1.5 0 0 1 1.5-1.5z', paint: 'soft' },
    { kind: 'rect', x: 7, y: 6.5, w: 7, h: 1.8, r: 0.9, paint: 'main' },
    { kind: 'rect', x: 7, y: 10.2, w: 4.5, h: 1.8, r: 0.9, paint: 'main' },
    // Soft badge with a solid plus: readable both in white on the orange card and in colour on a tint
    { kind: 'circle', cx: 17.5, cy: 17.2, r: 5.3, paint: 'soft' },
    { kind: 'line', d: 'M17.5 14.4v5.6M14.7 17.2h5.6', width: 2.4, paint: 'main' },
  ],

  /** Dine-in: a serving cloche on a tray. */
  dineIn: [
    { kind: 'circle', cx: 12, cy: 5.6, r: 1.7, paint: 'main' },
    { kind: 'path', d: 'M3.5 16.2a8.5 8.5 0 0 1 17 0z', paint: 'main' },
    { kind: 'line', d: 'M7.4 13.6a5.2 5.2 0 0 1 3.2-3.8', width: 1.6, paint: 'white' },
    { kind: 'rect', x: 2, y: 17.2, w: 20, h: 2.8, r: 1.4, paint: 'soft' },
  ],

  /** Pickup: a shopping bag. */
  pickup: [
    { kind: 'line', d: 'M8.8 9.5V7.2a3.2 3.2 0 0 1 6.4 0v2.3', width: 1.9, paint: 'main' },
    { kind: 'path', d: 'M5.2 8.5h13.6l-1.1 12a1.6 1.6 0 0 1-1.6 1.5H7.9a1.6 1.6 0 0 1-1.6-1.5z', paint: 'main' },
    { kind: 'path', d: 'M5.2 8.5h13.6l-.25 2.8H5.45z', paint: 'soft' },
    { kind: 'circle', cx: 8.8, cy: 13.6, r: 0.95, paint: 'white' },
    { kind: 'circle', cx: 15.2, cy: 13.6, r: 0.95, paint: 'white' },
  ],

  /** Delivery: a scooter with a delivery box. */
  delivery: [
    // Delivery box resting on the deck, over the rear wheel
    { kind: 'rect', x: 3, y: 7, w: 8, h: 6.6, r: 1.4, paint: 'soft' },
    { kind: 'rect', x: 6.4, y: 7, w: 1.2, h: 6.6, paint: 'white' },
    { kind: 'path', d: 'M14.2 4.6h2.6l3 10.4h-2.4z', paint: 'main' },
    { kind: 'rect', x: 12.8, y: 3.6, w: 5.2, h: 2, r: 1, paint: 'main' },
    { kind: 'rect', x: 4, y: 13.6, w: 13.5, h: 3, r: 1.5, paint: 'main' },
    { kind: 'circle', cx: 6.2, cy: 18.6, r: 2.9, paint: 'main' },
    { kind: 'circle', cx: 18, cy: 18.6, r: 2.9, paint: 'main' },
    { kind: 'circle', cx: 6.2, cy: 18.6, r: 1.1, paint: 'white' },
    { kind: 'circle', cx: 18, cy: 18.6, r: 1.1, paint: 'white' },
  ],

  /** Kitchen: a chef's hat. */
  kitchen: [
    { kind: 'circle', cx: 7.8, cy: 9.6, r: 4, paint: 'main' },
    { kind: 'circle', cx: 16.2, cy: 9.6, r: 4, paint: 'main' },
    { kind: 'circle', cx: 12, cy: 7.2, r: 4.6, paint: 'main' },
    { kind: 'rect', x: 6.4, y: 10, w: 11.2, h: 7.6, paint: 'main' },
    { kind: 'rect', x: 9.3, y: 12.6, w: 1.3, h: 4, r: 0.65, paint: 'white' },
    { kind: 'rect', x: 13.4, y: 12.6, w: 1.3, h: 4, r: 0.65, paint: 'white' },
    { kind: 'rect', x: 5.8, y: 18, w: 12.4, h: 3.5, r: 1.3, paint: 'soft' },
  ],

  /** Live floor: a round table with four chairs, from above. */
  floor: [
    { kind: 'rect', x: 9, y: 1.8, w: 6, h: 3.6, r: 1.6, paint: 'soft' },
    { kind: 'rect', x: 9, y: 18.6, w: 6, h: 3.6, r: 1.6, paint: 'soft' },
    { kind: 'rect', x: 1.8, y: 9, w: 3.6, h: 6, r: 1.6, paint: 'soft' },
    { kind: 'rect', x: 18.6, y: 9, w: 3.6, h: 6, r: 1.6, paint: 'soft' },
    { kind: 'circle', cx: 12, cy: 12, r: 5.9, paint: 'main' },
    { kind: 'circle', cx: 12, cy: 12, r: 2.3, paint: 'white' },
  ],

  /** Bookings: a calendar with a tick. */
  bookings: [
    { kind: 'rect', x: 3, y: 4.5, w: 18, h: 17, r: 3, paint: 'soft' },
    { kind: 'path', d: 'M6 4.5h12a3 3 0 0 1 3 3v3H3v-3a3 3 0 0 1 3-3z', paint: 'main' },
    { kind: 'rect', x: 7, y: 2, w: 2.2, h: 5, r: 1.1, paint: 'main' },
    { kind: 'rect', x: 14.8, y: 2, w: 2.2, h: 5, r: 1.1, paint: 'main' },
    { kind: 'line', d: 'M8.3 15.6l2.5 2.5 4.9-5', width: 2.2, paint: 'main' },
  ],

  /** Table setup ("Add & arrange"): a table with a plus badge. */
  tables: [
    { kind: 'rect', x: 1.8, y: 7, w: 15.4, h: 3.4, r: 1.5, paint: 'main' },
    { kind: 'rect', x: 3.6, y: 9.6, w: 2.4, h: 11, r: 1.2, paint: 'main' },
    { kind: 'rect', x: 13, y: 9.6, w: 2.4, h: 6.4, r: 1.2, paint: 'main' },
    { kind: 'rect', x: 6, y: 12.2, w: 7, h: 1.8, r: 0.9, paint: 'soft' },
    { kind: 'circle', cx: 17.6, cy: 17.6, r: 4.9, paint: 'soft' },
    { kind: 'line', d: 'M17.6 15v5.2M15 17.6h5.2', width: 2.2, paint: 'main' },
  ],

  /** Riders: a rider in a helmet. */
  riders: [
    { kind: 'path', d: 'M4 21.5c0-4.6 3.6-7.4 8-7.4s8 2.8 8 7.4z', paint: 'soft' },
    { kind: 'path', d: 'M5.4 11.2a6.6 6.6 0 0 1 13.2 0v1.6H5.4z', paint: 'main' },
    { kind: 'rect', x: 8, y: 9.4, w: 8.6, h: 2.6, r: 1.3, paint: 'white' },
    { kind: 'rect', x: 4.8, y: 12.6, w: 14.4, h: 1.9, r: 0.95, paint: 'main' },
  ],

  /** Marketing: a megaphone. */
  marketing: [
    { kind: 'path', d: 'M7 14.6h3l1.1 5.2a1.1 1.1 0 0 1-1.07 1.3H8.9a1.1 1.1 0 0 1-1.07-.85z', paint: 'soft' },
    { kind: 'path', d: 'M3.8 9.2h4.4l8.8-5v15.6l-8.8-5H3.8a1.1 1.1 0 0 1-1.1-1.1V10.3a1.1 1.1 0 0 1 1.1-1.1z', paint: 'main' },
    { kind: 'line', d: 'M19.6 12h2.2M19.4 8l1.9-1.1M19.4 16l1.9 1.1', width: 1.8, paint: 'soft' },
  ],

  /** Reports: a bar chart. */
  reports: [
    { kind: 'rect', x: 3.8, y: 12, w: 4.2, h: 8, r: 1.2, paint: 'soft' },
    { kind: 'rect', x: 9.9, y: 8, w: 4.2, h: 12, r: 1.2, paint: 'soft' },
    { kind: 'rect', x: 16, y: 3.5, w: 4.2, h: 16.5, r: 1.2, paint: 'main' },
    { kind: 'rect', x: 2.4, y: 20.2, w: 19.2, h: 1.8, r: 0.9, paint: 'main' },
  ],
} satisfies Record<string, IconShape[]>;

export type FlatIconName = keyof typeof FLAT_ICONS;

/** The icon as standalone SVG markup (previews, tests). */
export function flatIconSvg(name: FlatIconName, color: string, size = 24): string {
  const fill = (paint: ShapePaint) =>
    paint === 'white'
      ? `fill="#FFFFFF" fill-opacity="${WHITE_OPACITY}"`
      : `fill="${color}"${paint === 'soft' ? ` fill-opacity="${SOFT_OPACITY}"` : ''}`;
  const stroke = (paint: ShapePaint) =>
    paint === 'white'
      ? `stroke="#FFFFFF" stroke-opacity="${WHITE_OPACITY}"`
      : `stroke="${color}"${paint === 'soft' ? ` stroke-opacity="${SOFT_OPACITY}"` : ''}`;
  const body = (FLAT_ICONS[name] as readonly IconShape[])
    .map((s) => {
      switch (s.kind) {
        case 'rect':
          return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r ?? 0}" ${fill(s.paint)}/>`;
        case 'circle':
          return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" ${fill(s.paint)}/>`;
        case 'path':
          return `<path d="${s.d}" ${fill(s.paint)}/>`;
        case 'line':
          return `<path d="${s.d}" fill="none" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round" ${stroke(s.paint)}/>`;
      }
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`;
}
