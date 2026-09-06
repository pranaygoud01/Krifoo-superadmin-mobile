import { PrinterProfile, PosBrand } from '../pos-config.service';
import { CommandEncoder } from './encoders/encoder.types';
import { EscPosEncoder } from './encoders/escpos-encoder';
import { EposXmlEncoder } from './encoders/epos-xml-encoder';
import { PrinterTransport } from './transports/transport.types';
import { HttpEposTransport } from './transports/http-epos.transport';
import { TcpSocketTransport } from './transports/tcp-socket.transport';
import { BleTransport } from './transports/ble.transport';
import { SppTransport } from './transports/spp.transport';
import { SunmiTransport } from './transports/sunmi.transport';
import { SystemTransport } from './transports/system.transport';

export interface RegisteredPrinter {
  id: string;
  model: string; // Informational label, e.g. 'Epson ePOS HTTP', 'Sunmi AIDL'
  profile: PrinterProfile;
  encoder: CommandEncoder<any>;
  transport: PrinterTransport;
}

export interface ResolvePrinterOptions {
  brand?: PosBrand;
  paperWidth?: '80mm' | '58mm';
  orderContext?: any;
  configContext?: any;
}

/**
 * Maps a connection profile to its exact pair of (encoder, transport).
 * This is the ONLY place that binds transport and wire encoding to connection type.
 */
export function resolvePrinter(
  profile: PrinterProfile,
  options?: ResolvePrinterOptions
): RegisteredPrinter {
  switch (profile.connectionType) {
    case 'network_epos':
      return {
        id: `epos_${profile.ipAddress}_${profile.port || 8008}`,
        model: 'Epson ePOS-Print (HTTP/SOAP)',
        profile,
        encoder: EposXmlEncoder,
        transport: new HttpEposTransport(profile.ipAddress, profile.port),
      };

    case 'network_raw':
      return {
        id: `tcp_${profile.ipAddress}_${profile.port}`,
        model: 'Generic ESC/POS (TCP 9100)',
        profile,
        encoder: EscPosEncoder,
        transport: new TcpSocketTransport(profile.ipAddress, profile.port),
      };

    case 'ble':
      return {
        id: `ble_${profile.macAddress}`,
        model: 'Epson / Star BLE GATT',
        profile,
        encoder: EscPosEncoder,
        transport: new BleTransport(profile.macAddress, profile.serviceUuid, profile.writeCharacteristicUuid),
      };

    case 'spp':
      return {
        id: `spp_${profile.macAddress}`,
        model: 'Classic Bluetooth (SPP RFCOMM)',
        profile,
        encoder: EscPosEncoder,
        transport: new SppTransport(profile.macAddress, profile.target),
      };

    case 'builtin':
      return {
        id: 'sunmi_builtin',
        model: 'SUNMI Built-in POS Terminal',
        profile,
        encoder: EscPosEncoder,
        transport: new SunmiTransport(options?.orderContext, options?.configContext),
      };

    case 'system':
    default:
      return {
        id: 'system_spooler',
        model: 'System Print Spooler (AirPrint / Android)',
        profile,
        encoder: EposXmlEncoder,
        transport: new SystemTransport(),
      };
  }
}
