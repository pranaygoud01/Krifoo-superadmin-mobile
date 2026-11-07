import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildCustomizedReceiptDocument,
  computeReceiptTotals,
  getOrderFulfillmentLabel,
  getPaymentInfo,
  isDineInOrder,
  ReceiptCommand,
} from '../services/printer/receipt-document';
import { EscPosEncoder } from '../services/printer/encoders/escpos-encoder';
import { EposXmlEncoder } from '../services/printer/encoders/epos-xml-encoder';
import { renderReceiptLines } from '../services/printer/encoders/receipt-lines';
import { encodeCp858 } from '../services/printer/encoders/text-utils';
import {
  DEFAULT_RECEIPT_TEMPLATE,
  DINE_IN_INVOICE_TEMPLATE,
  cloneTemplate,
  deleteReceiptTemplate,
  getActiveReceiptTemplate,
  getAllReceiptTemplates,
  normalizeTemplate,
  saveReceiptTemplate,
} from '../services/receipt-customization.service';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const baseOrder = {
  _id: 'o1',
  orderNumber: 'ORD-ID-42',
  orderType: 'delivery',
  createdAt: '2026-11-07T12:30:00.000Z',
  restaurantName: 'Test Kitchen',
  customerDetails: { name: 'Sam', phoneNumber: '07123456789' },
  deliveryAddress: { formattedAddress: '1 High St, Cambridge', postalCode: 'CB1 1AA' },
  orderedItems: [
    { name: 'Chicken Tikka Masala With Extra Garlic Naan And Rice', quantity: 2, itemTotal: 1234.56 },
  ],
  pricing: { subtotal: 1234.56, total: 1234.56 },
  paymentType: 'card',
  paymentStatus: 'paid',
};

const textLines = (doc: ReceiptCommand[], width: '58mm' | '80mm') =>
  renderReceiptLines(doc, width).filter((l) => l.kind === 'text') as Array<{ text: string; columns: number }>;

