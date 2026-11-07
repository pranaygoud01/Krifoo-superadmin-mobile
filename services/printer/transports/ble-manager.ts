/**
 * One shared react-native-ble-plx BleManager for the whole app.
 * ble-plx only supports a single manager instance; creating one per print / per scan
 * (as before) causes "BleManager was destroyed" and scan errors.
 */
let sharedManager: any = null;

export function getBleManager(): any | null {
  if (sharedManager) return sharedManager;
  try {
    const BleModule = require('react-native-ble-plx');
    if (!BleModule?.BleManager) return null;
    sharedManager = new BleModule.BleManager();
    return sharedManager;
  } catch {
    return null;
  }
}

/** Resolves the adapter state ('PoweredOn', 'PoweredOff', 'Unauthorized', ...), or 'Unknown'. */
export async function getBleState(): Promise<string> {
  const manager = getBleManager();
  if (!manager) return 'Unsupported';
  try {
    return String(await manager.state());
  } catch {
    return 'Unknown';
  }
}
