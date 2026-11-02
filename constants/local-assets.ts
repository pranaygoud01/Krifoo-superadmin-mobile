import { Platform, type ImageSourcePropType } from 'react-native';
import { Asset } from 'expo-asset';

/**
 * Static local assets, matching krifoo-mobile:
 * every file is `require()`d at module scope so Metro packs it into
 * preview/production binaries (not just Expo Go HTTP).
 */
export const LocalImages = {
  logo: require('@/assets/logo.png'),
  loginCover: require('@/assets/login_cover.jpg'),
  icon: require('@/assets/icon.png'),
  splashIcon: require('@/assets/splash_icon.png'),
  favicon: require('@/assets/favicon.png'),
  food: require('@/assets/food.png'),
  table: require('@/assets/table.png'),
  grocery: require('@/assets/grocery.png'),
  store: require('@/assets/store.png'),
  diningTable: require('@/assets/dining_table.png'),
  fleet: require('@/assets/fleet.png'),
  reservation: require('@/assets/reservation.png'),
  restaurant: require('@/assets/restaurant.png'),
  onlineOrder: require('@/assets/online_order.png'),
  preorder: require('@/assets/preorder.png'),
  publicity: require('@/assets/publicity.png'),
  spoonAndFork: require('@/assets/spoon_and_fork.png'),
  tag: require('@/assets/tag.png'),
  kpiGrossSales: require('@/assets/kpi_gross_sales.png'),
  kpiTotalOrders: require('@/assets/kpi_total_orders.png'),
  kpiAvgValue: require('@/assets/kpi_avg_value.png'),
  kpiCashOrders: require('@/assets/kpi_cash_orders.png'),
  kpiOnlineCard: require('@/assets/kpi_online_card.png'),
  kpiFulfillmentRate: require('@/assets/kpi_fulfillment_rate.png'),
  image: require('@/assets/food.png'),
  login_bg: require('@/assets/login_cover.jpg'),
  krifoo_logo: require('@/assets/logo.png'),
} as const;

export const LocalSounds = {
  orderBuzz: require('@/assets/sounds/order_buzz.wav'),
} as const;

export function normalizeAssetPath(value?: string | null) {
  if (!value) return '';
  return value.trim().replace(/\\/g, '/');
}

export function isRemoteMediaUrl(value?: string | null) {
  const normalized = normalizeAssetPath(value);
  return Boolean(normalized) && /^(https?:|data:|blob:|file:|content:)/i.test(normalized);
}

function getAssetMapKey(value: string) {
  const clean = value
    .split('?')[0]
    .split('#')[0]
    .replace(/^@\/assets\//, '')
    .replace(/^\.\/assets\//, '')
    .replace(/^\/assets\//, '')
    .replace(/^assets\//, '')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');

  if (!clean) {
    return { direct: '', kebab: '', camel: '', pascal: '', snake: '' };
  }

  const normalized = clean
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    .replace(/^([a-z])/, (_, c) => c.toUpperCase());

  return {
    direct: clean,
    kebab: clean,
    camel: normalized,
    pascal: normalized,
    snake: clean,
  };
}

function lookupLocalAsset<T extends Record<string, any>>(registry: T, value?: string | null) {
  const normalized = normalizeAssetPath(value);
  if (!normalized) return null;

  const keyVariants = getAssetMapKey(normalized);
  const candidates = new Set<string>([
    keyVariants.direct,
    keyVariants.camel,
    keyVariants.pascal,
    keyVariants.snake,
    keyVariants.camel.charAt(0).toLowerCase() + keyVariants.camel.slice(1),
  ]);

  for (const candidate of candidates) {
    const asset = registry[candidate as keyof T];
    if (asset) return asset;
  }

  return null;
}

export function resolveImageSource(
  value?: string | null,
  fallback: ImageSourcePropType = LocalImages.image,
): ImageSourcePropType {
  const normalized = normalizeAssetPath(value);

  if (!normalized) {
    return fallback;
  }

  if (isRemoteMediaUrl(normalized) || normalized.startsWith('//')) {
    return { uri: normalized.startsWith('//') ? `https:${normalized}` : normalized };
  }

  const mappedAsset = lookupLocalAsset(LocalImages, normalized);
  if (mappedAsset) {
    return mappedAsset;
  }

  return { uri: normalized };
}

export function resolveAudioSource(source?: string | null) {
  const normalized = normalizeAssetPath(source);

  if (!normalized) {
    return null;
  }

  if (isRemoteMediaUrl(normalized)) {
    return { uri: normalized };
  }

  const mappedAsset = lookupLocalAsset(LocalSounds, normalized);
  if (mappedAsset) {
    return mappedAsset;
  }

  return { uri: normalized };
}

export function getOrderBuzzPlaybackSource() {
  if (Platform.OS === 'android') {
    // Direct Android native raw resource bundled in the APK (zero-network, offline-ready)
    return { uri: 'android.resource://com.krifoo.admin/raw/order_buzz' };
  }
  return LocalSounds.orderBuzz;
}
