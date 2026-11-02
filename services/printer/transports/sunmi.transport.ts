import { PrinterTransport, TransportResult } from './transport.types';
import { isSunmiAvailable, printSunmiOrderReceipt } from '../../sunmi-printer.service';
import { getActiveReceiptTemplate, ReceiptTemplate } from '../../receipt-customization.service';

export class SunmiTransport implements PrinterTransport {
  constructor(
    private orderContext?: any,
    private configContext?: any,
    private templateContext?: ReceiptTemplate
  ) {}

  async isAvailable(): Promise<boolean> {
    return isSunmiAvailable();
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    const available = await isSunmiAvailable();
    if (!available) {
      return {
        ok: false,
        kind: 'unreachable',
        detail: 'Sunmi POS Hardware Service is not available on this device.',
      };
    }

    try {
      if (this.orderContext) {
        const restId = typeof this.orderContext?.restaurantId === 'object' ? this.orderContext.restaurantId?._id : (this.orderContext?.restaurantId || this.orderContext?.restaurant);
        const activeTemplate = this.templateContext || (await getActiveReceiptTemplate(restId ? String(restId) : undefined));
        const success = await printSunmiOrderReceipt(this.orderContext, activeTemplate, this.configContext);
        if (success) {
          return { ok: true, rawResponse: 'sunmi_print_success' };
        }
      } else {
        // Handle alignment / calibration test slips on Sunmi when no orderContext is passed
        const { getSunmiModule } = require('../../sunmi-printer.service');
        const sunmi = getSunmiModule();
        if (sunmi && typeof sunmi.printerInit === 'function') {
          sunmi.printerInit();
          const targetWidth = this.configContext?.paperWidth || '58mm';
          const is80 = targetWidth === '80mm';
          const cols = is80 ? 48 : 32;
          const ruler = is80
            ? '01--------10--------20--------30--------40----48\n'
            : '01--------10--------20--------32\n';
          sunmi.setAlignment(1); // Center
          sunmi.setFontSize(22);
          sunmi.setFontWeight(true);
          sunmi.printerText('SUNMI HARDWARE CALIBRATION\n');
          sunmi.setFontSize(18);
          sunmi.setFontWeight(false);
          sunmi.printerText(`Paper Width: ${targetWidth} (${cols} Columns)\n`);
          sunmi.printerText(is80 ? '------------------------------------------------\n' : '--------------------------------\n');
          sunmi.setAlignment(0); // Left
          sunmi.printerText(ruler);
          sunmi.lineWrap(3);
          try { sunmi.cutPaper(); } catch {}
          return { ok: true, rawResponse: 'sunmi_calibration_success' };
        }
      }
      return { ok: true, rawResponse: 'sunmi_write_ack' };
    } catch (err: any) {
      return {
        ok: false,
        kind: 'protocol_error',
        detail: err?.message || 'Sunmi print failed',
      };
    }
  }
}
