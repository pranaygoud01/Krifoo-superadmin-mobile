/**
 * POS layout for any screen size (phones, phones in landscape, small and large tablets, desktops).
 *  - split: menu and ticket side by side (otherwise Menu / Ticket tabs, like a phone)
 *  - rail:  dark category sidebar (otherwise category chips above the menu)
 *  - ticket: a set width, so it never balloons on big screens or gets squeezed on small ones
 *  - top bar: the order-type switch takes the free space but never pushes out the brand or Exit
 */
export interface PosLayout {
  split: boolean;
  rail: boolean;
  railWidth: number;
  ticketWidth: number;
  showClock: boolean;
  showName: boolean;
  /** Text on the Clear / Exit buttons (icons only when narrow) */
  buttonLabels: boolean;
  /** Smallest comfortable dish tile */
  minTile: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function posLayout(width: number, height: number): PosLayout {
  // Phones in landscape are wide but short: keep the tabbed phone layout there
  const split = width >= 700 && height >= 480;
  const rail = split && width >= 960;
  return {
    split,
    rail,
    railWidth: width >= 1200 ? 156 : 132,
    ticketWidth: split ? clamp(Math.round(width * 0.32), 300, 420) : width,
    showClock: width >= 1000,
    showName: width >= 820 || !split,
    buttonLabels: width >= 1100,
    minTile: split ? 168 : 148,
  };
}

/** How many dish tiles fit in a row, and how wide each is. */
export function gridColumns(available: number, minTile: number, gap: number, maxCols = 6): { cols: number; tileWidth: number } {
  if (available <= 0) return { cols: 2, tileWidth: 0 };
  const cols = clamp(Math.floor((available + gap) / (minTile + gap)), 2, maxCols);
  return { cols, tileWidth: Math.floor((available - gap * (cols - 1)) / cols) };
}
