/**
 * Shared rules for keeping a Bluetooth printer connection open during a rush.
 *
 * Connecting to a Bluetooth printer takes ~2–4 s, and the transports used to connect and
 * disconnect for every receipt (and every copy). With 10–20 orders at once that was most of
 * the printing time. Now a connection stays open while jobs keep coming and closes after a
 * short quiet spell.
 *
 * The quiet spell is kept short on purpose: many Bluetooth printers accept only ONE connection,
 * so while this device holds it, another tablet sharing the printer can't print (its job fails
 * and is retried automatically).
 */

/** Close the connection after this long with no print jobs. */
export const BLUETOOTH_IDLE_CLOSE_MS = 15000;

/** Longest a Bluetooth connect may take before it counts as failed. */
export const BLUETOOTH_CONNECT_TIMEOUT_MS = 12000;

/** Rejects with `message` if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
