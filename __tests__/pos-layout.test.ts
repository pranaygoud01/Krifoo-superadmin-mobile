import { gridColumns, posLayout } from '../utils/pos-layout';

describe('POS layout by screen size', () => {
  it('phones (portrait and landscape) use the tabbed layout', () => {
    expect(posLayout(390, 844).split).toBe(false);
    expect(posLayout(844, 390).split).toBe(false); // landscape phone: wide but short
  });

  it('small tablets split menu and ticket, with category chips', () => {
    const l = posLayout(820, 1180); // iPad Air portrait
    expect(l.split).toBe(true);
    expect(l.rail).toBe(false);
    expect(l.ticketWidth).toBe(300);
  });

  it('large tablets add the category sidebar and keep the ticket a set width', () => {
    const l = posLayout(1280, 890); // the reported iPad landscape
    expect(l).toMatchObject({ split: true, rail: true, railWidth: 156, ticketWidth: 410, showClock: true, buttonLabels: true });
    expect(posLayout(1920, 1080).ticketWidth).toBe(420); // never wider than 420
  });

  it('narrow split screens drop the clock and button text, not the buttons', () => {
    const l = posLayout(768, 1024);
    expect(l.showClock).toBe(false);
    expect(l.buttonLabels).toBe(false);
  });
});

describe('dish grid', () => {
  it('fits as many tiles as the space allows (2 to 6)', () => {
    expect(gridColumns(340, 148, 12).cols).toBe(2);
    expect(gridColumns(560, 168, 12).cols).toBe(3);
    expect(gridColumns(900, 168, 12).cols).toBe(5);
    expect(gridColumns(3000, 168, 12).cols).toBe(6);
  });

  it('tiles fill the row exactly', () => {
    const { cols, tileWidth } = gridColumns(560, 168, 12);
    expect(cols * tileWidth + (cols - 1) * 12).toBeLessThanOrEqual(560);
  });
});
