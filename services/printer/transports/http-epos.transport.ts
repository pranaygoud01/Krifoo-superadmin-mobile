import { PrinterTransport, TransportResult } from './transport.types';

// Module-level cache remembering the last working endpoint for each printer IP
const workingEndpointCache = new Map<string, string>();

export class HttpEposTransport implements PrinterTransport {
  constructor(private ipAddress: string, private port?: number) {}

  async isAvailable(): Promise<boolean> {
    return Boolean(this.ipAddress && this.ipAddress.trim().length > 0);
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    const ip = this.ipAddress?.trim();
    if (!ip) {
      return { ok: false, kind: 'unreachable', detail: 'No IP address configured' };
    }

    const xmlBody = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);

    // Build candidate endpoint list, placing any known working endpoint first
    const configuredPort = this.port || 8008;
    const path = '/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000';
    // Port 80 and the default HTTP port are the same endpoint — don't try it twice
    const candidates = Array.from(
      new Set([
        configuredPort === 80 ? `http://${ip}${path}` : `http://${ip}:${configuredPort}${path}`,
        `http://${ip}${path}`,
      ])
    );

    const cachedEndpoint = workingEndpointCache.get(ip);
    const orderedEndpoints = cachedEndpoint
      ? [cachedEndpoint, ...candidates.filter((ep) => ep !== cachedEndpoint)]
      : candidates;

    let lastError = '';

    for (let i = 0; i < orderedEndpoints.length; i++) {
      const endpoint = orderedEndpoints[i];
      try {
        const controller = new AbortController();
        // First endpoint gets the full timeout; the fallback is a quick probe (max ~10s overall)
        const timeoutId = setTimeout(() => controller.abort(), i === 0 ? 6500 : 3500);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            SOAPAction: '""',
            'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
          },
          body: xmlBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const text = await response.text();

        if (response.ok || response.status === 200) {
          // Remember this working endpoint
          workingEndpointCache.set(ip, endpoint);
          return { ok: true, rawResponse: text };
        } else {
          lastError = `HTTP status ${response.status} from ${endpoint}`;
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError = `Connection to ${endpoint} timed out`;
        } else {
          lastError = err.message || `Failed to connect to ${endpoint}`;
        }
      }
    }

    // If cached endpoint failed, remove it from cache
    if (cachedEndpoint) {
      workingEndpointCache.delete(ip);
    }

    const isTimeout = lastError.toLowerCase().includes('time');
    return {
      ok: false,
      kind: isTimeout ? 'timeout' : 'unreachable',
      detail: lastError || 'Printer endpoints unreachable',
    };
  }
}
