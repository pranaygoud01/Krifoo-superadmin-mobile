import { PrinterTransport, TransportResult } from './transport.types';
import { printHtmlWithSystemDialog } from '../system-print';

let Print: any = null;
try {
  Print = require('expo-print');
} catch (e) {
  console.warn('[SystemTransport] ExpoPrint native module not available in this client.');
}

export class SystemTransport implements PrinterTransport {
  constructor(
    private htmlContent?: string,
    private paperWidth: '80mm' | '58mm' = '80mm'
  ) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(Print && (Print.printAsync || Print.printToFileAsync));
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    if (!Print) {
      return {
        ok: false,
        kind: 'protocol_error',
        detail: 'expo-print is not available in this client environment',
      };
    }
    try {
      const html =
        this.htmlContent ||
        (typeof payload === 'string' && payload.startsWith('<')
          ? payload
          : `<html><body><pre>${typeof payload === 'string' ? payload : new TextDecoder().decode(payload)}</pre></body></html>`);

      // Format as thermal receipt (width: 226pt for 80mm roll, 164pt for 58mm roll)
      const targetWidth = this.paperWidth === '58mm' ? 164 : 226;
      const outcome = await printHtmlWithSystemDialog(html, targetWidth);
      if (outcome === 'cancelled') {
        return { ok: false, kind: 'protocol_error', detail: 'Print cancelled.' };
      }
      return { ok: true, rawResponse: 'system_print_spooled' };
    } catch (err: any) {
      return {
        ok: false,
        kind: 'protocol_error',
        detail: err?.message || 'System print cancelled or spooler failed',
      };
    }
  }
}
