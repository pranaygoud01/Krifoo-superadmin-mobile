# Krifoo Admin Mobile & Web App

A modern, high-performance React Native (Expo) Super Admin application built for **Krifoo**, supporting cross-platform deployment on Android, iOS, and Web.

## Features

1. **Super Admin Authentication**
   - Secure login (`/api/auth/admin/login`)
   - Persistent admin sessions with AsyncStorage
   - Configurable Backend Server URL (Localhost, IP, or Production Cloud)

2. **Platform KPI Dashboard**
   - Metrics for Total Registered Restaurants, Pending Verification Queue, Live Platform Orders, Gross Revenue, and Registered Users
   - Quick shortcut navigation and alert banners for pending approvals

3. **Registered Restaurants Management** (`/api/admin/restaurants`)
   - Comprehensive directory of all registered restaurants
   - Filter chips by Verification Status: `All`, `Pending`, `Approved`, `Rejected`, `Active`, `Inactive`
   - Real-time search by restaurant name, owner name, email, or phone
   - **Verification Modal**: View restaurant info, FSSAI / GST documents, approve, reject, or reset to pending with custom remarks
   - **Active Status Toggle**: Instantly activate or deactivate any restaurant
   - **Delete Restaurant**: Permanently delete restaurant and all connected data

4. **All Restaurants Orders Management** (`/api/admin/orders`)
   - Cross-restaurant master orders feed
   - Search by Order ID, Restaurant Name, or Customer Name
   - Filter tabs: `All`, `Placed`, `Confirmed`, `Preparing`, `Out for Delivery`, `Delivered`, `Cancelled`
   - **Order Detail Drawer/Modal**: Detailed items breakdown, prices, taxes, customer delivery address, special notes
   - **Delivery Partner Assignment**: Modal list of registered drivers to assign/reassign driver (`PATCH /api/admin/orders/:orderId/assign-delivery`)

5. **User & Driver Directory** (`/api/admin/users`)
   - Manage customers and delivery partners
   - Toggle account active status & delete users

6. **System Settings & Global Config**
   - View/Edit backend server API URL
   - View global platform categories & delivery fee charge tiers

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Expo Development Server
```bash
# Start for Web
npm run web

# Start for Android / iOS
npm run android
npm run ios
# or standard metro bundler
npm start
```

### 3. Connect to Backend
By default, the app points to `http://localhost:5000`. You can change this on the Login screen or in the Settings tab.
