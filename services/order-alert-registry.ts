/**
 * Single source of truth for "has this new order already been alerted?".
 *
 * New orders reach the app through three independent channels: the WebSocket,
 * the polling fallback in SocketContext and push notifications. Each of them
 * buzzes and auto-prints, so without a shared registry the same order would be
 * alerted once per channel (e.g. WebSocket now, polling 60s later).
 */

// Long enough to cover any order that is still sitting in "placed"
const ALERT_TTL_MS = 6 * 60 * 60 * 1000;

const alertedAt = new Map<string, number>();

function prune(now: number) {
  for (const [id, at] of alertedAt) {
    if (now - at > ALERT_TTL_MS) alertedAt.delete(id);
  }
}

/**
 * Atomically claims the alert for an order. Returns true only for the first
 * caller; later callers (other channels) must skip buzz and auto-print.
 * Orders without an id cannot be de-duplicated and are always allowed.
 */
export function claimOrderAlert(orderId: unknown, now = Date.now()): boolean {
  if (orderId === undefined || orderId === null || orderId === '') return true;
  const key = String(orderId);
  prune(now);
  if (alertedAt.has(key)) return false;
  alertedAt.set(key, now);
  return true;
}

/** Marks orders as already seen without alerting (e.g. the backlog on first sync). */
export function markOrdersSeen(orderIds: unknown[], now = Date.now()) {
  for (const id of orderIds) {
    if (id !== undefined && id !== null && id !== '') alertedAt.set(String(id), now);
  }
}

export function resetOrderAlertRegistry() {
  alertedAt.clear();
}
