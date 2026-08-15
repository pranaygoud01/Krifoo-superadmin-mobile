export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type OrderStatus = 'placed' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type UserType = 'customer' | 'delivery_partner' | 'super_admin' | 'owner';

export interface SuperAdminUser {
  id: string;
  email: string;
  fullName: string;
  userType: 'super_admin';
  token?: string;
}

export interface RestaurantDocument {
  docType: string;
  docUrl: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface RestaurantOwner {
  id?: string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
}

export interface Restaurant {
  _id: string;
  restaurantName: string;
  ownerName?: string;
  ownerFullName?: string;
  email?: string;
  phoneNumber?: string;
  address?: {
    shopNo?: string;
    floor?: string;
    area?: string;
    city?: string;
    landmark?: string;
    street?: string;
    state?: string;
    pincode?: string;
    formattedAddress?: string;
    coordinates?: {
      type: 'Point';
      coordinates: [number, number];
    };
  } | string;
  cuisineTypes?: string[];
  verificationStatus: VerificationStatus;
  verificationRemarks?: string;
  isActive: boolean;
  imageUrl?: string;
  rating?: number;
  totalOrdersCount?: number;
  stripeAccountStatus?: string;
  documents?: RestaurantDocument[];
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderItem {
  _id?: string;
  menuItemId?: string;
  name: string;
  price: number;
  quantity: number;
  customization?: {
    size?: string;
    addOns?: string[];
  };
}

export interface Order {
  _id: string;
  orderNumber?: string;
  restaurantId: {
    _id: string;
    restaurantName: string;
    imageUrl?: string;
    phoneNumber?: string;
  } | string;
  customerId?: {
    _id: string;
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  } | string;
  customerDetails?: {
    name?: string;
    phoneNumber?: string;
    email?: string;
  };
  assignedDeliveryPartnerId?: {
    _id: string;
    fullName?: string;
    phoneNumber?: string;
    vehicleNumber?: string;
  } | string;
  orderedItems: {
    name: string;
    price: number;
    quantity: number;
    customization?: {
      size?: string;
      addOns?: string[];
    };
  }[];
  pricing?: {
    subtotal?: number;
    deliveryFee?: number;
    tax?: number;
    handlingCharge?: number;
    platformFee?: number;
    discount?: number;
    discountAmount?: number;
    total?: number;
    totalAmount?: number;
  };
  status: OrderStatus;
  paymentType?: 'cash' | 'card' | 'online';
  paymentStatus?: 'pending' | 'paid' | 'completed' | 'failed' | 'refunded';
  deliveryAddress?: {
    addressLine1?: string;
    city?: string;
    landmark?: string;
    formattedAddress?: string;
    coordinates?: any;
  };
  notes?: string;
  createdAt: string;
  updatedAt?: string;

  // Compatibility fallbacks
  userId?: any;
  deliveryPartnerId?: any;
  items?: any[];
  totalAmount?: number;
  totalPrice?: number;
  deliveryFee?: number;
  taxAmount?: number;
}

export interface UserAccount {
  _id: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  userType: UserType;
  isActive: boolean;
  createdAt?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  isAvailable?: boolean;
}

export interface Category {
  _id: string;
  categoryName: string;
  description?: string;
  isActive: boolean;
  imageUrl?: string;
  categoryType?: string;
}

export interface DeliveryChargeTier {
  _id: string;
  maxDistance: number;
  charge: number;
}

export interface DashboardStats {
  totalRestaurants: number;
  pendingApprovals: number;
  activeRestaurants: number;
  totalOrders: number;
  activeOrders: number;
  totalRevenue: number;
  totalUsers: number;
}

export interface MenuItem {
  _id: string;
  restaurantId: string;
  name?: string;
  itemName?: string;
  description?: string;
  price?: number;
  basePrice?: number;
  category?: string;
  categories?: { _id: string; categoryName: string }[];
  isAvailable: boolean;
  displayImage?: string;
  displayImageUrl?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}
