import { PrinterProfile, PosBrand } from '../pos-config.service';
import { CommandEncoder } from './encoders/encoder.types';
import { EscPosEncoder } from './encoders/escpos-encoder';
import { EposXmlEncoder } from './encoders/epos-xml-encoder';
import { HtmlReceiptEncoder } from './encoders/receipt-lines';
import { PrinterTransport } from './transports/transport.types';
import { HttpEposTransport } from './transports/http-epos.transport';
import { TcpSocketTransport } from './transports/tcp-socket.transport';
import { BleTransport } from './transports/ble.transport';
import { SppTransport } from './transports/spp.transport';
import { SunmiTransport, SunmiJobMode } from './transports/sunmi.transport';
import { SystemTransport } from './transports/system.transport';

import { ReceiptTemplate } from '../receipt-customization.service';

export interface RegisteredPrinter {
  id: string;
  model: string; // Informational label, e.g. 'Epson ePOS HTTP', 'Sunmi built-in'
  profile: PrinterProfile;
  encoder: CommandEncoder<any>;
  transport: PrinterTransport;
}

export interface ResolvePrinterOptions {
  brand?: PosBrand;
  paperWidth?: '80mm' | '58mm';
  orderContext?: any;
  configContext?: any;
  templateContext?: ReceiptTemplate;
  htmlContent?: string;
  /** Sunmi only: 'drawer' opens the cash drawer through the Sunmi API. */
  mode?: SunmiJobMode;
}

/**
 * Maps a connection profile to its exact pair of (encoder, transport).
 * This is the ONLY place that binds transport and wire encoding to connection type.
 */
export function resolvePrinter(profile: PrinterProfile, options?: ResolvePrinterOptions): RegisteredPrinter {
  switch (profile.connectionType) {
    case 'network_epos':
      return {
        id: `epos_${profile.ipAddress}_${profile.port || 8008}`,
        model: 'Epson ePOS-Print (HTTP)',
        profile,
        encoder: EposXmlEncoder,
        transport: new HttpEposTransport(profile.ipAddress, profile.port),
      };

    case 'network_raw':
      return {
        id: `tcp_${profile.ipAddress}_${profile.port || 9100}`,
        model: 'ESC/POS network printer (TCP)',
        profile,
        encoder: EscPosEncoder,
        transport: new TcpSocketTransport(profile.ipAddress, profile.port || 9100),
      };

    case 'ble':
      return {
        id: `ble_${profile.macAddress}`,
        model: 'Bluetooth LE printer',
        profile,
        encoder: EscPosEncoder,
        transport: new BleTransport(profile.macAddress, profile.serviceUuid, profile.writeCharacteristicUuid),
      };

    case 'spp':
      return {
        id: `spp_${profile.macAddress}`,
        model: 'Bluetooth printer (Classic)',
        profile,
        encoder: EscPosEncoder,
        transport: new SppTransport(profile.macAddress, profile.target),
      };

    case 'builtin':
      return {
        id: 'sunmi_builtin',
        model: 'Sunmi built-in printer',
        profile,
        // Sunmi accepts raw ESC/POS, so it prints exactly the same document as other printers
        encoder: EscPosEncoder,
        transport: new SunmiTransport(options?.orderContext, options?.configContext, options?.templateContext, options?.mode),
      };

    case 'system':
    default:
      return {
        id: 'system_spooler',
        model: 'System print (AirPrint / Android)',
        profile,
        // Printable HTML (never raw printer XML) when no pre-built HTML is supplied
        encoder: HtmlReceiptEncoder,
        transport: new SystemTransport(options?.htmlContent, options?.paperWidth || '80mm'),
      };
  }
}
