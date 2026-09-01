import { Order, PosPrinterConfig } from '../../types';

/**
 * ESC/POS Command Byte Generator for 58mm / 80mm receipt printers & cash drawers.
 * Uses standard thermal printer ESC/POS control codes.
 */
export class EscPosBuilder {
  private buffer: number[] = [];

  // ESC/POS Command Constants
  private static ESC = 0x1b;
  private static GS = 0x1d;

  init(): this {
    this.buffer.push(EscPosBuilder.ESC, 0x40); // ESC @ Initialize
    return this;
  }

  alignCenter(): this {
    this.buffer.push(EscPosBuilder.ESC, 0x61, 1);
    return this;
  }

  alignLeft(): this {
    this.buffer.push(EscPosBuilder.ESC, 0x61, 0);
    return this;
  }

  alignRight(): this {
    this.buffer.push(EscPosBuilder.ESC, 0x61, 2);
    return this;
  }

  setBold(enable: boolean): this {
    this.buffer.push(EscPosBuilder.ESC, 0x45, enable ? 1 : 0);
    return this;
  }

  setTextSize(widthMult: number = 1, heightMult: number = 1): this {
    const w = Math.min(Math.max(widthMult - 1, 0), 7);
    const h = Math.min(Math.max(heightMult - 1, 0), 7);
    const n = (w << 4) | h;
    this.buffer.push(EscPosBuilder.GS, 0x21, n);
    return this;
  }

  text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = Array.from(encoder.encode(str));
    this.buffer.push(...bytes);
    return this;
  }

  newLine(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  lineDivider(width: number = 32): this {
    return this.text('-'.repeat(width)).newLine();
  }

  doubleDivider(width: number = 32): this {
    return this.text('='.repeat(width)).newLine();
  }

  twoColumn(left: string, right: string, width: number = 32): this {
    const leftLen = left.length;
    const rightLen = right.length;
    const spaces = Math.max(1, width - leftLen - rightLen);
    return this.text(left + ' '.repeat(spaces) + right).newLine();
  }

  threeColumn(qty: string, item: string, price: string, width: number = 32): this {
    if (width === 32) {
      const q = qty.padEnd(4);
      const p = price.padStart(7);
      const maxItemLen = 21;
      const itemName = item.length > maxItemLen ? item.substring(0, maxItemLen) : item.padEnd(maxItemLen);
      return this.text(`${q}${itemName}${p}`).newLine();
    } else {
      const q = qty.padEnd(6);
      const p = price.padStart(10);
      const maxItemLen = 32;
      const itemName = item.length > maxItemLen ? item.substring(0, maxItemLen) : item.padEnd(maxItemLen);
      return this.text(`${q}${itemName}${p}`).newLine();
    }
  }

  kickCashDrawer(): this {
    // ESC p 0 25 250 (\x1B\x70\x00\x19\xFA)
    this.buffer.push(EscPosBuilder.ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  cutPaper(): this {
    // GS V 0 (Partial/Full Cut)
    this.buffer.push(EscPosBuilder.GS, 0x56, 0x00);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Generate binary ESC/POS receipt for Bluetooth/LAN receipt printers
 */
export function buildOrderEscPosBytes(order: Partial<Order> & any, config: PosPrinterConfig): Uint8Array {
  const is58mm = config.paperWidth === '58mm';
  const width = is58mm ? 32 : 48;
  const builder = new EscPosBuilder();

  const restaurantName =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.restaurantName || 'KRIFOO RESTAURANT'
      : 'KRIFOO RESTAURANT';

  builder
    .init()
    .alignCenter()
    .setTextSize(2, 2)
    .setBold(true)
    .text(restaurantName.toUpperCase())
    .newLine()
    .setTextSize(1, 1)
    .setBold(false)
    .doubleDivider(width)
    .setTextSize(2, 2)
    .setBold(true)
    .text(`ORDER: ${order.orderNumber || '#0000'}`)
    .newLine()
    .setTextSize(1, 1)
    .setBold(false)
    .text(`[ ${(order.orderType || 'DELIVERY').toUpperCase()} ]`)
    .newLine()
    .lineDivider(width)
    .alignLeft()
    .twoColumn('Date:', new Date(order.createdAt || Date.now()).toLocaleTimeString(), width)

  if (order.customerDetails?.name) {
    builder.text(`Customer: ${order.customerDetails.name}`).newLine();
  }
  if (order.customerDetails?.phoneNumber) {
    builder.text(`Phone: ${order.customerDetails.phoneNumber}`).newLine();
  }

  builder.doubleDivider(width).threeColumn('QTY', 'ITEM', 'PRICE', width).lineDivider(width);

  const items = order.orderedItems || [];
  items.forEach((item: any) => {
    const qty = `${item.quantity || 1}x`;
    const name = item.itemName || item.name || 'Item';
    const price = `£${Number(item.itemTotal || item.basePrice || 0).toFixed(2)}`;
    builder.setBold(true).threeColumn(qty, name, price, width).setBold(false);

    if (item.selectedVariants?.length) {
      item.selectedVariants.forEach((v: any) => {
        builder.text(`   + ${v.name || v}`).newLine();
      });
    }
  });

  builder
    .doubleDivider(width)
    .twoColumn('TOTAL:', `£${Number(order.pricing?.total || 0).toFixed(2)}`, width)
    .lineDivider(width)
    .alignCenter()
    .text('Thank you for ordering with Krifoo!')
    .newLine(3);

  if (config.openCashDrawerOnCashPayment && (order.paymentType === 'CASH' || order.paymentStatus === 'PAID')) {
    builder.kickCashDrawer();
  }

  if (config.autoCutReceipt) {
    builder.cutPaper();
  }

  return builder.build();
}