describe('receipt builder', () => {
  it('never prints a line wider than the paper (58mm and 80mm)', () => {
    for (const paperWidth of ['58mm', '80mm'] as const) {
      const doc = buildCustomizedReceiptDocument(baseOrder, { paperWidth }, DEFAULT_RECEIPT_TEMPLATE);
      for (const line of textLines(doc, paperWidth)) {
        expect(line.text.length).toBeLessThanOrEqual(line.columns);
      }
    }
  });

  it('keeps a space between a long item name and its price', () => {
    const doc = buildCustomizedReceiptDocument(baseOrder, { paperWidth: '58mm' }, DEFAULT_RECEIPT_TEMPLATE);
    const lines = textLines(doc, '58mm');
    const idx = lines.findIndex((l) => l.text.includes('£1234.56'));
    // Price is right-aligned with a gap, and the rest of the long name wraps onto the next line
    expect(lines[idx].text).toMatch(/^2x {2}\S.*\S +£1234\.56$/);
    expect(lines[idx].text.length).toBe(32);
    expect(lines[idx + 1].text.trim().length).toBeGreaterThan(0);
  });

  it('does not crash on a numeric table number', () => {
    const order = { ...baseOrder, orderType: 'dine_in', tableNumber: 7 as any };
    expect(() => buildCustomizedReceiptDocument(order, { paperWidth: '80mm' }, DINE_IN_INVOICE_TEMPLATE)).not.toThrow();
    expect(getOrderFulfillmentLabel(order)).toBe('DINE-IN (TABLE 7)');
  });

  it('does not treat words like "tablespoon" as a dine-in table', () => {
    expect(isDineInOrder({ orderType: 'delivery', notes: 'Extra tablespoon of sauce please' })).toBe(false);
    expect(isDineInOrder({ notes: 'Table 5' })).toBe(true);
  });

  it('opens the cash drawer only for cash orders', () => {
    const cfg = { paperWidth: '80mm' as const, openCashDrawer: true };
    const card = buildCustomizedReceiptDocument({ ...baseOrder, status: 'placed' }, cfg, DEFAULT_RECEIPT_TEMPLATE);
    const cash = buildCustomizedReceiptDocument({ ...baseOrder, paymentType: 'cash', paymentStatus: 'pending' }, cfg, DEFAULT_RECEIPT_TEMPLATE);
    expect(card.some((c) => c.type === 'drawer')).toBe(false);
    expect(cash.some((c) => c.type === 'drawer')).toBe(true);
  });

  it('describes payment accurately', () => {
    expect(getPaymentInfo({ paymentType: 'card', paymentStatus: 'pending', orderType: 'delivery' }).label).toBe('PAYMENT DUE - CARD');
    expect(getPaymentInfo({ paymentType: 'cash', orderType: 'pickup' }).label).toBe('CASH DUE - PAY AT COUNTER');
    expect(getPaymentInfo({ paymentType: 'stripe', paymentStatus: 'paid' }).label).toBe('PAID - ONLINE');
  });

  it('shows UK VAT as included in the total, never added to it', () => {
    const t = computeReceiptTotals({ pricing: { subtotal: 100, total: 120 } }, { showItemTaxBreakdown: true, taxPercentage: 20 });
    expect(t.total).toBe(120);
    expect(t.includedVat).toEqual({ label: 'Incl. VAT (20%)', amount: 20 });
  });

  it('uses the item sum (not the order total) when the subtotal is missing', () => {
    const t = computeReceiptTotals({ orderedItems: [{ price: 5, quantity: 2 }], pricing: { deliveryFee: 2, total: 12 } });
    expect(t.subtotal).toBe(10);
  });

  it('does not print a VAT number line when no VAT number was entered', () => {
    const doc = buildCustomizedReceiptDocument(baseOrder, { paperWidth: '80mm' }, DINE_IN_INVOICE_TEMPLATE);
    expect(doc.some((c) => c.type === 'text' && c.value.includes('VAT Reg No'))).toBe(false);
  });

  it('prints the logo when one is set', () => {
    const tpl = cloneTemplate(DEFAULT_RECEIPT_TEMPLATE);
    tpl.content.showLogo = true;
    tpl.content.logoUrl = 'data:image/png;base64,AAAA';
    const doc = buildCustomizedReceiptDocument(baseOrder, { paperWidth: '80mm' }, tpl);
    expect(doc[1]).toMatchObject({ type: 'image' });
  });
});

describe('encoders', () => {
  it('maps £, € and accented letters to code page 858', () => {
    expect(encodeCp858('£€é')).toEqual([0x9c, 0xd5, 0x82]);
    expect(encodeCp858('’')).toEqual([0x27]);
  });

  // Regression: centring the 58mm logo / QR with GS L and "resetting" it to 0 overrode the
  // printer's built-in left margin, so every line after the logo was cut off on the left.
  it('never sends GS L (left margin), even with a logo, QR code and print position', () => {
    const { PNG } = require('pngjs/browser.js');
    const png = new PNG({ width: 64, height: 32 });
    png.data.fill(0); // black, opaque after the alpha loop below
    for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
    const logo = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;

    const doc: ReceiptCommand[] = [
      { type: 'image', data: logo, align: 'center' },
      { type: 'text', value: 'Customer: Sam' },
      { type: 'qr', data: 'https://example.com' },
      { type: 'text', value: 'Thank you' },
    ];
    for (const printOffsetMm of [0, 3]) {
      const hex = Buffer.from(EscPosEncoder.encode(doc, { paperWidth: '58mm', printOffsetMm })).toString('hex');
      expect(hex).not.toContain('1d4c');
    }

    // Logo is centred inside the 384-dot text block by padding the raster itself (48 bytes wide)
    const bytes = Array.from(EscPosEncoder.encode(doc, { paperWidth: '58mm' }));
    const gsv = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x76 && bytes[i + 2] === 0x30);
    expect(bytes[gsv + 4]).toBe(48);
    const firstRow = bytes.slice(gsv + 8, gsv + 8 + 48);
    expect(firstRow.slice(0, 20).every((b) => b === 0)).toBe(true); // (384 - 64) / 2 = 160 dots = 20 bytes of white
    expect(firstRow[20]).toBe(0xff);
  });

  it('indents every line by the print position (leading spaces) and offsets ePOS text', () => {
    const doc: ReceiptCommand[] = [{ type: 'text', value: 'Customer: Sam' }];
    const hex = Buffer.from(EscPosEncoder.encode(doc, { paperWidth: '58mm', printOffsetMm: 3 })).toString('hex');
    // 3 mm = 24 dots = 2 Font-A spaces, written at normal size before the text
    expect(hex).toContain('1d21001b4d002020');
    expect(hex).toContain(Buffer.from('Customer: Sam').toString('hex'));
    expect(EposXmlEncoder.encode(doc, { paperWidth: '58mm', printOffsetMm: 3 })).toContain('x="24"');

    const noOffset = Buffer.from(EscPosEncoder.encode(doc, { paperWidth: '58mm' })).toString('hex');
    expect(noOffset).not.toContain('1d21001b4d0020'); // no indent by default
  });

  it('adds the CODE128 code-set prefix', () => {
    const doc: ReceiptCommand[] = [{ type: 'barcode', symbology: 'code128', data: '12345' }];
    const bytes = Array.from(EscPosEncoder.encode(doc, { paperWidth: '80mm' }));
    const start = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x6b);
    expect(String.fromCharCode(...bytes.slice(start + 4, start + 4 + 7))).toBe('{B12345');
    expect(EposXmlEncoder.encode(doc, { paperWidth: '80mm' })).toContain('{B12345');
  });
});

