import { createGroupedReload } from '../utils/grouped-reload';

describe('createGroupedReload (Super Admin home reloads)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reloads at once for the first change after a quiet spell', () => {
    const reload = jest.fn();
    createGroupedReload(reload, 15000).request();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('turns a burst of 50 order changes into one more reload at the end of the interval', () => {
    const reload = jest.fn();
    const g = createGroupedReload(reload, 15000);
    g.request(); // immediate
    for (let i = 0; i < 50; i++) {
      jest.advanceTimersByTime(200);
      g.request();
    }
    expect(reload).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(15000);
    expect(reload).toHaveBeenCalledTimes(2); // the latest change is still picked up
  });

  it('never reloads more often than the interval', () => {
    const reload = jest.fn();
    const g = createGroupedReload(reload, 15000);
    for (let t = 0; t < 60000; t += 1000) {
      g.request();
      jest.advanceTimersByTime(1000);
    }
    expect(reload.mock.calls.length).toBeLessThanOrEqual(5); // 60 s / 15 s, +1 for the first
  });

  it('cancel stops a scheduled reload (screen closed)', () => {
    const reload = jest.fn();
    const g = createGroupedReload(reload, 15000);
    g.request();
    g.request(); // scheduled
    g.cancel();
    jest.advanceTimersByTime(20000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
