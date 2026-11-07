import { Buffer } from 'buffer';
import { PrinterTransport, TransportResult } from './transport.types';
import { getSunmiModule, isSunmiAvailable, printSunmiOrderReceipt } from '../../sunmi-printer.service';
import { getActiveReceiptTemplate, ReceiptTemplate } from '../../receipt-customization.service';

export type SunmiJobMode = 'receipt' | 'drawer';

/** Sunmi `updatePrinterState()` codes → human readable faults. */
const SUNMI_FAULTS: Record<number, string> = {
  3: 'Printer communication error. Restart the Sunmi device.',
  4: 'Printer is out of paper.',
  5: 'Printer is overheated. Wait a moment and try again.',
  6: 'Printer cover is open.',
  7: 'Paper cutter error.',
  9: 'Black mark not detected (check paper type).',
  505: 'No printer detected on this device.',
  507: 'Printer firmware update failed.',
};

/**
 * Sunmi built-in printer.
 * Receipts are sent as the SAME ESC/POS bytes every other printer receives (Sunmi accepts raw
 * ESC/POS via `sendRAWData`), so Sunmi output matches the template exactly. The legacy
 * text-API renderer is only used when an older SDK without `sendRAWData` is installed.
 */
export class SunmiTransport implements PrinterTransport {
  constructor(
    private orderContext?: any,
    private configContext?: any,
    private templateContext?: ReceiptTemplate,
    private mode: SunmiJobMode = 'receipt'
  ) {}

  async isAvailable(): Promise<boolean> {
    return isSunmiAvailable();
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    if (!(await isSunmiAvailable())) {
      return { ok: false, kind: 'unreachable', detail: 'The Sunmi built-in printer is not available on this device.' };
    }
    const sunmi = getSunmiModule();
    if (!sunmi) {
      return { ok: false, kind: 'unreachable', detail: 'Sunmi printer service is not linked in this build.' };
    }

    try {
      // 1. Check printer status first so paper-out / cover-open are reported instead of hidden
      if (typeof sunmi.updatePrinterState === 'function') {
        try {
          const state = Number(await sunmi.updatePrinterState());
          if (SUNMI_FAULTS[state]) {
            return { ok: false, kind: 'printer_error', detail: SUNMI_FAULTS[state] };
          }
        } catch {
          // Status not supported on this model — continue
        }
      }

      // 2. Cash drawer
      if (this.mode === 'drawer' && typeof sunmi.openDrawer === 'function') {
        await sunmi.openDrawer();
        return { ok: true, rawResponse: 'sunmi_drawer_opened' };
      }

      // 3. Raw ESC/POS (preferred — identical output to every other printer)
      if (typeof sunmi.sendRAWData === 'function') {
        const bytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
        if (!bytes.length) return { ok: true, rawResponse: 'sunmi_empty_payload' };
        await sunmi.sendRAWData(Buffer.from(bytes).toString('base64'));
        return { ok: true, rawResponse: 'sunmi_raw_sent' };
      }

      // 4. Legacy SDK fallback (no raw data support)
      if (this.mode === 'receipt' && this.orderContext) {
        const restId =
          typeof this.orderContext?.restaurantId === 'object'
            ? this.orderContext.restaurantId?._id
            : this.orderContext?.restaurantId || this.orderContext?.restaurant;
        const template = this.templateContext || (await getActiveReceiptTemplate(restId ? String(restId) : undefined));
        const printed = await printSunmiOrderReceipt(this.orderContext, template, this.configContext);
        return printed
          ? { ok: true, rawResponse: 'sunmi_legacy_print' }
          : { ok: false, kind: 'protocol_error', detail: 'The Sunmi printer did not accept the receipt.' };
      }

      return {
        ok: false,
        kind: 'protocol_error',
        detail: 'This Sunmi printer SDK cannot print this document. Please update the app.',
      };
    } catch (err: any) {
      return { ok: false, kind: 'protocol_error', detail: err?.message || 'Sunmi print failed' };
    }
  }
}