describe('template storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('keeps font, spacing, bold and italic choices after saving and reloading', async () => {
    const tpl = cloneTemplate(DEFAULT_RECEIPT_TEMPLATE);
    tpl.layout.fontSize = 'large';
    tpl.layout.lineSpacing = 'compact';
    tpl.layout.boldElements.itemNames = false;
    tpl.layout.italicElements.footerMessage = true;
    await saveReceiptTemplate(tpl, 'r1', true);

    const active = await getActiveReceiptTemplate('r1');
    expect(active.layout.fontSize).toBe('large');
    expect(active.layout.lineSpacing).toBe('compact');
    expect(active.layout.boldElements.itemNames).toBe(false);
    expect(active.layout.italicElements.footerMessage).toBe(true);
  });

  it('keeps edits to a built-in template (they are no longer overwritten on restart)', async () => {
    const tpl = cloneTemplate(DEFAULT_RECEIPT_TEMPLATE);
    tpl.content.footerMessage = 'See you soon!';
    await saveReceiptTemplate(tpl, 'r1', true);
    const all = await getAllReceiptTemplates('r1');
    expect(all.find((t) => t.id === DEFAULT_RECEIPT_TEMPLATE.id)?.content.footerMessage).toBe('See you soon!');
  });

  it('keeps a deleted built-in template deleted', async () => {
    await deleteReceiptTemplate(DINE_IN_INVOICE_TEMPLATE.id, 'r1');
    const all = await getAllReceiptTemplates('r1');
    expect(all.some((t) => t.id === DINE_IN_INVOICE_TEMPLATE.id)).toBe(false);
  });

  it('keeps restaurants separate', async () => {
    const tpl = cloneTemplate(DEFAULT_RECEIPT_TEMPLATE);
    tpl.content.footerMessage = 'Restaurant 1 only';
    await saveReceiptTemplate(tpl, 'r1', true);
    const other = cloneTemplate(DEFAULT_RECEIPT_TEMPLATE);
    other.content.footerMessage = 'Restaurant 2 only';
    await saveReceiptTemplate(other, 'r2', true);
    expect((await getActiveReceiptTemplate('r1')).content.footerMessage).toBe('Restaurant 1 only');
  });

  it('scrubs placeholder VAT numbers saved by older versions', () => {
    const old = cloneTemplate(DINE_IN_INVOICE_TEMPLATE);
    old.content.taxIdValue = 'GB 987 6543 21';
    expect(normalizeTemplate(old).content.taxIdValue).toBe('');
  });
});
