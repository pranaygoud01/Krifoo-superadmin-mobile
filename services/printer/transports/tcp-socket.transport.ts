import { PrinterTransport, TransportResult } from './transport.types';

export class TcpSocketTransport implements PrinterTransport {
  constructor(private ipAddress: string, private port: number = 9100) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.ipAddress && this.ipAddress.trim().length > 0 && this.port > 0);
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    const ip = this.ipAddress?.trim();
    if (!ip) {
      return { ok: false, kind: 'unreachable', detail: 'No IP address configured' };
    }

    const dataBytes =
      typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;

    // Check if react-native-tcp-socket is available in the current environment
    let TcpSocket: any;
    try {
      TcpSocket = require('react-native-tcp-socket').default || require('react-native-tcp-socket');
    } catch {
      TcpSocket = null;
    }

    if (!TcpSocket || typeof TcpSocket.createConnection !== 'function') {
      return {
        ok: false,
        kind: 'unreachable',
        detail: 'Native TCP Socket module (react-native-tcp-socket) is not available in this build.',
      };
    }

    return new Promise((resolve) => {
      let client: any = null;
      let writeCompleted = false;
      let isResolved = false;

      const finish = (result: TransportResult) => {
        if (!isResolved) {
          isResolved = true;
          try {
            if (client) {
              client.destroy();
            }
          } catch {}
          resolve(result);
        }
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          kind: 'timeout',
          detail: `TCP connection to ${ip}:${this.port} timed out after 6s`,
        });
      }, 6000);

      try {
        client = TcpSocket.createConnection(
          {
            port: this.port,
            host: ip,
            timeout: 5000,
          },
          () => {
            // Connected! Send the raw ESC/POS bytes payload
            try {
              client.write(dataBytes, (err: any) => {
                if (err) {
                  clearTimeout(timer);
                  finish({
                    ok: false,
                    kind: 'protocol_error',
                    detail: `Socket write error: ${err.message || err}`,
                  });
                } else {
                  writeCompleted = true;
                  // Allow buffer flush then close cleanly
                  setTimeout(() => {
                    clearTimeout(timer);
                    finish({ ok: true, rawResponse: 'write_ack' });
                  }, 300);
                }
              });
            } catch (writeErr: any) {
              clearTimeout(timer);
              finish({
                ok: false,
                kind: 'protocol_error',
                detail: `Socket write exception: ${writeErr.message}`,
              });
            }
          }
        );

        client.on('error', (err: any) => {
          clearTimeout(timer);
          const errMsg = (err?.message || String(err)).toLowerCase();
          const errCode = (err?.code || '').toUpperCase();

          // If write was already successfully transmitted, socket close/reset is normal printer behavior
          if (writeCompleted) {
            finish({ ok: true, rawResponse: 'write_complete_after_close' });
            return;
          }

          if (errCode === 'ECONNREFUSED' || errMsg.includes('refused')) {
            finish({ ok: false, kind: 'refused', detail: `Connection refused on ${ip}:${this.port}` });
          } else if (errCode === 'ETIMEDOUT' || errMsg.includes('timeout')) {
            finish({ ok: false, kind: 'timeout', detail: `Connection timed out to ${ip}:${this.port}` });
          } else {
            finish({ ok: false, kind: 'unreachable', detail: `Socket error (${errCode || 'UNKNOWN'}): ${err?.message || err}` });
          }
        });

        client.on('close', () => {
          clearTimeout(timer);
          // ESC/POS printers frequently close connection immediately after receiving print job
          if (writeCompleted) {
            finish({ ok: true, rawResponse: 'closed_after_successful_write' });
          } else {
            finish({ ok: false, kind: 'refused', detail: `Socket closed before write could complete` });
          }
        });
      } catch (connErr: any) {
        clearTimeout(timer);
        finish({
          ok: false,
          kind: 'unreachable',
          detail: `Failed to initiate TCP connection: ${connErr.message}`,
        });
      }
    });
  }
}
