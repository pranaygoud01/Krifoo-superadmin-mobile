# Restaurant Analytics & Dashboard Implementation Guide (Mobile & Web)

This comprehensive guide details the analytics architecture, backend API contracts, business logic algorithms, and mobile UI implementation steps for porting the Restaurant Owner Sales & Analytics Dashboard to a mobile application
**without requiring any backend changes**.

---

## 1. Overview of Analytics Features

The dashboard computes real-time operational and financial intelligence across customizable timeframes (**Today**, **Last 7 Days (Weekly)**, **Last 30 Days (Monthly)**, **This Month (MTD)**, **All Time**, or **Custom Date Range**):

1. **Executive KPI Ribbon**:
   - **Gross Sales (£)**: Total monetary revenue from all valid (non-cancelled) orders.
   - **Total Orders Count**: Total volume of orders placed within the selected period.
   - **Cash on Delivery (Orders & £ Amount)**: Count, revenue, and % share of total orders.
   - **Online / Card / Stripe (Orders & £ Amount)**: Count, revenue, and % share of total orders.
   - **Average Order Value (AOV £)**: Average spend per valid customer order.
   - **Fulfillment & Cancellation Rate**: Completed orders vs cancelled/rejected orders percentage.
2. **Sales & Orders Trajectory Charts**:
   - Revenue trajectory over time (Area/Line chart).
   - Order volume over time (Bar chart).
   - Cash vs Online payment volume comparison (Multi-bar chart).
3. **Payment Method Breakdown**:
   - Ratio and progress indicators for Cash on Delivery vs. Online Card / Stripe.
4. **Fulfillment Types**:
   - Dynamic breakdown of **Delivery**, **Pickup**, and **Dine-In** orders with count and percentage share.
5. **Order Lifecycle Distribution**:
   - Distribution of `placed`, `preparing` (In Kitchen), `ready_for_pickup`, `out_for_delivery`, `delivered`, and `cancelled` statuses.
6. **Top Performing Dishes (Leaderboard)**:
   - Ranked list of menu items with quantity sold, revenue generated, and contribution percentage bar.
7. **Recent Orders Live Feed**:
   - Real-time list of latest orders with customer info, fulfillment badge, payment badge, status, and receipt printing/viewing.
8. **Export & Sharing**:
   - Summary CSV, itemized raw orders CSV, and printable/shareable PDF summary.

---

## 2. Backend API Reference (Existing Endpoints)

All endpoints require the restaurant admin authentication token (cookie or `Authorization: Bearer <token>`).

### 1. High-Level Restaurant Stats
- **Endpoint**: `GET /api/orders/restaurant/stats`
- **Description**: Returns overall lifetime stats, monthly revenue breakdown, and current month vs last month comparison.
- **Sample Response**:
```json
{
  "success": true,
  "data": {
    "overall": {
      "totalOrders": 150,
      "totalDelivered": 138,
      "totalCancelled": 12,
      "totalIncome": 2840.50
    },
    "monthlyIncome": [
      { "_id": { "year": 2026, "month": 8 }, "totalIncome": 1200.00 },
      { "_id": { "year": 2026, "month": 9 }, "totalIncome": 1640.50 }
    ],
    "comparison": {
      "orders": { "current": 85, "previous": 65, "change": 30.77 },
      "income": { "current": 1640.50, "previous": 1200.00, "change": 36.71 },
      "delivered": { "current": 80, "previous": 58, "change": 37.93 }
    }
  }
}
```

