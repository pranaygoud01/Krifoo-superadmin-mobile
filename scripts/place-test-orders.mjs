#!/usr/bin/env node
/**
 * Places N cash "pickup" test orders for one restaurant AT THE SAME MOMENT,
 * to test new-order alerts and auto-printing on the admin app during a rush.
 *
 * Usage (Node 18+, no dependencies):
 *   node scripts/place-test-orders.mjs --restaurant <restaurantId> [options]
 *
 * Options:
 *   --restaurant <id>   Restaurant to order from (required). Use a TEST restaurant.
 *   --count <n>         Number of orders (default 10, max 30)
 *   --api <url>         API base URL (default https://apiv1.krifoo.co.uk)
 *   --item <id>         Menu item to order (default: first simple available item on the menu)
 *   --email <address>   Guest email on the orders (order emails are sent here)
 *   --stagger <ms>      Delay between orders instead of all at once (default 0)
 *   --yes               Skip the confirmation prompt
 *   --cancel            Cancel the orders created by the last run (read from scripts/.test-orders-last.json)
 *
 * Examples:
 *   node scripts/place-test-orders.mjs --restaurant 665f1c... --count 10
 *   node scripts/place-test-orders.mjs --cancel
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const LAST_RUN_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.test-orders-last.json');
const DEFAULT_API = 'https://apiv1.krifoo.co.uk';
const MAX_COUNT = 30;

/* ── args ─────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const args = { count: 10, api: DEFAULT_API, stagger: 0, yes: false, cancel: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) fail(`Missing value for ${a}`);
      return v;
    };
    if (a === '--restaurant') args.restaurant = next();
    else if (a === '--count') args.count = Number(next());
    else if (a === '--api') args.api = next().replace(/\/+$/, '');
    else if (a === '--item') args.item = next();
    else if (a === '--email') args.email = next();
    else if (a === '--stagger') args.stagger = Number(next());
    else if (a === '--yes') args.yes = true;
    else if (a === '--cancel') args.cancel = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node scripts/place-test-orders.mjs --restaurant <id> [--count 10] [--api URL] [--item id] [--email addr] [--stagger ms] [--yes]\n' +
          '       node scripts/place-test-orders.mjs --cancel'
      );
      process.exit(0);
    } else fail(`Unknown option: ${a} (see --help)`);
  }
  return args;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/* ── http ─────────────────────────────────────────────────────────────── */

async function api(base, method, route, body) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok && json?.success !== false, json, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, ok: false, json: { message: err.name === 'TimeoutError' ? 'timed out after 30s' : err.message }, ms: Date.now() - started };
  }
}

/* ── menu item choice ─────────────────────────────────────────────────── */

/** A plain item that can be ordered for collection without choosing options. */
function isSimpleItem(item) {
  // Variant groups (size etc.) have no "optional" flag: treat any with options as a required choice
  const requiredChoice = (item.variantGroups || []).some((g) => (g?.variants || []).length > 0);
  const requiredAddon = (item.addonGroups || []).some((g) => g?.customizationBehavior === 'compulsory' || (g?.minSelection || 0) > 0);
  return (
    item.isAvailable !== false &&
    item.availableForCollection !== false &&
    (item.pricingType || 'fixed') === 'fixed' &&
    (item.minimumQuantity || 1) === 1 &&
    (item.stock === null || item.stock === undefined || item.stock >= 50) &&
    !requiredChoice &&
    !requiredAddon
  );
}

/* ── cancel ───────────────────────────────────────────────────────────── */

async function cancelLastRun(args) {
  let last;
  try {
    last = JSON.parse(await readFile(LAST_RUN_FILE, 'utf8'));
  } catch {
    fail(`No previous run found (${path.basename(LAST_RUN_FILE)}).`);
  }
  const base = args.api !== DEFAULT_API ? args.api : last.api;
  console.log(`\nCancelling ${last.orders.length} test orders from ${last.createdAt} on ${base} …\n`);
  const results = await Promise.all(last.orders.map((o) => api(base, 'PATCH', `/api/orders/${o.orderId}/cancel`)));
  let cancelled = 0;
  results.forEach((r, i) => {
    const o = last.orders[i];
    if (r.ok) cancelled++;
    console.log(`  #${String(o.orderNumber).padEnd(6)} ${r.ok ? '✔ cancelled' : `✖ ${r.json?.message || `HTTP ${r.status}`}`}`);
  });
  console.log(`\n${cancelled}/${last.orders.length} cancelled.`);
  if (cancelled < last.orders.length) {
    console.log('Orders that were already accepted cannot be cancelled here — reject or complete them in the admin app.');
  }
}

