import { getOrderItemsCost } from '../services/payout.service';

jest.mock('../services/api', () => ({ apiRequest: jest.fn() }));

describe('getOrderItemsCost (must match the server payout rule)', () => {
  it('uses pricing.subtotal when present', () => {
    expect(getOrderItemsCost({ pricing: { subtotal: 12.5, totalAmount: 15 } } as any)).toBe(12.5);
  });
  it('treats a subtotal of 0 as a real value', () => {
    expect(getOrderItemsCost({ pricing: { subtotal: 0 }, orderedItems: [{ itemTotal: 9 }] } as any)).toBe(0);
  });
  it('falls back to item totals, then basePrice × quantity', () => {
    expect(
      getOrderItemsCost({ pricing: { totalAmount: 7 }, orderedItems: [{ itemTotal: 3 }, { basePrice: 2, quantity: 2 }] } as any)
    ).toBe(7);
  });
  it('returns 0 for an order without pricing or items', () => {
    expect(getOrderItemsCost({} as any)).toBe(0);
  });
});
