import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Android runtime permissions needed to find and connect to Bluetooth printers.
 *
 * - Android 12+ (API 31): BLUETOOTH_SCAN + BLUETOOTH_CONNECT ("Nearby devices") are required.
 *   ACCESS_FINE_LOCATION is requested as optional — it is only needed to see BLE printers
 *   (the BLE plugin is not configured with `neverForLocation`). Paired Classic printers work without it.
 * - Android 11 and below: location permission is required for any Bluetooth scan.
 * - iOS: handled by the system prompt on first Bluetooth use.
 */

export async function hasBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (Number(Platform.Version) >= 31) {
      const scan = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      const connect = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      return scan && connect;
    }
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  } catch {
    return false;
  }
}

export type BluetoothPermissionResult = 'granted' | 'denied' | 'blocked';

export async function requestBluetoothPermissions(): Promise<BluetoothPermissionResult> {
  if (Platform.OS !== 'android') return 'granted';
  try {
    if (Number(Platform.Version) >= 31) {
      const statuses = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, // optional (BLE printers only)
      ]);
      const required = [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
      if (required.every((p) => statuses[p] === PermissionsAndroid.RESULTS.GRANTED)) return 'granted';
      return required.some((p) => statuses[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) ? 'blocked' : 'denied';
    }
    const statuses = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fine = statuses[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const coarse = statuses[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION];
    if (fine === PermissionsAndroid.RESULTS.GRANTED || coarse === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    return fine === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Checks, and requests if needed. */
export async function ensureBluetoothPermissions(): Promise<BluetoothPermissionResult> {
  if (await hasBluetoothPermissions()) return 'granted';
  return requestBluetoothPermissions();
}
