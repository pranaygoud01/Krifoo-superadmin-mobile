import { Order, ShiftReport, PosPrinterConfig } from '../../types';
import { printQueue } from '../../services/printer/PrintQueue';
import { EscPosBuilder } from '../../services/printer/EscPosBuilder';
import { buildEpsonEposXml } from '../../../services/printer/epson-printer.service';

/**
 * Analytics & Shift Closing Service (X / Z Reports)
 */
export class ShiftReportService {
  /**
   * Calculate Shift Summary from a list of completed orders
   */
  static generateShiftReport(
    orders: Order[],
    cashierName: string,
    openingCash: number,
    actualClosingCash: number
  ): ShiftReport {
    let totalSales = 0;
    let cashSales = 0;
    let cardSales = 0;
    let upiSales = 0;
    let deliveryAggregatorSales = 0;
    let totalDiscount = 0;

    orders.forEach((o) => {
      const orderTotal = o.pricing?.total || 0;
      totalSales += orderTotal;
      totalDiscount += o.pricing?.discount || 0;

      const pType = (o.paymentType || '').toUpperCase();
      const oType = (o.orderType || '').toUpperCase();

      if (oType.includes('DELIVER') || oType.includes('AGGREGATOR')) {
        deliveryAggregatorSales += orderTotal;
      } else if (pType === 'CASH') {
        cashSales += orderTotal;
      } else if (pType === 'CARD') {
        cardSales += orderTotal;
      } else if (pType === 'UPI') {
        upiSales += orderTotal;
      } else {
        cardSales += orderTotal;
      }
    });

    const expectedClosingCash = openingCash + cashSales;
    const cashDifference = actualClosingCash - expectedClosingCash;

    return {
      id: `shift_${Date.now()}`,
      shiftStartTime: orders.length > 0 ? orders[orders.length - 1].createdAt : new Date().toISOString(),
      shiftEndTime: new Date().toISOString(),
      cashierName,
      totalSales,
      totalOrdersCount: orders.length,
      cashSales,
      cardSales,
      upiSales,
      deliveryAggregatorSales,
      totalDiscount,
      openingCashDrawer: openingCash,
      expectedClosingCash,
      actualClosingCash,
      cashDifference,
      printedAt: new Date().toLocaleString(),
    };
  }

  /**
   * Print X/Z Shift Report on Thermal Receipt Printer
   */
  static async printShiftReport(report: ShiftReport, config: PosPrinterConfig): Promise<boolean> {
    return printQueue.enqueue(async () => {
      const is58mm = config.paperWidth === '58mm';
      const width = is58mm ? 32 : 48;

      const builder = new EscPosBuilder();
      builder
        .init()
        .alignCenter()
        .setTextSize(2, 2)
        .setBold(true)
        .text('END OF SHIFT REPORT (Z)')
        .newLine()
        .setTextSize(1, 1)
        .setBold(false)
        .doubleDivider(width)
        .alignLeft()
        .twoColumn('Cashier:', report.cashierName, width)
        .twoColumn('Start:', new Date(report.shiftStartTime).toLocaleTimeString(), width)
        .twoColumn('End:', new Date(report.shiftEndTime).toLocaleTimeString(), width)
        .lineDivider(width)
        .setBold(true)
        .twoColumn('TOTAL SALES:', `£${report.totalSales.toFixed(2)}`, width)
        .twoColumn('Total Orders:', `${report.totalOrdersCount}`, width)
        .setBold(false)
        .lineDivider(width)
        .twoColumn('Cash Payments:', `£${report.cashSales.toFixed(2)}`, width)
        .twoColumn('Card Payments:', `£${report.cardSales.toFixed(2)}`, width)
        .twoColumn('UPI Payments:', `£${report.upiSales.toFixed(2)}`, width)
        .twoColumn('Delivery Apps:', `£${report.deliveryAggregatorSales.toFixed(2)}`, width)
        .doubleDivider(width)
        .twoColumn('Opening Cash:', `£${report.openingCashDrawer.toFixed(2)}`, width)
        .twoColumn('Expected Cash:', `£${report.expectedClosingCash.toFixed(2)}`, width)
        .twoColumn('Actual Cash:', `£${report.actualClosingCash.toFixed(2)}`, width)
        .setBold(true)
        .twoColumn('Difference:', `£${report.cashDifference.toFixed(2)}`, width)
        .setBold(false)
        .doubleDivider(width)
        .alignCenter()
        .text(`Printed: ${report.printedAt}`)
        .newLine(3);

      if (config.autoCutReceipt) {
        builder.cutPaper();
      }

      // Send to ePOS or TCP endpoint
      const ip = config.ipAddress || '192.168.1.100';
      const endpoint = `http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;

      try {
        const dummyOrderForReport: any = {
          restaurantId: { restaurantName: 'END OF SHIFT REPORT (Z)' },
          orderNumber: 'SUMMARY',
          orderType: 'REPORT',
          createdAt: report.shiftEndTime,
          customerDetails: { name: report.cashierName },
          orderedItems: [
            { itemName: 'Total Sales', quantity: report.totalOrdersCount, itemTotal: report.totalSales },
            { itemName: 'Cash Collected', quantity: 1, itemTotal: report.cashSales },
            { itemName: 'Card Collected', quantity: 1, itemTotal: report.cardSales },
          ],
          pricing: { subtotal: report.totalSales, total: report.totalSales },
          paymentType: 'SUMMARY',
          paymentStatus: 'COMPLETED',
        };

        const fullConfig: any = { brand: 'epson', autoPrint: true, copies: 1, autoCut: true, openCashDrawer: false, ...config };
        const xmlPayload = buildEpsonEposXml(dummyOrderForReport, fullConfig);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
          body: xmlPayload,
        });
        return res.ok;
      } catch (e) {
        return false;
      }
    }, `report_${report.id}`);
  }
}
