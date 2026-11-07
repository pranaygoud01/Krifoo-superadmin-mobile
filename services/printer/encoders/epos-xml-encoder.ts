import { CommandEncoder } from './encoder.types';
import { ReceiptCommand } from '../receipt-document';
import { PosPrinterConfig, printOffsetDots } from '../../pos-config.service';
import { rasterizeImage } from './image-rasterizer';
import { Buffer } from 'buffer';
import { alignInColumns, capacityFor, code128Data, logoMaxDots, wrapText } from './text-utils';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Epson ePOS-Print XML encoder (HTTP port 80 / 8008).
 * Mirrors the ESC/POS encoder: software alignment inside the line width, same fonts,
 * sizes, logo dimensions and line widths, so both protocols print identical receipts.
 */
export const EposXmlEncoder: CommandEncoder<string> = {
  contentType: 'text/xml; charset=utf-8',

  encode(doc: ReceiptCommand[], config?: Partial<PosPrinterConfig>): string {
    const paperWidth: '58mm' | '80mm' = config?.paperWidth === '80mm' ? '80mm' : '58mm';
    let bodyXml = '    <text lang="en" smooth="true"/>\n';
    // Print position: x = horizontal start (in dots) of each text line
    const offset = printOffsetDots(config);
    const xAttr = offset > 0 ? ` x="${offset}"` : '';

    for (const cmd of doc) {
      switch (cmd.type) {
        case 'text': {
          const font = cmd.size === 'small' ? 'fontB' : cmd.font || 'fontA';
          const capacity = capacityFor(paperWidth, font, cmd.size);
          const width = cmd.size === 'double' ? 2 : 1;
          const height = cmd.size === 'double' || cmd.size === 'tall' ? 2 : 1;
          const attrs =
            `align="left"${xAttr} font="${font === 'fontB' ? 'font_b' : 'font_a'}" width="${width}" height="${height}" ` +
            `em="${cmd.bold ? 'true' : 'false'}"`;
          const lines = wrapText(cmd.value, capacity);
          for (const l of lines.length ? lines : ['']) {
            bodyXml += `    <text ${attrs}>${escapeXml(alignInColumns(l, capacity, cmd.align))}&#10;</text>\n`;
          }
          break;
        }

        case 'image': {
          const max = logoMaxDots(paperWidth);
          const img = rasterizeImage(cmd.data, max.width, max.height);
          if (img) {
            const align = cmd.align || 'center';
            bodyXml += `    <image width="${img.width}" height="${img.height}" align="${align}" color="color_1" mode="mono">${Buffer.from(img.data).toString('base64')}</image>\n`;
          }
          break;
        }

        case 'spacing': {
          const linespc = cmd.mode === 'compact' ? 18 : cmd.mode === 'relaxed' ? 40 : 30;
          bodyXml += `    <text linespc="${linespc}"/>\n`;
          break;
        }

        case 'line': {
          const font = cmd.font || 'fontA';
          const width = capacityFor(paperWidth, font, 'normal');
          bodyXml += `    <text align="left"${xAttr} font="${font === 'fontB' ? 'font_b' : 'font_a'}" width="1" height="1" em="false">${escapeXml((cmd.char || '-').charAt(0).repeat(width))}&#10;</text>\n`;
          break;
        }

        case 'feed':
          bodyXml += `    <feed line="${Math.max(1, cmd.lines || 1)}" />\n`;
          break;

        case 'cut':
          // Both variants feed to the cutter so the last lines are never cut through
          bodyXml += `    <cut type="feed" />\n`;
          break;

        case 'drawer':
          bodyXml += `    <pulse drawer="${cmd.pin === 2 ? 'drawer_2' : 'drawer_1'}" time="pulse_100" />\n`;
          break;

        case 'qr':
          // <symbol> has no align attribute — alignment comes from the preceding <text align>
          bodyXml += `    <text align="center"/>\n`;
          bodyXml += `    <symbol type="qrcode_model_2" level="level_m" width="${paperWidth === '58mm' ? 5 : 6}" height="0" size="0">${escapeXml(cmd.data)}</symbol>\n`;
          bodyXml += `    <feed line="1"/>\n    <text align="left"/>\n`;
          break;

        case 'barcode':
          bodyXml += `    <text align="center"/>\n`;
          bodyXml += `    <barcode type="code128" hri="below" width="2" height="64">${escapeXml(code128Data(cmd.data))}</barcode>\n`;
          bodyXml += `    <feed line="1"/>\n    <text align="left"/>\n`;
          break;
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
