import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FLAT_ICONS, FlatIconName, IconShape, flatIconSvg } from '../components/icons/flat-icon-shapes';
import { FlatIcon, KitchenIcon, NewOrderIcon } from '../components/icons/FlatIcon';
import { QuickActions } from '../components/home/QuickActions';

const names = Object.keys(FLAT_ICONS) as FlatIconName[];

/** Every point a shape covers, to check it stays on the 24×24 grid. */
function bounds(s: IconShape): number[] {
  switch (s.kind) {
    case 'rect':
      return [s.x, s.y, s.x + s.w, s.y + s.h];
    case 'circle':
      return [s.cx - s.r, s.cy - s.r, s.cx + s.r, s.cy + s.r];
    default:
      // path / line: every number in the path data is a coordinate or a relative offset; the
      // absolute ones (after M / L / H / V) must be on the grid — a loose but useful check
      return (s.d.match(/[MLHV]\s*-?[\d.]+(?:[\s,]+-?[\d.]+)?/g) || [])
        .flatMap((cmd) => cmd.slice(1).trim().split(/[\s,]+/).map(Number));
  }
}

describe('Flat icons', () => {
  it.each(names)('%s stays inside the 24×24 grid', (name) => {
    for (const shape of FLAT_ICONS[name] as readonly IconShape[]) {
      for (const v of bounds(shape)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(24);
      }
    }
  });

  it.each(names)('%s has a solid main layer (so it reads at small sizes)', (name) => {
    expect((FLAT_ICONS[name] as readonly IconShape[]).some((s) => s.paint === 'main')).toBe(true);
  });

  it('renders every icon at the requested size', async () => {
    await render(
      <>
        {names.map((n) => (
          <FlatIcon key={n} name={n} size={30} color="#1D4ED8" />
        ))}
      </>
    );
    for (const n of names) {
      const svg = screen.getByTestId(`flat-icon-${n}`);
      expect(svg.props.width ?? svg.props.style?.width).toBeDefined();
    }
  });

  it('works as a drop-in icon for quick actions (lucide-style props)', async () => {
    await render(
      <QuickActions
        items={[
          { key: 'k', label: 'Kitchen', icon: KitchenIcon, tone: 'orange', onPress: jest.fn() },
          { key: 'n', label: 'New', icon: NewOrderIcon, onPress: jest.fn() },
        ]}
      />
    );
    expect(screen.getByTestId('flat-icon-kitchen')).toBeTruthy();
    expect(screen.getByTestId('flat-icon-newOrder')).toBeTruthy();
  });

  it('exports standalone SVG with the colour applied to every layer', () => {
    const svg = flatIconSvg('bookings', '#1D4ED8', 48);
    expect(svg).toMatch(/^<svg [^>]*width="48"[^>]*viewBox="0 0 24 24"/);
    expect(svg).toContain('fill="#1D4ED8"');
    expect(svg).toContain('fill-opacity="0.38"'); // soft layer
    expect(svg).not.toContain('undefined');
  });
});
