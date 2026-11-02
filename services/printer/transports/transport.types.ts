export interface PrinterTransport {
  send(payload: Uint8Array | string): Promise<TransportResult>;
  isAvailable(): Promise<boolean>;
}

export type TransportResult =
  | { ok: true; rawResponse?: unknown }
  | { ok: false; kind: 'unreachable' | 'timeout' | 'refused' | 'protocol_error'; detail: string };
