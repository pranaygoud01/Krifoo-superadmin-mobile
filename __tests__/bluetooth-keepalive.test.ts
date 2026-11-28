/**
 * Bluetooth printers keep their connection open during a rush:
 * one connect for many receipts, close after a quiet spell, and recover from a link
 * that dropped silently — without ever printing a receipt twice.
 */
import { NativeModules, Platform } from 'react-native';

const BLE_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb';
const MAC = 'AA:BB:CC:DD:EE:FF';
const receipt = (bytes: number) => new Uint8Array(bytes).fill(65);

/* ── BLE ──────────────────────────────────────────────────────────────── */

let mockManager: any;
let devices: any[];

function makeDevice() {
  const device: any = {
    mtu: 185,
    isConnected: jest.fn(async () => true),
    discoverAllServicesAndCharacteristics: jest.fn(async () => device),
    services: jest.fn(async () => [
      { uuid: BLE_SERVICE, characteristics: async () => [{ uuid: 'c1', isWritableWithResponse: true, isWritableWithoutResponse: false }] },
    ]),
    writeCharacteristicWithResponseForService: jest.fn(async () => ({})),
  };
  devices.push(device);
  return device;
}

jest.mock('../services/printer/transports/ble-manager', () => ({
  getBleManager: () => mockManager,
  getBleState: async () => 'PoweredOn',
}));

function loadBle() {
  let BleTransport: any;
  jest.isolateModules(() => {
    BleTransport = require('../services/printer/transports/ble.transport').BleTransport;
  });
  return BleTransport;
}

