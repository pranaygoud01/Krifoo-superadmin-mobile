import { TransportResult } from './transports/transport.types';

export type PrintFailureReason =
  | 'unreachable'
  | 'timeout'
  | 'printer_error' // reachable, but device reports a fault (paper out, cover open, etc.)
  | 'wrong_device' // reachable, but response isn't a recognizable printer protocol response
  | 'no_ip_configured'
  | 'not_supported_on_platform';

export type PrintResult =
  | { success: true; rawResponse?: unknown }
  | { success: false; reason: PrintFailureReason; detail?: string; printerCode?: string };

/**
 * Parses and classifies an Epson ePOS-Print XML HTTP response.
 * Structurally fixes Bug #3 and Bug #12 by verifying actual SOAP XML tags and fault codes.
 */
export function classifyEposXmlResult(result: TransportResult, bodyOverride?: string): PrintResult {
  if (!result.ok) {
    if (result.kind === 'timeout') {
      return {
        success: false,
        reason: 'timeout',
        detail: result.detail || 'Printer connection timed out.',
      };
    }
    return {
      success: false,
      reason: 'unreachable',
      detail: result.detail || 'Printer device is unreachable on the network.',
    };
  }

  const rawBody = (bodyOverride || (typeof result.rawResponse === 'string' ? result.rawResponse : '')).trim();

  if (!rawBody) {
    return {
      success: false,
      reason: 'wrong_device',
      detail: 'Printer returned an empty HTTP response body.',
    };
  }

  const lower = rawBody.toLowerCase();

  // 1. Detect Captive Portal or Non-Printer Web Server (e.g. router admin or HTTP 200 web page)
  if (lower.startsWith('<!doctype html') || lower.includes('<html') || lower.includes('<head>')) {
    return {
      success: false,
      reason: 'wrong_device',
      detail: 'Target IP is a web server or router, not an Epson ePOS-Print thermal printer.',
    };
  }

  // 2. Validate presence of Epson ePOS XML envelope
  if (!rawBody.includes('epos-print') && !rawBody.includes('response')) {
    return {
      success: false,
      reason: 'wrong_device',
      detail: 'Response does not contain valid Epson ePOS-Print SOAP XML.',
    };
  }

  // 3. Check success attribute in <response success="true" ... />
  const successMatch = rawBody.match(/success=["'](true|false)["']/i);
  const codeMatch = rawBody.match(/code=["']([^"']+)["']/i);
  const statusMatch = rawBody.match(/status=["']([^"']+)["']/i);

  const isSuccess = successMatch ? successMatch[1].toLowerCase() === 'true' : rawBody.includes('success="true"');
  const printerCode = codeMatch ? codeMatch[1] : undefined;
  const statusHex = statusMatch ? statusMatch[1] : undefined;

  if (isSuccess) {
    return {
      success: true,
      rawResponse: rawBody,
    };
  }

  // 4. Extract human-readable error from printer code
  let humanError = `Epson ePOS fault code: ${printerCode || statusHex || 'Unknown'}`;
  if (printerCode) {
    const pc = printerCode.toUpperCase();
    if (pc.includes('PAPER') || pc.includes('EMPTY') || pc.includes('END')) {
      humanError = 'Printer is out of paper (Paper End / Empty).';
    } else if (pc.includes('COVER') || pc.includes('OPEN')) {
      humanError = 'Printer cover is open.';
    } else if (pc.includes('OFFLINE')) {
      humanError = 'Printer is offline or busy.';
    } else if (pc.includes('DEV_NOT_FOUND') || pc.includes('DEVICE_NOT_FOUND')) {
      humanError = 'Configured printer device ID not found on unit.';
    } else if (pc.includes('MEMORY') || pc.includes('OVERFLOW')) {
      humanError = 'Printer buffer overflow.';
    }
  }

  return {
    success: false,
    reason: 'printer_error',
    printerCode,
    detail: humanError,
  };
}

/**
 * Classifies raw byte socket / BLE / SPP transport outcomes.
 * Requires explicit write acknowledgement; avoids false positives on dropped connections.
 */
export function classifyRawByteResult(result: TransportResult): PrintResult {
  if (result.ok) {
    return {
      success: true,
      rawResponse: result.rawResponse,
    };
  }

  if (result.kind === 'timeout') {
    return {
      success: false,
      reason: 'timeout',
      detail: result.detail || 'Connection to printer timed out.',
    };
  }

  if (result.detail && result.detail.includes('iOS')) {
    return {
      success: false,
      reason: 'not_supported_on_platform',
      detail: result.detail,
    };
  }

  return {
    success: false,
    reason: 'unreachable',
    detail: result.detail || 'Failed to transmit payload to printer.',
  };
}
