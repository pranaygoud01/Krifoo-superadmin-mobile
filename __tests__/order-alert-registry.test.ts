import {
  claimOrderAlert,
  markOrdersSeen,
  resetOrderAlertRegistry,
} from '../services/order-alert-registry';

describe('order alert registry', () => {
  beforeEach(() => resetOrderAlertRegistry());

  it('lets only the first channel alert an order', () => {
    expect(claimOrderAlert('o1')).toBe(true);
    expect(claimOrderAlert('o1')).toBe(false);
    expect(claimOrderAlert('o2')).toBe(true);
  });

  it('treats numeric and string ids as the same order', () => {
    expect(claimOrderAlert(42)).toBe(true);
    expect(claimOrderAlert('42')).toBe(false);
  });

  it('always allows orders without an id (cannot be de-duplicated)', () => {
    expect(claimOrderAlert(undefined)).toBe(true);
    expect(claimOrderAlert(undefined)).toBe(true);
    expect(claimOrderAlert('')).toBe(true);
  });

  it('does not alert orders marked as seen', () => {
    markOrdersSeen(['a', undefined, 'b']);
    expect(claimOrderAlert('a')).toBe(false);
    expect(claimOrderAlert('b')).toBe(false);
  });

  it('forgets orders after the TTL', () => {
    const t0 = 1_000_000;
    expect(claimOrderAlert('o1', t0)).toBe(true);
    expect(claimOrderAlert('o1', t0 + 60 * 60 * 1000)).toBe(false);
    expect(claimOrderAlert('o1', t0 + 7 * 60 * 60 * 1000)).toBe(true);
  });
});
