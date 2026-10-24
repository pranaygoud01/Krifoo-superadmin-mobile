import { CommandEncoder } from './encoder.types';
import { ReceiptCommand } from '../receipt-document';
import { PosPrinterConfig } from '../../pos-config.service';
import { rasterizeImage } from './image-rasterizer';
import { Buffer } from 'buffer';

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
    const is58mm = config?.paperWidth !== '80mm';
    const cols = is58mm ? 32 : 48;

    let bodyXml = '';

    const wrapLine = (text: string, maxWidth: number): string[] => {
      if (!text) return [''];
      if (text.length <= maxWidth) return [text];
      const words = text.split(' ');
      const lines: string[] = [];
      let current = '';

      for (const word of words) {
        if (!current) {
          current = word;
        } else if ((current + ' ' + word).length <= maxWidth) {
          current += ' ' + word;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) {
        lines.push(current);
      }
      return lines;
    };

    for (const cmd of doc) {
      switch (cmd.type) {
        case 'text': {
          if (is58mm) {
            const wantsDouble = cmd.size === 'double';
            const canBeDouble = wantsDouble && cmd.value.length <= 16;
            const lineCapacity = canBeDouble ? 16 : 32;
            const width = canBeDouble ? '2' : '1';
            const height = canBeDouble ? '2' : '1';
            const em = cmd.bold ? 'true' : 'false';

            const rawLines = cmd.value.split('\n');
            for (const rLine of rawLines) {
              const wrapped = wrapLine(rLine, lineCapacity);
              for (const line of wrapped) {
                let formatted = line;
                if (cmd.align === 'center') {
                  const pad = Math.max(0, Math.floor((lineCapacity - line.length) / 2));
                  formatted = ' '.repeat(pad) + line;
                } else if (cmd.align === 'right') {
                  const pad = Math.max(0, lineCapacity - line.length);
                  formatted = ' '.repeat(pad) + line;
                }
                const escaped = escapeXml(formatted);
                bodyXml += `    <text align="left" width="${width}" height="${height}" em="${em}">${escaped}&#10;</text>\n`;
              }
            }
          } else {
            const align = cmd.align || 'left';
            const isDouble = cmd.size === 'double';
            const width = isDouble ? '2' : '1';
            const height = isDouble ? '2' : '1';
            const em = cmd.bold ? 'true' : 'false';
            const escaped = escapeXml(cmd.value);
            bodyXml += `    <text align="${align}" width="${width}" height="${height}" em="${em}">${escaped}&#10;</text>\n`;
          }
          break;
        }

        case 'image': {
          const maxDots = is58mm ? 256 : 384;
          const img = rasterizeImage(cmd.data, maxDots);
          if (img) {
            const align = is58mm ? 'left' : (cmd.align || 'center');
            const base64Raster = Buffer.from(img.data).toString('base64');
            bodyXml += `    <image width="${img.width}" height="${img.height}" align="${align}">${base64Raster}</image>\n`;
          }
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
