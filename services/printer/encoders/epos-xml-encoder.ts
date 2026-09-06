import { CommandEncoder } from './encoder.types';
import { ReceiptCommand } from '../receipt-document';
import { PosPrinterConfig } from '../../pos-config.service';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const EposXmlEncoder: CommandEncoder<string> = {
  contentType: 'text/xml; charset=utf-8',

  encode(doc: ReceiptCommand[], config?: Partial<PosPrinterConfig>): string {
    const is58mm = config?.paperWidth === '58mm';
    const cols = is58mm ? 32 : 48;

    let bodyXml = '';

    for (const cmd of doc) {
      switch (cmd.type) {
        case 'text': {
          const align = cmd.align || 'left';
          const isDouble = cmd.size === 'double';
          const width = isDouble ? '2' : '1';
          const height = isDouble ? '2' : '1';
          const em = cmd.bold ? 'true' : 'false';
          const escaped = escapeXml(cmd.value);
          bodyXml += `    <text align="${align}" width="${width}" height="${height}" em="${em}">${escaped}&#10;</text>\n`;
          break;
        }

        case 'line': {
          bodyXml += `    <text align="left" width="1" height="1" em="false">${'-'.repeat(cols)}&#10;</text>\n`;
          break;
        }

        case 'feed': {
          const lines = Math.max(1, cmd.lines || 1);
          bodyXml += `    <feed line="${lines}" />\n`;
          break;
        }

        case 'cut': {
          const cutType = cmd.mode === 'full' ? 'no_feed' : 'feed';
          bodyXml += `    <cut type="${cutType}" />\n`;
          break;
        }

        case 'drawer': {
          const drawerPin = cmd.pin === 2 ? '2' : '1';
          bodyXml += `    <pulse drawer="${drawerPin}" time="100" />\n`;
          break;
        }

        case 'qr': {
          bodyXml += `    <symbol type="qrcode_model_2" level="default" width="6" height="6" size="0">${escapeXml(cmd.data)}</symbol>\n`;
          break;
        }

        case 'barcode': {
          bodyXml += `    <barcode type="code128" width="2" height="64" hri="below">${escapeXml(cmd.data)}</barcode>\n`;
          break;
        }
      }
    }

    return (
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">\n` +
      `  <s:Body>\n` +
      `    <epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">\n` +
      bodyXml +
      `    </epos-print>\n` +
      `  </s:Body>\n` +
      `</s:Envelope>`
    );
  },
};
