import type { Order } from '../types';
import { getOrderScheduleInfo } from '../services/printer/receipt-document';
import { getOrderFulfillmentType } from './order-fulfillment';
import { getScheduledDeadline, isOrderActionNeeded } from './order-timing';

/**
 * Kitchen Mode board rules.
 *
 *  New      – `placed` (awaiting acceptance). "Start cooking" accepts it (→ preparing).
 *  Cooking  – `confirmed` / `preparing`.
 *  Ready    – `ready_for_pickup`, plus delivery orders the kitchen marked ready on this
 *             device (the server has no "cooked, waiting for rider" status, so those stay
 *             `preparing` until the manager sends them out for delivery).
 *  Upcoming – scheduled orders more than 15 minutes away; they join the columns after that.
 */

export type KitchenStage = 'new' | 'cooking' | 'ready';

export type KitchenAction =
  | { kind: 'status'; status: 'preparing' | 'ready_for_pickup' | 'delivered'; label: string }
  | { kind: 'local_ready'; label: string };

export interface KitchenBoard {
  upcoming: Order[];
  new: Order[];
  cooking: Order[];
  ready: Order[];
}

const MINUTE = 60_000;
export const UPCOMING_WINDOW_MS = 15 * MINUTE;

const COOKING_STATUSES = ['confirmed', 'preparing'];

const toMs = (v: unknown) => {
  const ms = v ? new Date(v as any).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

/** When the order entered the kitchen flow: accepted time for accepted orders, else placed time. */
export const getKitchenStartMs = (order: Order) => toMs(order.acceptedAt) || toMs(order.createdAt);

export function getKitchenStage(order: Order, readyDeliveryIds: ReadonlySet<string>): KitchenStage | null {
  if (order.status === 'placed') return 'new';
  if (COOKING_STATUSES.includes(order.status)) return readyDeliveryIds.has(order._id) ? 'ready' : 'cooking';
  if (order.status === 'ready_for_pickup') return 'ready';
  return null; // out for delivery, delivered, cancelled, awaiting payment…
}

/** Scheduled order whose time is still more than 15 minutes away. */
export function isUpcoming(order: Order, now: number): boolean {
  if (!getOrderScheduleInfo(order).isScheduled) return false;
  const deadline = getScheduledDeadline(order);
  return deadline !== null && deadline - now > UPCOMING_WINDOW_MS;
}

export function buildKitchenBoard(orders: Order[], now: number, readyDeliveryIds: ReadonlySet<string>): KitchenBoard {
  const board: KitchenBoard = { upcoming: [], new: [], cooking: [], ready: [] };

  for (const order of orders) {
    const stage = getKitchenStage(order, readyDeliveryIds);
    if (!stage) continue;
    if (stage !== 'ready' && isUpcoming(order, now)) board.upcoming.push(order);
    else board[stage].push(order);
  }

  // Overdue first, then oldest first.
  const byUrgency = (a: Order, b: Order) => {
    const lateA = isOrderActionNeeded(a, now) ? 0 : 1;
    const lateB = isOrderActionNeeded(b, now) ? 0 : 1;
    if (lateA !== lateB) return lateA - lateB;
    return getKitchenStartMs(a) - getKitchenStartMs(b);
  };
  board.new.sort(byUrgency);
  board.cooking.sort(byUrgency);
  board.ready.sort(byUrgency);
  board.upcoming.sort((a, b) => (getScheduledDeadline(a) ?? 0) - (getScheduledDeadline(b) ?? 0));
  return board;
}

/** The single big button on a ticket. Mirrors the status flow used on the Orders board. */
export function getKitchenAction(order: Order, stage: KitchenStage): KitchenAction | null {
  if (stage === 'new') return { kind: 'status', status: 'preparing', label: 'Start cooking' };
  if (stage === 'ready') return null;

  const type = getOrderFulfillmentType(order);
  if (type === 'dine_in') return { kind: 'status', status: 'delivered', label: 'Served' };
  if (type === 'delivery') return { kind: 'local_ready', label: 'Ready' };
  return { kind: 'status', status: 'ready_for_pickup', label: 'Ready' };
}

export function getReadyLabel(order: Order): string {
  return getOrderFulfillmentType(order) === 'delivery' ? 'Waiting for rider' : 'Waiting for customer';
}

/** Items in a kitchen-friendly shape. */
export function getKitchenItems(order: Order): { name: string; quantity: number; instructions?: string; raw: any }[] {
  const list: any[] = (order.orderedItems?.length ? order.orderedItems : order.items) || [];
  const nested = (v: any) => (v && typeof v === 'object' ? v.name || v.itemName : undefined);
  return list.map((item) => ({
    name:
      item?.name || item?.itemName || item?.title || item?.dishName || item?.productName ||
      nested(item?.menuItemId) || nested(item?.itemId) || nested(item?.menuItem) || 'Item',
    quantity: Number(item?.quantity || item?.qty) || 1,
    instructions: typeof item?.instructions === 'string' && item.instructions.trim() ? item.instructions.trim() : undefined,
    raw: item,
  }));
}
