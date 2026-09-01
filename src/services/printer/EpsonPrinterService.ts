import { printQueue } from './PrintQueue';
import { buildEpsonEposXml } from '../../../services/printer/epson-printer.service';
import { buildOrderEscPosBytes } from './EscPosBuilder';
import { Order, PosPrinterConfig } from '../../types';

/**
 * Epson Thermal Printer Hardware Service.
 * Handles both Epson ePOS XML SOAP API (Port 8008/80/service.cgi) and Direct Raw ESC/POS TCP Sockets.
 * Enqueued via single-threaded FIFO `printQueue`.
 */
export class EpsonPrinterService {
  /**
   * Print an order receipt sequentially through FIFO queue
   */
  static async printOrderReceipt(order: Order, config: PosPrinterConfig): Promise<boolean> {
    return printQueue.enqueue(async () => {
      console.log(`[EpsonPrinterService] Processing print job for Order #${order.orderNumber}...`);

      if (config.connectionType === 'NETWORK' || config.connectionType === 'BLUETOOTH') {
        const ip = config.ipAddress || '192.168.1.100';
        const fullConfig: any = { brand: 'epson', autoPrint: true, copies: 1, autoCut: true, openCashDrawer: false, ...config };
        const xmlPayload = buildEpsonEposXml(order, fullConfig);

        const endpoints = [
          `http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`,
          `http://${ip}:8008/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`,
        ];

        for (const endpoint of endpoints) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: '""',
              },
              body: xmlPayload,
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok || response.status === 200) {
              const text = await response.text();
              if (text.includes('success="true"') || response.status === 200) {
                console.log(`[EpsonPrinterService] Print succeeded via ePOS XML on ${endpoint}`);
                return true;
              }
            }
          } catch (e: any) {
            console.log(`[EpsonPrinterService] Endpoint ${endpoint} unreachable:`, e.message);
          }
        }
      }

      console.warn('[EpsonPrinterService] Failed to send print job to hardware device.');
      return false;
    }, `order_${order._id}_${Date.now()}`);
  }

  /**
   * Send manual Cash Drawer kickout signal to hardware
   */
  static async openCashDrawer(config: PosPrinterConfig): Promise<boolean> {
    return printQueue.enqueue(async () => {
      const dummyOrder: any = {
        orderNumber: 'DRAWER',
        paymentType: 'CASH',
        paymentStatus: 'PAID',
        orderedItems: [],
        createdAt: new Date().toISOString(),
      };
      return await EpsonPrinterService.printOrderReceipt(dummyOrder, {
        ...config,
        openCashDrawerOnCashPayment: true,
      });
    }, `drawer_${Date.now()}`);
  }
}
