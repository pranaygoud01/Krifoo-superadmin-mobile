import * as Print from 'expo-print';
import { PrinterTransport, TransportResult } from './transport.types';

export class SystemTransport implements PrinterTransport {
  constructor(private htmlContent?: string) {}

  async isAvailable(): Promise<boolean> {
    return true; // System spooler / AirPrint is available on all iOS and Android devices
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    try {
      const html =
        this.htmlContent ||
        (typeof payload === 'string' && payload.startsWith('<')
          ? payload
          : `<html><body><pre>${typeof payload === 'string' ? payload : new TextDecoder().decode(payload)}</pre></body></html>`);

      await Print.printAsync({ html });
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