### 2. Timeframe Filtered Sales Report
- **Endpoint**: `GET /api/orders/restaurant/reports/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- **Description**: Returns delivered revenue, delivered order count, and AOV for the date range.
- **Sample Response**:
```json
{
  "success": true,
  "data": {
    "totalRevenue": 450.25,
    "totalOrders": 24,
    "averageOrderValue": 18.76
  }
}
```

### 3. Orders Distribution (Statuses & Types)
- **Endpoint**: `GET /api/orders/restaurant/reports/orders`
- **Description**: Returns order counts grouped by status and fulfillment type.
- **Sample Response**:
```json
{
  "success": true,
  "data": {
    "statusReport": [
      { "_id": "delivered", "count": 138 },
      { "_id": "placed", "count": 4 },
      { "_id": "preparing", "count": 3 },
      { "_id": "cancelled", "count": 5 }
    ],
    "orderTypeReport": [
      { "_id": "delivery", "count": 110 },
      { "_id": "pickup", "count": 35 },
      { "_id": "dine_in", "count": 5 }
    ]
  }
}
```

### 4. Top Menu Item Performance
- **Endpoint**: `GET /api/orders/restaurant/reports/menu-performance`
- **Description**: Returns dishes ranked by total quantity sold and revenue generated.
- **Sample Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "64f1a2b3c...",
      "itemName": "Chicken Tikka Biryani",
      "totalQuantitySold": 45,
      "totalRevenue": 540.00
    },
    {
      "_id": "64f1a2b3d...",
      "itemName": "Butter Chicken",
      "totalQuantitySold": 38,
      "totalRevenue": 418.00
    }
  ]
}
```

### 5. Detailed Orders Stream (Primary Data Source)
- **Endpoint**: `GET /api/orders/restaurant?limit=200&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- **Description**: Returns itemized order documents for the selected period.
- **Key Fields in Each Order**:
  - `_id`: String (Order ID)
  - `orderNumber`: String (e.g. "ORD-1042")
  - `createdAt`: ISO Date String (e.g. "2026-09-11T14:30:00.000Z")
  - `status`: String (`"placed" | "preparing" | "ready_for_pickup" | "out_for_delivery" | "delivered" | "cancelled"`)
  - `acceptanceStatus`: String (`"pending" | "accepted" | "rejected"`)
  - `paymentType`: String (`"cash" | "card" | "online" | "stripe" | "wallet"`)
  - `paymentStatus`: String (`"paid" | "unpaid" | "refunded"`)
  - `orderType`: String (`"delivery" | "pickup" | "dine_in"`)
  - `pricing`: Object (`{ subtotal, deliveryFee, discount, tip, totalAmount }`)
  - `customerDetails`: Object (`{ name, phoneNumber, email }`)
  - `orderedItems`: Array of items (`[ { itemName, quantity, itemTotal } ]`)

---

## 3. Core Calculations & Business Logic (Mobile Code)

You can copy this exact aggregation helper in your mobile app (JavaScript / TypeScript / Dart / Swift):

```typescript
export interface DashboardAnalytics {
  totalRevenue: number;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  cashOrdersCount: number;
  cashRevenue: number;
  onlineOrdersCount: number;
  onlineRevenue: number;
  dailyBreakdown: Array<{
    date: string;
    orders: number;
    delivered: number;
    revenue: number;
    cashOrders: number;
    onlineOrders: number;
  }>;
  orderTypeBreakdown: Array<{
    id: string;
    name: string;
    count: number;
    percentage: number;
  }>;
  statusReport: Array<{
    id: string;
    name: string;
    count: number;
  }>;
}

