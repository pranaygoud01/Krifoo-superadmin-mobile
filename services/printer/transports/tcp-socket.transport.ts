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

    // Check if react-native-tcp-socket native module is compiled into this build
    let TcpSocket: any;
    let hasNativeModule = false;
    try {
      const { NativeModules } = require('react-native');
      hasNativeModule = Boolean(NativeModules?.TcpSockets || NativeModules?.TcpSocketModule);
      TcpSocket = require('react-native-tcp-socket').default || require('react-native-tcp-socket');
    } catch {
      TcpSocket = null;
    }

    if (!TcpSocket || typeof TcpSocket.createConnection !== 'function' || !hasNativeModule) {
      return {
        ok: false,
        kind: 'unreachable',
        detail: 'Native TCP Socket module is not compiled into this development build APK yet. Please rebuild with `npx expo run:android` or use Bluetooth.',
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
              if (typeof client.end === 'function') {
                client.end();
              }
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
          detail: `Connection timed out to printer at ${ip}:${this.port}. Check that the printer is ON, connected to the same Wi-Fi, and Mobile Data is turned off.`,
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
                  }, 250);
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

        client.on('timeout', () => {
          clearTimeout(timer);
          finish({
            ok: false,
            kind: 'timeout',
            detail: `Connection timed out to printer at ${ip}:${this.port}. Check that the printer is ON, connected to the same Wi-Fi, and Mobile Data is turned off.`,
          });
        });

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
            finish({
              ok: false,
              kind: 'refused',
              detail: `Connection refused by printer at ${ip}:${this.port}. Another device may be printing or the printer was recently restarted.`,
            });
          } else if (errCode === 'ETIMEDOUT' || errMsg.includes('timeout')) {
            finish({
              ok: false,
              kind: 'timeout',
              detail: `Connection timed out to printer at ${ip}:${this.port}. Check that the printer is ON, connected to the same Wi-Fi, and Mobile Data is turned off.`,
            });
          } else if (errCode === 'EHOSTUNREACH' || errMsg.includes('unreachable') || errMsg.includes('no route')) {
            finish({
              ok: false,
              kind: 'unreachable',
              detail: `Cannot reach ${ip}:${this.port}. Ensure your tablet is connected to the same Wi-Fi network as the printer.`,
            });
          } else {
            finish({
              ok: false,
              kind: 'unreachable',
              detail: `Network error connecting to ${ip}:${this.port} (${errCode || 'ERROR'}): ${err?.message || err}`,
            });
          }
        });

        client.on('close', () => {
          clearTimeout(timer);
          // ESC/POS printers frequently close connection immediately after receiving print job
          if (writeCompleted) {
            finish({ ok: true, rawResponse: 'closed_after_successful_write' });
          } else {
            finish({
              ok: false,
              kind: 'refused',
              detail: `Socket closed before print data could be transmitted to ${ip}:${this.port}`,
            });
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
