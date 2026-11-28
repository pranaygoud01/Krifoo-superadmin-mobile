/**
 * Groups bursts of "something changed" signals into at most one reload per `intervalMs`.
 *
 * The first signal after a quiet spell reloads right away; signals during the interval
 * schedule ONE more reload at the end of it (so the latest change is always picked up).
 * Used by the Super Admin home screen, which hears about every order change on the platform
 * and reloads every order each time.
 */
export function createGroupedReload(reload: () => void, intervalMs: number, now: () => number = Date.now) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = -Infinity;

  const run = () => {
    timer = null;
    lastRun = now();
    reload();
  };

  return {
    /** Something changed: reload now, or once at the end of the current interval. */
    request() {
      if (timer) return; // a reload is already scheduled
      const wait = lastRun + intervalMs - now();
      if (wait <= 0) run();
      else timer = setTimeout(run, wait);
    },
    /** Stop any scheduled reload (screen closed). */
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