describe('BLE printer', () => {
  beforeEach(() => {
    devices = [];
    mockManager = {
      connectToDevice: jest.fn(async () => makeDevice()),
      cancelDeviceConnection: jest.fn(async () => {}),
      onDeviceDisconnected: jest.fn(() => ({ remove: jest.fn() })),
    };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('connects once for a rush of 20 receipts instead of once per receipt', async () => {
    const BleTransport = loadBle();
    for (let i = 0; i < 20; i++) {
      // A new transport per job, exactly like printer-registry creates them
      const res = await new BleTransport(MAC).send(receipt(100));
      expect(res.ok).toBe(true);
    }
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(1);
    expect(devices[0].writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(20);
    expect(mockManager.cancelDeviceConnection).not.toHaveBeenCalled();
  });

  it('closes the connection after 15 s without jobs, and reconnects for the next one', async () => {
    jest.useFakeTimers();
    const BleTransport = loadBle();
    await new BleTransport(MAC).send(receipt(100));

    await jest.advanceTimersByTimeAsync(14000);
    expect(mockManager.cancelDeviceConnection).not.toHaveBeenCalled();
    // Another job inside the window pushes the close back
    await new BleTransport(MAC).send(receipt(100));
    await jest.advanceTimersByTimeAsync(14000);
    expect(mockManager.cancelDeviceConnection).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1500);
    expect(mockManager.cancelDeviceConnection).toHaveBeenCalledWith(MAC);

    await new BleTransport(MAC).send(receipt(100));
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(2);
  });

  it('reconnects once and prints when the kept-open link dropped silently', async () => {
    const BleTransport = loadBle();
    await new BleTransport(MAC).send(receipt(100));
    // Printer was power-cycled: the old link still reports connected, but the first write fails
    devices[0].writeCharacteristicWithResponseForService.mockRejectedValueOnce(new Error('Device disconnected'));

    const res = await new BleTransport(MAC).send(receipt(100));

    expect(res.ok).toBe(true);
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(2);
    expect(devices[1].writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
  });

  it('reconnects when the kept-open link reports it is no longer connected', async () => {
    const BleTransport = loadBle();
    await new BleTransport(MAC).send(receipt(100));
    devices[0].isConnected.mockResolvedValueOnce(false);

    const res = await new BleTransport(MAC).send(receipt(100));

    expect(res.ok).toBe(true);
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(2);
    expect(devices[0].writeCharacteristicWithResponseForService).toHaveBeenCalledTimes(1);
  });

  it('never resends a receipt that was partly sent (no half ticket + full ticket)', async () => {
    const BleTransport = loadBle();
    await new BleTransport(MAC).send(receipt(100));
    const write = devices[0].writeCharacteristicWithResponseForService;
    write.mockClear();
    // 400 bytes = 3 chunks; the link drops after the first chunk went out
    write.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Device disconnected'));

    const res = await new BleTransport(MAC).send(receipt(400));

    expect(res.ok).toBe(false);
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(1); // no reconnect + resend
    // The next job starts on a fresh connection
    await new BleTransport(MAC).send(receipt(100));
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(2);
  });

  it('does not retry when a fresh connection fails (the print job reports it and is retried later)', async () => {
    const BleTransport = loadBle();
    mockManager.connectToDevice.mockImplementationOnce(async () => {
      const d = makeDevice();
      d.writeCharacteristicWithResponseForService.mockRejectedValue(new Error('GATT error'));
      return d;
    });

    const res = await new BleTransport(MAC).send(receipt(100));

    expect(res.ok).toBe(false);
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(1);
  });

  it('keeps separate connections for two printers', async () => {
    const BleTransport = loadBle();
    await new BleTransport(MAC).send(receipt(100));
    await new BleTransport('11:22:33:44:55:66').send(receipt(100));
    await new BleTransport(MAC).send(receipt(100));
    await new BleTransport('11:22:33:44:55:66').send(receipt(100));
    expect(mockManager.connectToDevice).toHaveBeenCalledTimes(2);
  });
});

/* ── Classic Bluetooth (SPP, PosPrinter native driver) ───────────────── */

describe('Classic Bluetooth printer', () => {
  let PosPrinter: any;
  let originalOS: string;

  function loadSpp() {
    let SppTransport: any;
    jest.isolateModules(() => {
      SppTransport = require('../services/printer/transports/spp.transport').SppTransport;
    });
    return SppTransport;
  }

  beforeEach(() => {
    originalOS = Platform.OS;
    // Classic Bluetooth is Android-only
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    PosPrinter = {
      connectPrinter: jest.fn(async () => true),
      disconnectPrinter: jest.fn(async () => true),
      sendRawCommand: jest.fn(async () => null),
    };
    (NativeModules as any).PosPrinter = PosPrinter;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    delete (NativeModules as any).PosPrinter;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('connects once for a rush of 20 receipts', async () => {
    const SppTransport = loadSpp();
    for (let i = 0; i < 20; i++) {
      expect((await new SppTransport(MAC).send(receipt(100))).ok).toBe(true);
    }
    expect(PosPrinter.connectPrinter).toHaveBeenCalledTimes(1);
    expect(PosPrinter.sendRawCommand).toHaveBeenCalledTimes(20);
  });

  it('disconnects after 15 s without jobs', async () => {
    jest.useFakeTimers();
    const SppTransport = loadSpp();
    await new SppTransport(MAC).send(receipt(100));
    const disconnectsAfterConnect = PosPrinter.disconnectPrinter.mock.calls.length;

    await jest.advanceTimersByTimeAsync(14000);
    expect(PosPrinter.disconnectPrinter).toHaveBeenCalledTimes(disconnectsAfterConnect);
    await jest.advanceTimersByTimeAsync(1500);
    expect(PosPrinter.disconnectPrinter).toHaveBeenCalledTimes(disconnectsAfterConnect + 1);

    await new SppTransport(MAC).send(receipt(100));
    expect(PosPrinter.connectPrinter).toHaveBeenCalledTimes(2);
  });

  it('reconnects once and prints when the kept-open link dropped (native module only notices on write)', async () => {
    const SppTransport = loadSpp();
    await new SppTransport(MAC).send(receipt(100));
    PosPrinter.sendRawCommand.mockRejectedValueOnce(new Error('Print failed: Broken pipe'));

    const res = await new SppTransport(MAC).send(receipt(100));

    expect(res.ok).toBe(true);
    expect(PosPrinter.connectPrinter).toHaveBeenCalledTimes(2);
    expect(PosPrinter.sendRawCommand).toHaveBeenCalledTimes(3); // ok, failed, resent
  });

  it('gives up on a connect that never answers instead of hanging the printer queue', async () => {
    jest.useFakeTimers();
    const SppTransport = loadSpp();
    PosPrinter.connectPrinter.mockImplementation(() => new Promise(() => {})); // never settles

    const pending = new SppTransport(MAC).send(receipt(100));
    await jest.advanceTimersByTimeAsync(12500);
    const res = await pending;

    expect(res.ok).toBe(false);
    expect(PosPrinter.disconnectPrinter).toHaveBeenCalled(); // cancels the native attempt
  });

  it('switching to a different printer closes the old connection first', async () => {
    const SppTransport = loadSpp();
    await new SppTransport(MAC).send(receipt(100));
    PosPrinter.disconnectPrinter.mockClear();

    await new SppTransport('11:22:33:44:55:66').send(receipt(100));

    expect(PosPrinter.disconnectPrinter).toHaveBeenCalled();
    expect(PosPrinter.connectPrinter).toHaveBeenLastCalledWith('11:22:33:44:55:66', 'bluetooth');
  });
});