/* ── main ─────────────────────────────────────────────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cancel) return cancelLastRun(args);

  if (!args.restaurant) fail('--restaurant <restaurantId> is required. Use a TEST restaurant.');
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > MAX_COUNT) fail(`--count must be 1–${MAX_COUNT}.`);
  if (!Number.isFinite(args.stagger) || args.stagger < 0) fail('--stagger must be 0 or more (milliseconds).');

  // 1. Restaurant
  const rest = await api(args.api, 'GET', `/api/restaurants/${args.restaurant}`);
  if (!rest.ok) fail(`Restaurant not found on ${args.api}: ${rest.json?.message || `HTTP ${rest.status}`}`);
  const restaurant = rest.json.data?.restaurant || rest.json.data || {};
  const restaurantName = restaurant.restaurantName || '(unnamed)';

  // 2. Menu item
  let item;
  const menu = await api(args.api, 'GET', `/api/menu-items/restaurant/${args.restaurant}?isAvailable=true`);
  const items = Array.isArray(menu.json?.data) ? menu.json.data : [];
  if (args.item) {
    item = items.find((m) => String(m._id) === args.item) || { _id: args.item, itemName: args.item };
  } else {
    item = items.find(isSimpleItem);
    if (!item) fail('No simple available menu item found (no required options, collection allowed). Pass one with --item <menuItemId>.');
  }
  const price = item.collectionPrice ?? item.basePrice;

  // 3. Confirm — these are real orders with real side effects
  const isLive = /krifoo\.co\.uk/i.test(args.api);
  console.log(`
About to place ${args.count} test orders ${args.stagger ? `(${args.stagger} ms apart)` : 'AT THE SAME MOMENT'}
  API:         ${args.api}${isLive ? '   ⚠ LIVE SERVER' : ''}
  Restaurant:  ${restaurantName} (${args.restaurant})
  Item:        1 × ${item.itemName}${price !== undefined ? ` (£${Number(price).toFixed(2)})` : ''}
  Order type:  Pickup, pay at counter (cash)
  Guest email: ${args.email || 'printer-test@example.com'}

Each order is a real order: it triggers the restaurant's push, socket alert and auto-print,
and the backend also sends its usual WhatsApp / SMS / email notifications for new orders.
Afterwards, cancel them with:  node scripts/place-test-orders.mjs --cancel
`);
  if (!args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`Type the restaurant name to continue ("${restaurantName}"): `)).trim();
    rl.close();
    if (answer.toLowerCase() !== restaurantName.toLowerCase()) fail('Name did not match — nothing was placed.');
  }

  // 4. Place the orders
  const runId = new Date().toISOString().slice(11, 19);
  const body = (n) => ({
    cartType: 'foodCart',
    orderType: 'pickup',
    collectionTime: 'immediate',
    paymentType: 'cash',
    customerName: `Printer Test ${n}/${args.count}`,
    customerEmail: args.email || 'printer-test@example.com',
    notes: `PRINTER TEST ${n}/${args.count} (run ${runId}) — please ignore / cancel`,
    items: [{ menuItemId: item._id, quantity: 1 }],
  });

  console.log(`\nPlacing ${args.count} orders…`);
  const started = Date.now();
  const jobs = Array.from({ length: args.count }, (_, i) =>
    new Promise((r) => setTimeout(r, i * args.stagger)).then(() => api(args.api, 'POST', '/api/orders/place-cash-order', body(i + 1)))
  );
  const results = await Promise.all(jobs);
  const totalMs = Date.now() - started;

  // 5. Report
  const created = [];
  console.log('');
  results.forEach((r, i) => {
    const order = r.json?.data;
    if (r.ok && order?._id) {
      created.push({ orderId: order._id, orderNumber: order.orderNumber, status: order.status });
      console.log(`  ${String(i + 1).padStart(2)}. ✔ #${String(order.orderNumber).padEnd(6)} ${order.status.padEnd(10)} ${r.ms} ms`);
    } else {
      console.log(`  ${String(i + 1).padStart(2)}. ✖ HTTP ${r.status}: ${r.json?.message || 'no response'} (${r.ms} ms)`);
    }
  });

  const numbers = created.map((o) => Number(o.orderNumber)).filter(Number.isFinite);
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  console.log(`\n${created.length}/${args.count} placed in ${totalMs} ms.`);
  if (duplicates.length) console.log(`⚠ Duplicate order numbers: ${[...new Set(duplicates)].join(', ')}`);
  if (created.some((o) => o.status === 'preparing')) {
    console.log('Note: this restaurant auto-approves orders, so they are already "preparing".');
  }

  if (created.length) {
    await writeFile(LAST_RUN_FILE, JSON.stringify({ api: args.api, restaurant: args.restaurant, createdAt: new Date().toISOString(), orders: created }, null, 2));
    console.log(`
Now check on the admin device:
  • one buzz/notification per order (not repeated)
  • ${created.length} tickets, each printed exactly once: ${created.map((o) => `#${o.orderNumber}`).join(', ')}

When done:  node scripts/place-test-orders.mjs --cancel
`);
  }
}

main().catch((err) => fail(err?.stack || String(err)));
