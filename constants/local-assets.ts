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
};

export const LocalSounds = {
  orderBuzz: require('@/assets/sounds/order_buzz.wav'),
};

export async function getOrderBuzzPlaybackSource() {
  const asset = Asset.fromModule(LocalSounds.orderBuzz);
  if (!asset.downloaded) {
    await asset.downloadAsync();
  }
  if (asset.localUri) {
    return { uri: asset.localUri };
  }
  return LocalSounds.orderBuzz;
}
