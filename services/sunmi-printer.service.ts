import { Platform } from 'react-native';
import SunmiPrinter, { AlignValue } from '@un1v3r/react-native-sunmi-printer';
import { Order } from '../types';

let _cachedIsSunmi: boolean | null = null;

/**
 * Check if Sunmi Printer hardware & service are available on the current device.
 * Includes connection retry if the AIDL service is still binding during app startup.
 */
export async function isSunmiAvailable(maxRetries: number = 3): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  // If already confirmed available in current app session
  if (_cachedIsSunmi === true) {
    return true;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const hasPrinter = await SunmiPrinter.hasPrinter();
      if (hasPrinter) {
        _cachedIsSunmi = true;
        return true;
      }
    } catch (err) {
      // Ignore initial binding error on non-Sunmi device
    }

    if (attempt < maxRetries) {
      // Brief pause while Sunmi AIDL service binds on app startup
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return false;
}

/**
 * Format currency with symbol (£ for UK)
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
 * Print 80mm Thermal POS Receipt directly on Sunmi V3 MIX built-in printer.
 * 
 * Features:
 * - Direct native AIDL communication (Instant & 100% silent - no Android dialog)
 * - 80mm column alignment and custom font hierarchy
 * - Automatic paper cut upon completion
 */
export async function printSunmiOrderReceipt(order: Partial<Order> & any): Promise<boolean> {
  try {
    console.log('[Sunmi] Initializing Sunmi Printer for order:', order.orderNumber || order._id);

    // 1. Initialize printer state
    SunmiPrinter.printerInit();

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

    const deliveryAddress =
      order.deliveryAddress?.formattedAddress ||
      order.deliveryAddress?.address ||
      order.deliveryAddress?.street ||
      order.customerDetails?.address ||
      '';

    const deliveryPostcode = order.deliveryAddress?.postalCode || order.deliveryAddress?.postcode || '';

    const orderNum = order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000');
    const fulfillmentType = (order.orderType || order.deliveryType || 'DELIVERY').toUpperCase();
    const isDelivery = fulfillmentType.includes('DELIV');
    const { placedAt, targetTime } = formatOrderDate(order.createdAt);

    // ==========================================
    // 1. HEADER SECTION
    // ==========================================
    SunmiPrinter.setAlignment(AlignValue.CENTER);
    SunmiPrinter.setFontSize(28);
    SunmiPrinter.setFontWeight(true);
    SunmiPrinter.printerText(`${restaurantName.toUpperCase()}\n`);

    if (restaurantPhone) {
      SunmiPrinter.setFontSize(20);
      SunmiPrinter.setFontWeight(false);
      SunmiPrinter.printerText(`Tel: ${restaurantPhone}\n`);
    }

    SunmiPrinter.setFontSize(20);
    SunmiPrinter.printerText('================================================\n');

    // ORDER NUMBER & TYPE
    SunmiPrinter.setFontSize(36);
    SunmiPrinter.setFontWeight(true);
    SunmiPrinter.printerText(`ORDER: ${orderNum}\n`);

    SunmiPrinter.setFontSize(24);
    SunmiPrinter.printerText(`[ ${fulfillmentType} ]\n`);
    SunmiPrinter.setFontWeight(false);

    SunmiPrinter.setFontSize(20);
    SunmiPrinter.printerText('------------------------------------------------\n');

    // ==========================================
    // 2. TIMINGS & CUSTOMER SECTION
    // ==========================================
    SunmiPrinter.setAlignment(AlignValue.LEFT);
    SunmiPrinter.setFontSize(20);
    SunmiPrinter.printerText(`Placed: ${placedAt}    Target: ${targetTime}\n`);
    SunmiPrinter.printerText('------------------------------------------------\n');

    SunmiPrinter.setFontWeight(true);
    SunmiPrinter.printerText(`CUSTOMER:\n`);
    SunmiPrinter.setFontWeight(false);
    SunmiPrinter.printerText(`  Name:  ${customerName}\n`);
    if (customerPhone) {
      SunmiPrinter.printerText(`  Phone: ${customerPhone}\n`);
    }

    if (isDelivery && (deliveryAddress || deliveryPostcode)) {
      SunmiPrinter.setFontWeight(true);
      SunmiPrinter.printerText(`DELIVERY ADDRESS:\n`);
      SunmiPrinter.setFontWeight(false);
      if (deliveryAddress) SunmiPrinter.printerText(`  ${deliveryAddress}\n`);
      if (deliveryPostcode) SunmiPrinter.printerText(`  Postcode: ${deliveryPostcode}\n`);
    }

    if (order.deliveryInstructions || order.notes) {
      const note = order.deliveryInstructions || order.notes;
      SunmiPrinter.setFontWeight(true);
      SunmiPrinter.printerText(`SPECIAL NOTE: ${note}\n`);
      SunmiPrinter.setFontWeight(false);
    }

    SunmiPrinter.printerText('================================================\n');

    // ==========================================
    // 3. ORDER ITEMS TABLE (80mm Width)
    // ==========================================
    SunmiPrinter.setFontSize(22);
    SunmiPrinter.setFontWeight(true);
    // Table Header: QTY (6), ITEM (32), PRICE (10)
    SunmiPrinter.printColumnsString(['QTY', 'ITEM', 'PRICE'], [6, 32, 10], [AlignValue.LEFT, AlignValue.LEFT, AlignValue.RIGHT]);
    SunmiPrinter.setFontWeight(false);
    SunmiPrinter.setFontSize(20);
    SunmiPrinter.printerText('------------------------------------------------\n');

    const items = order.items || order.orderedItems || [];
    items.forEach((item: any) => {
      const qty = `${item.quantity || 1}x`;
      const name = item.name || item.title || item.menuItemId?.name || 'Item';
      const itemPrice = (item.price || 0) * (item.quantity || 1);
      const priceStr = formatMoney(itemPrice);

      SunmiPrinter.setFontSize(22);
      SunmiPrinter.setFontWeight(true);
      SunmiPrinter.printColumnsString([qty, name, priceStr], [6, 32, 10], [AlignValue.LEFT, AlignValue.LEFT, AlignValue.RIGHT]);
      SunmiPrinter.setFontWeight(false);

      // Modifiers / Options / Instructions
      const options = item.options || item.selectedOptions || item.modifiers || [];
      if (Array.isArray(options) && options.length > 0) {
        SunmiPrinter.setFontSize(18);
        options.forEach((opt: any) => {
          const optName = typeof opt === 'string' ? opt : (opt.name || opt.title || '');
          const optPrice = opt.price ? ` (+${formatMoney(opt.price)})` : '';
          if (optName) {
            SunmiPrinter.printerText(`    + ${optName}${optPrice}\n`);
          }
        });
      }

      if (item.specialInstructions || item.note) {
        SunmiPrinter.setFontSize(18);
        SunmiPrinter.printerText(`    * Note: ${item.specialInstructions || item.note}\n`);
      }
    });

    SunmiPrinter.setFontSize(20);
    SunmiPrinter.printerText('================================================\n');

    // ==========================================
    // 4. TOTALS & BREAKDOWN
    // ==========================================
    const subtotal = order.pricing?.subtotal !== undefined ? order.pricing.subtotal : (order.subtotal !== undefined ? order.subtotal : (order.totalAmount || 0));
    SunmiPrinter.printColumnsString(['Subtotal:', formatMoney(subtotal)], [32, 16], [AlignValue.LEFT, AlignValue.RIGHT]);

    const deliveryFee = order.pricing?.deliveryFee !== undefined ? order.pricing.deliveryFee : order.deliveryFee;
    if (deliveryFee !== undefined && deliveryFee > 0) {
      SunmiPrinter.printColumnsString(['Delivery Fee:', formatMoney(deliveryFee)], [32, 16], [AlignValue.LEFT, AlignValue.RIGHT]);
    }

    const serviceFee = order.pricing?.serviceFee !== undefined ? order.pricing.serviceFee : (order.pricing?.handlingCharge !== undefined ? order.pricing.handlingCharge : order.serviceFee);
    if (serviceFee !== undefined && serviceFee > 0) {
      SunmiPrinter.printColumnsString(['Service Fee:', formatMoney(serviceFee)], [32, 16], [AlignValue.LEFT, AlignValue.RIGHT]);
    }

    const discount = order.pricing?.discount !== undefined ? order.pricing.discount : order.discount;
    if (discount !== undefined && discount > 0) {
      SunmiPrinter.printColumnsString(['Discount:', `-${formatMoney(discount)}`], [32, 16], [AlignValue.LEFT, AlignValue.RIGHT]);
    }

    const tip = order.pricing?.tip !== undefined ? order.pricing.tip : order.tip;
    if (tip !== undefined && tip > 0) {
      SunmiPrinter.printColumnsString(['Driver Tip:', formatMoney(tip)], [32, 16], [AlignValue.LEFT, AlignValue.RIGHT]);
    }

    SunmiPrinter.printerText('------------------------------------------------\n');

    // TOTAL AMOUNT (Double Size)
    const grandTotal = order.pricing?.total !== undefined ? order.pricing.total : (order.totalAmount || order.total || subtotal);
    SunmiPrinter.setFontSize(28);
    SunmiPrinter.setFontWeight(true);
    SunmiPrinter.printColumnsString(['TOTAL:', formatMoney(grandTotal)], [24, 24], [AlignValue.LEFT, AlignValue.RIGHT]);
    SunmiPrinter.setFontWeight(false);

    SunmiPrinter.setFontSize(20);
    SunmiPrinter.printerText('------------------------------------------------\n');

    // Payment Info
    const paymentMethod = (order.paymentType || order.paymentMethod || 'Online / Card').toUpperCase();
    const paymentStatus = (order.paymentStatus || 'PAID').toUpperCase();
    SunmiPrinter.setAlignment(AlignValue.LEFT);
    SunmiPrinter.printerText(`Payment: ${paymentMethod} (${paymentStatus})\n`);

    // ==========================================
    // 5. FOOTER & CUT PAPER
    // ==========================================
    SunmiPrinter.setAlignment(AlignValue.CENTER);
    SunmiPrinter.setFontSize(20);
    SunmiPrinter.printerText('\nThank you for ordering with Krifoo!\n');
    SunmiPrinter.printerText('www.krifoo.com\n');

    // Feed paper lines so the print clears the cutter blade
    SunmiPrinter.lineWrap(4);

    // Trigger Sunmi hardware automatic paper cutter
    try {
      SunmiPrinter.cutPaper();
    } catch (cutErr) {
      console.warn('[Sunmi] Cut paper command failed (device might not have auto-cutter):', cutErr);
    }

    console.log('[Sunmi] Receipt printed and cut successfully.');
    return true;
  } catch (error) {
    console.error('[Sunmi] Print error on Sunmi V3 MIX:', error);
    return false;
  }
}
