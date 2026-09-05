import { Order } from '../../types';
import { PosPrinterConfig } from '../pos-config.service';
import { EpsonEposModule } from '../../src/modules/epson-epos';
import { buildOrderEscPosBytes } from '../../src/services/printer/EscPosBuilder';

/**
 * Format currency (£ for UK)
 */
function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '£0.00';
  return `£${Number(amount).toFixed(2)}`;
}

/**
 * Format order date into UK style strings
 */
function formatOrderDate(dateString?: string): { placedAt: string; targetTime: string } {
  const now = dateString ? new Date(dateString) : new Date();

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const placedAt = now.toLocaleDateString('en-GB', options);

  const targetDate = new Date(now.getTime() + 35 * 60000);
  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  const targetTime = `Today by ${hours}:${minutes}`;

  return { placedAt, targetTime };
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format 2-column key-value text line for thermal paper
 */
function formatTwoColumn(left: string, right: string, cols: number = 48): string {
  const leftLen = left.length;
  const rightLen = right.length;
  const spaces = Math.max(1, cols - leftLen - rightLen);
  return left + ' '.repeat(spaces) + right + '&#10;';
}

/**
 * Format 3-column table row (QTY, ITEM, PRICE)
 */
function formatThreeColumn(qty: string, item: string, price: string, cols: number = 48): string {
  if (cols === 32) {
    const q = qty.padEnd(4);
    const p = price.padStart(8);
    const maxItemLen = 20;
    const itemName = item.length > maxItemLen ? item.substring(0, maxItemLen) : item.padEnd(maxItemLen);
    return `${q}${itemName}${p}&#10;`;
  } else {
    const q = qty.padEnd(6);
    const p = price.padStart(10);
    const maxItemLen = 32;
    const itemName = item.length > maxItemLen ? item.substring(0, maxItemLen) : item.padEnd(maxItemLen);
    return `${q}${itemName}${p}&#10;`;
  }
}

/**
 * Generate official Epson ePOS-Print XML payload for Epson TM-m30 / TM-T88 / TM-T20 / TM-T82 printers
 */
export function buildEpsonEposXml(order: Partial<Order> & any, config: PosPrinterConfig): string {
  const is58mm = config.paperWidth === '58mm';
  const cols = is58mm ? 32 : 48;
  const divider = '-'.repeat(cols) + '&#10;';
  const doubleDivider = '='.repeat(cols) + '&#10;';

  // Restaurant details
  const restaurantName =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.restaurantName || 'KRIFOO RESTAURANT'
      : 'KRIFOO RESTAURANT';

  const restaurantPhone =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.phoneNumber || ''
      : '';

  // Customer details
  const customerName =
    order.customerDetails?.name ||
    order.customerId?.fullName ||
    order.userId?.fullName ||
    order.userId?.name ||
    order.customerName ||
    'Customer';

  const customerPhone =
    order.customerDetails?.phoneNumber ||
    order.customerId?.phoneNumber ||
    order.userId?.phoneNumber ||
    order.deliveryAddress?.phoneNumber ||
    order.phoneNumber ||
    '';

  // Delivery Address extraction
  let deliveryAddress = '';
  let deliveryPostcode = '';

  if (typeof order.deliveryAddress === 'string' && order.deliveryAddress.trim()) {
    deliveryAddress = order.deliveryAddress.trim();
  } else if (order.deliveryAddress && typeof order.deliveryAddress === 'object') {
    const addrObj = order.deliveryAddress;
    const addrParts: string[] = [];

    if (addrObj.fullAddress) {
      addrParts.push(addrObj.fullAddress);
    } else {
      if (addrObj.addressLine1) addrParts.push(addrObj.addressLine1);
      if (addrObj.addressLine2) addrParts.push(addrObj.addressLine2);
      if (addrObj.street) addrParts.push(addrObj.street);
      if (addrObj.formattedAddress) addrParts.push(addrObj.formattedAddress);
      if (addrObj.address) addrParts.push(addrObj.address);
    }

    if (addrObj.landmark) addrParts.push(`Landmark: ${addrObj.landmark}`);
    if (addrObj.city && !addrParts.some((p) => p.includes(addrObj.city))) {
      addrParts.push(addrObj.city);
    }

    deliveryAddress = addrParts.filter(Boolean).join(', ');
    deliveryPostcode = addrObj.postalCode || addrObj.postcode || addrObj.postCode || addrObj.zipCode || '';
  }

  const orderNum = order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000');
  const fulfillmentType = (order.orderType || order.deliveryType || (deliveryAddress ? 'DELIVERY' : 'COLLECTION')).toUpperCase();
  const isDelivery = fulfillmentType.includes('DELIV') || Boolean(deliveryAddress);
  const { placedAt, targetTime } = formatOrderDate(order.createdAt);

  let xmlBody = '';

  // 1. HEADER
  xmlBody += `<text align="center" width="2" height="2" em="true">${escapeXml(restaurantName.toUpperCase())}&#10;</text>`;
  xmlBody += `<text align="center" width="1" height="1" em="false"/>`;
  if (restaurantPhone) {
    xmlBody += `<text align="center">Tel: ${escapeXml(restaurantPhone)}&#10;</text>`;
  }
  xmlBody += `<text align="center">${doubleDivider}</text>`;

  // ORDER NUMBER & TYPE
  xmlBody += `<text align="center" width="2" height="2" em="true">ORDER: ${escapeXml(orderNum)}&#10;</text>`;
  xmlBody += `<text align="center" width="1" height="1" em="false">[ ${escapeXml(fulfillmentType)} ]&#10;</text>`;
  xmlBody += `<text align="center">${divider}</text>`;

  // 2. TIMINGS & CUSTOMER
  xmlBody += `<text align="left">Placed: ${escapeXml(placedAt)}  Target: ${escapeXml(targetTime)}&#10;</text>`;
  xmlBody += `<text align="left">${divider}</text>`;

  xmlBody += `<text align="left" em="true">CUSTOMER:&#10;</text>`;
  xmlBody += `<text align="left" em="false">  Name:  ${escapeXml(customerName)}&#10;</text>`;
  if (customerPhone) {
    xmlBody += `<text align="left">  Phone: ${escapeXml(customerPhone)}&#10;</text>`;
  }

  if (isDelivery && deliveryAddress) {
    xmlBody += `<text align="left" em="true">DELIVERY ADDRESS:&#10;</text>`;
    xmlBody += `<text align="left" em="false">  ${escapeXml(deliveryAddress)}&#10;</text>`;
    if (deliveryPostcode && !deliveryAddress.includes(deliveryPostcode)) {
      xmlBody += `<text align="left">  POSTCODE: ${escapeXml(deliveryPostcode)}&#10;</text>`;
    }
  }

  if (order.deliveryInstructions || order.notes) {
    const note = order.deliveryInstructions || order.notes;
    xmlBody += `<text align="left" em="true">NOTE: ${escapeXml(note)}&#10;</text>`;
    xmlBody += `<text align="left" em="false"/>`;
  }

  xmlBody += `<text align="center">${doubleDivider}</text>`;

  // 3. ITEMS TABLE
  xmlBody += `<text align="left" em="true">${formatThreeColumn('QTY', 'ITEM', 'PRICE', cols)}</text>`;
  xmlBody += `<text align="left" em="false">${divider}</text>`;

  const itemsList =
    Array.isArray(order.orderedItems) && order.orderedItems.length > 0
      ? order.orderedItems
      : Array.isArray(order.items) && order.items.length > 0
      ? order.items
      : [];

  itemsList.forEach((item: any) => {
    const qtyNum = Number(item.quantity || item.qty || 1);
    const qtyStr = `${qtyNum}x`;

    const name =
      item.itemName ||
      item.name ||
      item.title ||
      item.itemId?.name ||
      item.itemId?.itemName ||
      item.menuItemId?.name ||
      item.menuItemId?.itemName ||
      item.menuItem?.name ||
      item.menuItem?.itemName ||
      item.dishName ||
      item.productName ||
      'Item';

    let itemPrice = 0;
    if (item.itemTotal !== undefined && item.itemTotal !== null && !isNaN(item.itemTotal)) {
      itemPrice = Number(item.itemTotal);
    } else if (item.basePrice !== undefined && item.basePrice !== null && !isNaN(item.basePrice)) {
      itemPrice = Number(item.basePrice) * qtyNum;
    } else if (item.price !== undefined && item.price !== null && !isNaN(item.price)) {
      itemPrice = Number(item.price) * qtyNum;
    }
    const priceStr = formatMoney(itemPrice);

    xmlBody += `<text align="left" em="true" height="2">${escapeXml(formatThreeColumn(qtyStr, name, priceStr, cols))}</text>`;
    xmlBody += `<text align="left" em="false" height="1"/>`;

    // Variants & Add-ons
    const optionsList: string[] = [];
    if (Array.isArray(item.selectedVariants)) {
      item.selectedVariants.forEach((v: any) => {
        if (typeof v === 'string' && v.trim()) optionsList.push(v.trim());
        else if (v?.name) {
          const p = v.price || v.additionalPrice ? ` (+${formatMoney(v.price || v.additionalPrice)})` : '';
          optionsList.push(`${v.name}${p}`);
        }
      });
    }
    if (Array.isArray(item.selectedAddons)) {
      item.selectedAddons.forEach((a: any) => {
        if (typeof a === 'string' && a.trim()) optionsList.push(a.trim());
        else if (a?.name) {
          const p = a.price || a.additionalPrice ? ` (+${formatMoney(a.price || a.additionalPrice)})` : '';
          optionsList.push(`${a.name}${p}`);
        }
      });
    }
    if (item.customization?.size) optionsList.push(`Size: ${item.customization.size}`);
    if (Array.isArray(item.customization?.addOns)) {
      item.customization.addOns.forEach((a: string) => {
        if (a) optionsList.push(a);
      });
    }

    if (optionsList.length > 0) {
      optionsList.forEach((opt) => {
        xmlBody += `<text align="left">    + ${escapeXml(opt)}&#10;</text>`;
      });
    }

    const itemNote = item.instructions || item.specialInstructions || item.note || '';
    if (itemNote) {
      xmlBody += `<text align="left">    * Note: ${escapeXml(itemNote)}&#10;</text>`;
    }
  });

  xmlBody += `<text align="center">${doubleDivider}</text>`;

  // 4. TOTALS
  const subtotal =
    order.pricing?.subtotal !== undefined
      ? order.pricing.subtotal
      : order.subtotal !== undefined
      ? order.subtotal
      : order.totalAmount || 0;
  xmlBody += `<text align="left">${escapeXml(formatTwoColumn('Subtotal:', formatMoney(subtotal), cols))}</text>`;

  const deliveryFee = order.pricing?.deliveryFee !== undefined ? order.pricing.deliveryFee : order.deliveryFee;
  if (deliveryFee !== undefined && deliveryFee > 0) {
    xmlBody += `<text align="left">${escapeXml(formatTwoColumn('Delivery Fee:', formatMoney(deliveryFee), cols))}</text>`;
  }

  const serviceFee =
    order.pricing?.serviceFee !== undefined
      ? order.pricing.serviceFee
      : order.pricing?.handlingCharge !== undefined
      ? order.pricing.handlingCharge
      : order.serviceFee;
  if (serviceFee !== undefined && serviceFee > 0) {
    xmlBody += `<text align="left">${escapeXml(formatTwoColumn('Service Fee:', formatMoney(serviceFee), cols))}</text>`;
  }

  const discount = order.pricing?.discount !== undefined ? order.pricing.discount : order.discount;
  if (discount !== undefined && discount > 0) {
    xmlBody += `<text align="left">${escapeXml(formatTwoColumn('Discount:', `-${formatMoney(discount)}`, cols))}</text>`;
  }

  const tip = order.pricing?.tip !== undefined ? order.pricing.tip : order.tip;
  if (tip !== undefined && tip > 0) {
    xmlBody += `<text align="left">${escapeXml(formatTwoColumn('Driver Tip:', formatMoney(tip), cols))}</text>`;
  }

  xmlBody += `<text align="center">${divider}</text>`;

  // TOTAL
  const grandTotal =
    order.pricing?.total !== undefined ? order.pricing.total : order.totalAmount || order.total || subtotal;
  xmlBody += `<text align="left" width="2" height="2" em="true">${escapeXml(
    formatTwoColumn('TOTAL:', formatMoney(grandTotal), Math.floor(cols / 2))
  )}</text>`;
  xmlBody += `<text align="left" width="1" height="1" em="false"/>`;
  xmlBody += `<text align="center">${divider}</text>`;

  // Payment
  const paymentMethod = (order.paymentType || order.paymentMethod || 'Online / Card').toUpperCase();
  const paymentStatus = (order.paymentStatus || 'PAID').toUpperCase();
  xmlBody += `<text align="left">Payment: ${escapeXml(paymentMethod)} (${escapeXml(paymentStatus)})&#10;</text>`;

  // 5. FOOTER
  xmlBody += `<text align="center">&#10;Thank you for your order!&#10;</text>`;

  // Cash drawer pulse if enabled
  if (config.openCashDrawer && (paymentMethod.includes('CASH') || paymentStatus.includes('CASH'))) {
    xmlBody += `<pulse drawer="drawer_1" time="pulse_100"/>`;
  }

  // Feed & Cut
  xmlBody += `<feed line="3"/>`;
  if (config.autoCut) {
    xmlBody += `<cut type="feed"/>`;
  }

  // Full ePOS SOAP envelope
  return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
      ${xmlBody}
    </epos-print>
  </s:Body>
</s:Envelope>`;
}

/**
 * Discover available Epson printers across Bluetooth (iOS MFi / Android SPP) & Local Network
 */
export async function discoverEpsonPrinters(): Promise<Array<{ id: string; name: string; connectionType: 'bluetooth' | 'network'; target?: string; ipAddress?: string }>> {
  const discovered: Array<any> = [];
  try {
    const btDevices = await EpsonEposModule.discoverBluetoothPrinters();
    discovered.push(...btDevices);
  } catch (e) {
    console.warn('[Epson SDK] Bluetooth scan error:', e);
  }
  try {
    const lanDevices = await EpsonEposModule.discoverNetworkPrinters();
    discovered.push(...lanDevices);
  } catch (e) {
    console.warn('[Epson SDK] Network scan error:', e);
  }
  return discovered;
}

/**
 * Send print request to Epson TM-m30III printer via Bluetooth (MFi/SPP) or Epson ePOS XML SDK endpoints
 */
export async function printEpsonOrderReceipt(
  order: Partial<Order> & any,
  config: PosPrinterConfig
): Promise<boolean> {
  // 1. Bluetooth Connection Path (iOS MFi protocol com.epson.epos.print / Android SPP - No Wi-Fi required)
  if (config.connectionType === 'bluetooth' || config.target?.startsWith('BT:')) {
    try {
      const target = config.target || config.macAddress || 'BT:EP-TM-M30III';
      console.log(`[Epson Bluetooth] Sending print job to Bluetooth printer target: ${target}...`);
      const escPosBytes = buildOrderEscPosBytes(order, config);
      const success = await EpsonEposModule.printRawEscPos(target, escPosBytes);
      if (success) {
        return true;
      }
    } catch (btErr: any) {
      console.warn(`[Epson Bluetooth] Bluetooth print error: ${btErr.message}`);
    }
  }

  // 2. Local Network Path (Epson TM-m30 ePOS XML HTTP / SOAP API)
  const ip = config.ipAddress || '192.168.1.100';
  const xmlPayload = buildEpsonEposXml(order, config);

  const endpoints = [
    `http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`,
    `http://${ip}:8008/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`,
    `http://${ip}:80/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`,
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`[Epson SDK] Sending ePOS-Print job to ${endpoint}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '""',
          'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
        },
        body: xmlPayload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 200) {
        const text = await response.text();
        console.log(`[Epson SDK] Response received from ${endpoint}:`, text.substring(0, 150));
        if (text.includes('success="true"') || text.includes('epos-print') || response.status === 200) {
          return true;
        }
      }
    } catch (err: any) {
      console.log(`[Epson SDK] Endpoint ${endpoint} failed: ${err.message}, trying next...`);
    }
  }

  return false;
}

/**
 * Test Epson printer connection & status (Supports both Bluetooth & Network)
 */
export async function testEpsonPrinter(
  config: PosPrinterConfig
): Promise<{ success: boolean; message: string }> {
  // Test Bluetooth target if connectionType is bluetooth
  if (config.connectionType === 'bluetooth' || config.target?.startsWith('BT:')) {
    try {
      const target = config.target || config.macAddress || 'BT:EP-TM-M30III';
      const sampleOrder: any = {
        _id: 'TEST_BT',
        orderNumber: 'TEST-BT',
        orderType: 'DINE_IN',
        createdAt: new Date().toISOString(),
        customerDetails: { name: 'Bluetooth Test Print' },
        orderedItems: [{ itemName: 'Epson TM-m30III Bluetooth Test', quantity: 1, basePrice: 0.0, itemTotal: 0.0 }],
        pricing: { total: 0.0 },
        paymentType: 'CASH',
        paymentStatus: 'PAID',
      };
      const bytes = buildOrderEscPosBytes(sampleOrder, config);
      const success = await EpsonEposModule.printRawEscPos(target, bytes);
      if (success) {
        return {
          success: true,
          message: `Successfully connected & printed test page to Epson TM-m30III via Bluetooth (${target}).`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        message: `Bluetooth connection failed: ${e?.message || 'Printer not in range or un-paired'}.`,
      };
    }
  }

  // Network test
  const ip = config.ipAddress || '192.168.1.100';

  const testXml = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
      <text align="center" width="2" height="2" em="true">EPSON TM-m30III TEST&#10;</text>
      <text align="center" width="1" height="1" em="false">Krifoo POS System&#10;</text>
      <text align="center">================================&#10;</text>
      <text align="left">Model: EPSON TM-m30III&#10;</text>
      <text align="left">IP: ${ip}&#10;</text>
      <text align="left">Connection: ${config.connectionType.toUpperCase()}&#10;</text>
      <text align="left">Status: Connected &amp; Ready&#10;</text>
      <text align="center">================================&#10;</text>
      <feed line="3"/>
      <cut type="feed"/>
    </epos-print>
  </s:Body>
</s:Envelope>`;

  const endpoints = [
    `http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=5000`,
    `http://${ip}:8008/cgi-bin/epos/service.cgi?devid=local_printer&timeout=5000`,
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '""',
        },
        body: testXml,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok || response.status === 200) {
        return {
          success: true,
          message: `Successfully connected to Epson TM-m30III at ${ip}`,
        };
      }
    } catch (e) {
      // Continue to next endpoint
    }
  }

  return {
    success: false,
    message: `Could not reach Epson TM-m30III at ${ip}. Ensure printer is on the same WiFi/Network or switch to Bluetooth.`,
  };
}