export function computeDashboardAnalytics(orders: any[]): DashboardAnalytics {
  let totalRevenue = 0;
  let deliveredOrders = 0;
  let cancelledOrders = 0;
  let cashOrdersCount = 0;
  let cashRevenue = 0;
  let onlineOrdersCount = 0;
  let onlineRevenue = 0;

  const dailyMap = new Map<string, any>();
  const fulfillmentMap: Record<string, number> = { delivery: 0, pickup: 0, dine_in: 0 };
  const statusMap: Record<string, number> = {
    placed: 0,
    preparing: 0,
    ready_for_pickup: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0
  };

  orders.forEach((order) => {
    const orderTotal = order.pricing?.totalAmount || order.pricing?.subtotal || 0;
    const isDelivered = order.status === 'delivered';
    const isCancelled = order.status === 'cancelled' || order.acceptanceStatus === 'rejected';
    const isValid = !isCancelled;
    const isCash = order.paymentType === 'cash';
    const isOnline = ['card', 'online', 'stripe', 'wallet'].includes(order.paymentType);

    // Fulfillment Type
    const fType = order.orderType || 'delivery';
    fulfillmentMap[fType] = (fulfillmentMap[fType] || 0) + 1;

    // Status
    const st = order.status || 'placed';
    statusMap[st] = (statusMap[st] || 0) + 1;

    if (isValid) {
      totalRevenue += orderTotal;
    }
    if (isDelivered) {
      deliveredOrders += 1;
    }
    if (isCancelled) {
      cancelledOrders += 1;
    }

    if (isCash) {
      cashOrdersCount += 1;
      if (isValid) cashRevenue += orderTotal;
    } else if (isOnline) {
      onlineOrdersCount += 1;
      if (isValid) onlineRevenue += orderTotal;
    }

    // Daily grouping
    const dateObj = new Date(order.createdAt);
    const dateKey = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        rawDate: dateObj,
        orders: 0,
        delivered: 0,
        revenue: 0,
        cashOrders: 0,
        onlineOrders: 0
      });
    }

    const dayObj = dailyMap.get(dateKey);
    dayObj.orders += 1;
    if (isValid) dayObj.revenue += orderTotal;
    if (isDelivered) dayObj.delivered += 1;
    if (isCash) dayObj.cashOrders += 1;
    if (isOnline) dayObj.onlineOrders += 1;
  });

  const dailyBreakdown = Array.from(dailyMap.values())
    .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

  const totalOrdersCount = orders.length;
  const validOrdersCount = orders.filter(
    (o) => o.status !== 'cancelled' && o.acceptanceStatus !== 'rejected'
  ).length;

  const averageOrderValue = validOrdersCount > 0 ? totalRevenue / validOrdersCount : 0;

  const orderTypeBreakdown = [
    {
      id: 'delivery',
      name: 'Delivery',
      count: fulfillmentMap.delivery || 0,
      percentage: totalOrdersCount > 0 ? Math.round(((fulfillmentMap.delivery || 0) / totalOrdersCount) * 100) : 0
    },
    {
      id: 'pickup',
      name: 'Pickup',
      count: fulfillmentMap.pickup || 0,
      percentage: totalOrdersCount > 0 ? Math.round(((fulfillmentMap.pickup || 0) / totalOrdersCount) * 100) : 0
    },
    {
      id: 'dine_in',
      name: 'Dine In',
      count: fulfillmentMap.dine_in || 0,
      percentage: totalOrdersCount > 0 ? Math.round(((fulfillmentMap.dine_in || 0) / totalOrdersCount) * 100) : 0
    }
  ];

  const statusReport = [
    { id: 'delivered', name: 'Delivered', count: statusMap.delivered || 0 },
    { id: 'placed', name: 'Placed', count: statusMap.placed || 0 },
    { id: 'preparing', name: 'In Kitchen', count: statusMap.preparing || 0 },
    { id: 'ready_for_pickup', name: 'Ready', count: statusMap.ready_for_pickup || 0 },
    { id: 'out_for_delivery', name: 'Out for Delivery', count: statusMap.out_for_delivery || 0 },
    { id: 'cancelled', name: 'Cancelled', count: statusMap.cancelled || 0 }
  ];

  return {
    totalRevenue,
    totalOrders: totalOrdersCount,
    deliveredOrders,
    cancelledOrders,
    averageOrderValue,
    cashOrdersCount,
    cashRevenue,
    onlineOrdersCount,
    onlineRevenue,
    dailyBreakdown,
    orderTypeBreakdown,
    statusReport
  };
}
```

---

## 4. Mobile UI & UX Guidelines

### Theme Palette
- **Primary Accent**: `#FF6D1F` (Warm Orange)
- **Success / Cash**: `#10B981` (Emerald Green)
- **Online / Card**: `#6366F1` (Indigo Blue)
- **Warning / Placed**: `#F59E0B` (Amber)
- **Danger / Cancelled**: `#F43F5E` (Rose Red)
- **Dark Surface / Text**: `#111827` / `#1F2937`
- **Muted Text**: `#6B7280`
- **Card Background**: `#FFFFFF` with soft gradient mesh

