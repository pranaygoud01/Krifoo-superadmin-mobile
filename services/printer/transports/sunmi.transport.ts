import { PrinterTransport, TransportResult } from './transport.types';
import { isSunmiAvailable, printSunmiOrderReceipt } from '../../sunmi-printer.service';

export class SunmiTransport implements PrinterTransport {
  constructor(private orderContext?: any, private configContext?: any) {}

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
        const success = await printSunmiOrderReceipt(this.orderContext);
        if (success) {
          return { ok: true, rawResponse: 'sunmi_print_success' };
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