### Mobile Layout Structure (Scrollable Screen)
1. **Top Header**:
   - Restaurant Name & "Live Operations" indicator badge.
   - Sync / Refresh button.
   - Export / Share button (opens native Share sheet for CSV/PDF report).
2. **Horizontal Timeframe Switcher Tabs**:
   - `[ Today ]` `[ 7D ]` `[ 30D ]` `[ This Month ]` `[ All Time ]` `[ Custom ]`
3. **2x3 KPI Grid (or Carousel Cards)**:
   - Card 1: **Gross Sales** (`£XX.XX`)
   - Card 2: **Total Orders** (`N orders`)
   - Card 3: **Cash Orders** (`N orders • £XX.XX • %`)
   - Card 4: **Online / Card** (`N orders • £XX.XX • %`)
   - Card 5: **Avg Order (AOV)** (`£XX.XX`)
   - Card 6: **Fulfillment Rate** (`XX% • Delivered vs Cancelled`)
4. **Sales & Orders Trajectory Chart**:
   - Segmented control to toggle: **Revenue (£)** | **Orders** | **Cash vs Online**.
   - React Native: Use `react-native-gifted-charts`, `victory-native`, or `react-native-wagmi-charts`.
   - Flutter: Use `fl_chart`.
5. **Payment Method Breakdown Card**:
   - Mini donut chart or horizontal dual-progress bar showing Cash vs Online ratio.
6. **Fulfillment Types & Status Cards (Side by Side or Stacked)**:
   - Delivery, Pickup, Dine-in counts with colored badges.
7. **Top Performing Menu Items**:
   - List item with rank badge (`#1`, `#2`, `#3`), dish name, quantity sold, and revenue.
8. **Recent Live Orders Feed**:
   - Order cards with Order #, customer name, date/time, cash/card badge, status pill, amount, and receipt button.

---

## 5. Mobile CSV Export & Sharing Implementation (React Native Example)

```typescript
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareAnalyticsReport(analytics: DashboardAnalytics, restaurantName: string, timeframeLabel: string) {
  const lines = [
    `"RESTAURANT ANALYTICS SUMMARY REPORT"`,
    `"Restaurant Name","${restaurantName}"`,
    `"Timeframe","${timeframeLabel}"`,
    `"Generated On","${new Date().toLocaleString()}"`,
    '',
    `"KEY METRIC","VALUE","DETAILS"`,
    `"Gross Sales","£${analytics.totalRevenue.toFixed(2)}","All valid orders"`,
    `"Total Orders","${analytics.totalOrders}","Placed in period"`,
    `"Cash on Delivery","${analytics.cashOrdersCount}","£${analytics.cashRevenue.toFixed(2)}"`,
    `"Online / Card","${analytics.onlineOrdersCount}","£${analytics.onlineRevenue.toFixed(2)}"`,
    `"Average Order Value","£${analytics.averageOrderValue.toFixed(2)}","Per order average"`,
    `"Delivered Orders","${analytics.deliveredOrders}","Completed"`,
    `"Cancelled Orders","${analytics.cancelledOrders}","Cancelled / Rejected"`,
  ];

  const csvString = lines.join('\n');
  const fileUri = `${FileSystem.documentDirectory}${restaurantName.replace(/\s+/g, '_')}_Analytics_${Date.now()}.csv`;
  
  await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'text/csv',
      dialogTitle: 'Share Sales Analytics Report'
    });
  }
}
```

---

## 6. Summary Checklist for Mobile Developers

- [x] Connect to existing endpoint `GET /api/orders/restaurant?limit=200` with query parameters `startDate` and `endDate`.
- [x] Connect to `GET /api/orders/restaurant/reports/menu-performance` for the top dish leaderboard.
- [x] Apply local date timezone formatting (`YYYY-MM-DD`) when making requests.
- [x] Use `computeDashboardAnalytics(orders)` to derive real-time Gross Sales, Cash vs Online breakdown, AOV, Fulfillment breakdown, and daily chart trajectories.
- [x] Include native sharing/downloading for CSV and PDF reports.
\