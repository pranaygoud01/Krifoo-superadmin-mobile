import AsyncStorage from '@react-native-async-storage/async-storage';
import { Order } from '../types';

export type PaperWidth = '80mm' | '58mm';
export type ReceiptFontSize = 'small' | 'medium' | 'large';
export type ReceiptFontFamily = 'fontA' | 'fontB';
export type ReceiptLineSpacing = 'compact' | 'normal' | 'relaxed';
export type TextAlignment = 'left' | 'center' | 'right';
export type QrCodeType = 'feedback' | 'payment' | 'website' | 'custom';

export interface ReceiptLayoutConfig {
  paperWidth: PaperWidth;
  fontSize: ReceiptFontSize;
  fontFamily: ReceiptFontFamily;
  lineSpacing: ReceiptLineSpacing;
  alignment: {
    header: TextAlignment;
    items: TextAlignment;
    totals: TextAlignment;
    footer: TextAlignment;
  };
  boldElements: {
    restaurantName: boolean;
    orderNumber: boolean;
    totalAmount: boolean;
    itemNames: boolean;
    customerDetails: boolean;
  };
  italicElements: {
    tagline: boolean;
    footerMessage: boolean;
  };
}

export interface ReceiptContentConfig {
  showLogo: boolean;
  logoUrl?: string;
  showRestaurantName: boolean;
  customHeaderTitle?: string;
  showAddress: boolean;
  showPhone: boolean;
  showTaxId: boolean;
  taxIdLabel: string; // e.g. "VAT Reg No:"
  taxIdValue: string;
  showOrderNumber: boolean;
  showTableNumber: boolean;
  showServerWaiterName: boolean;
  serverWaiterName?: string;
  showDateTime: boolean;
  dateTimeFormat: 'uk' | 'short' | 'time_only';
  showCustomerInfo: boolean;
  showItemNotes: boolean;
  showItemTaxBreakdown: boolean;
  taxPercentage?: number;
  showDiscountLine: boolean;
  showPaymentMethod: boolean;
  headerMessage: string;
  footerMessage: string;
  showQrCode: boolean;
  qrCodeType: QrCodeType;
  qrCodeData: string;
  qrCodeLabel: string;
}

export interface ReceiptTemplate {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
  layout: ReceiptLayoutConfig;
  content: ReceiptContentConfig;
}

const TEMPLATES_STORAGE_KEY = '@krifoo_receipt_templates';
const ACTIVE_TEMPLATE_KEY = '@krifoo_active_receipt_template_id';

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  id: 'standard_pos',
  name: 'Standard POS Receipt',
  description: 'Balanced, elegant thermal receipt layout suitable for everyday orders',
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  layout: {
    paperWidth: '80mm',
    fontSize: 'medium',
    fontFamily: 'fontA',
    lineSpacing: 'normal',
    alignment: {
      header: 'center',
      items: 'left',
      totals: 'left',
      footer: 'center',
    },
    boldElements: {
      restaurantName: true,
      orderNumber: true,
      totalAmount: true,
      itemNames: true,
      customerDetails: true,
    },
    italicElements: {
      tagline: false,
      footerMessage: false,
    },
  },
  content: {
    showLogo: false,
    logoUrl: '',
    showRestaurantName: true,
    customHeaderTitle: '',
    showAddress: true,
    showPhone: true,
    showTaxId: false,
    taxIdLabel: 'VAT Reg No:',
    taxIdValue: 'GB 123 4567 89',
    showOrderNumber: true,
    showTableNumber: true,
    showServerWaiterName: false,
    serverWaiterName: 'Front Counter',
    showDateTime: true,
    dateTimeFormat: 'uk',
    showCustomerInfo: true,
    showItemNotes: true,
    showItemTaxBreakdown: false,
    taxPercentage: 20,
    showDiscountLine: true,
    showPaymentMethod: true,
    headerMessage: 'Freshly Prepared For You',
    footerMessage: 'Thank you for your order! Visit us again soon.',
    showQrCode: false,
    qrCodeType: 'website',
    qrCodeData: 'https://krifoo.co.uk',
    qrCodeLabel: 'Order online at krifoo.co.uk',
  },
};

export const COMPACT_TAKEAWAY_TEMPLATE: ReceiptTemplate = {
  id: 'compact_takeaway',
  name: 'Compact Takeaway / 58mm',
  description: 'Fast, compact layout optimized for 58mm thermal rolls and takeaway counters',
  isDefault: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  layout: {
    paperWidth: '58mm',
    fontSize: 'small',
    fontFamily: 'fontB',
    lineSpacing: 'compact',
    alignment: {
      header: 'center',
      items: 'left',
      totals: 'left',
      footer: 'center',
    },
    boldElements: {
      restaurantName: true,
      orderNumber: true,
      totalAmount: true,
      itemNames: false,
      customerDetails: false,
    },
    italicElements: {
      tagline: false,
      footerMessage: false,
    },
  },
  content: {
    showLogo: false,
    logoUrl: '',
    showRestaurantName: true,
    customHeaderTitle: '',
    showAddress: false,
    showPhone: true,
    showTaxId: false,
    taxIdLabel: 'Tax ID:',
    taxIdValue: '',
    showOrderNumber: true,
    showTableNumber: false,
    showServerWaiterName: false,
    serverWaiterName: '',
    showDateTime: true,
    dateTimeFormat: 'time_only',
    showCustomerInfo: true,
    showItemNotes: true,
    showItemTaxBreakdown: false,
    taxPercentage: 20,
    showDiscountLine: true,
    showPaymentMethod: true,
    headerMessage: '',
    footerMessage: 'Thanks for ordering! See you soon.',
    showQrCode: false,
    qrCodeType: 'website',
    qrCodeData: '',
    qrCodeLabel: '',
  },
};

export const DINE_IN_INVOICE_TEMPLATE: ReceiptTemplate = {
  id: 'dine_in_invoice',
  name: 'Full Dine-In & Tax Invoice',
  description: 'Detailed dining receipt with table number, waiter, VAT breakdown, and feedback QR',
  isDefault: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  layout: {
    paperWidth: '80mm',
    fontSize: 'medium',
    fontFamily: 'fontA',
    lineSpacing: 'normal',
    alignment: {
      header: 'center',
      items: 'left',
      totals: 'left',
      footer: 'center',
    },
    boldElements: {
      restaurantName: true,
      orderNumber: true,
      totalAmount: true,
      itemNames: true,
      customerDetails: true,
    },
    italicElements: {
      tagline: true,
      footerMessage: true,
    },
  },
  content: {
    showLogo: false,
    logoUrl: '',
    showRestaurantName: true,
    customHeaderTitle: 'TAX INVOICE / GUEST RECEIPT',
    showAddress: true,
    showPhone: true,
    showTaxId: true,
    taxIdLabel: 'VAT Reg No:',
    taxIdValue: 'GB 987 6543 21',
    showOrderNumber: true,
    showTableNumber: true,
    showServerWaiterName: true,
    serverWaiterName: 'Alex / Table Service',
    showDateTime: true,
    dateTimeFormat: 'uk',
    showCustomerInfo: false,
    showItemNotes: true,
    showItemTaxBreakdown: true,
    taxPercentage: 20,
    showDiscountLine: true,
    showPaymentMethod: true,
    headerMessage: 'Thank you for dining with us today!',
    footerMessage: 'Service charge not included. We appreciate your feedback!',
    showQrCode: true,
    qrCodeType: 'feedback',
    qrCodeData: 'https://g.page/r/krifoo-feedback/review',
    qrCodeLabel: 'Scan for Google Review & Feedback',
  },
};

export const PRELOADED_TEMPLATES: ReceiptTemplate[] = [
  DEFAULT_RECEIPT_TEMPLATE,
  COMPACT_TAKEAWAY_TEMPLATE,
  DINE_IN_INVOICE_TEMPLATE,
];

/**
 * Get all receipt templates for a restaurant
 */
export async function getAllReceiptTemplates(restaurantId?: string): Promise<ReceiptTemplate[]> {
  try {
    const key = restaurantId ? `${TEMPLATES_STORAGE_KEY}_${restaurantId}` : TEMPLATES_STORAGE_KEY;
    let raw = await AsyncStorage.getItem(key);

    // Fall back to global templates storage if specific restaurant key is empty
    if (!raw && restaurantId) {
      raw = await AsyncStorage.getItem(TEMPLATES_STORAGE_KEY);
    }

    if (!raw) {
      return PRELOADED_TEMPLATES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return PRELOADED_TEMPLATES;
    }
    return parsed;
  } catch (err) {
    console.warn('[ReceiptCustomization] Failed to load templates, returning defaults:', err);
    return PRELOADED_TEMPLATES;
  }
}

/**
 * Get active template for a restaurant, with seamless global fallback
 */
export async function getActiveReceiptTemplate(restaurantId?: string): Promise<ReceiptTemplate> {
  try {
    const activeKey = restaurantId ? `${ACTIVE_TEMPLATE_KEY}_${restaurantId}` : ACTIVE_TEMPLATE_KEY;
    let activeId = await AsyncStorage.getItem(activeKey);

    // Fall back to global active template ID if restaurant-specific key has none
    if (!activeId && restaurantId) {
      activeId = await AsyncStorage.getItem(ACTIVE_TEMPLATE_KEY);
    }

    const templates = await getAllReceiptTemplates(restaurantId);

    if (activeId) {
      const found = templates.find((t) => t.id === activeId);
      if (found) return found;
    }

    // Also check global templates list if not found in restaurant-specific list
    if (restaurantId && activeId) {
      const globalTemplates = await getAllReceiptTemplates();
      const foundGlobal = globalTemplates.find((t) => t.id === activeId);
      if (foundGlobal) return foundGlobal;
    }

    const defaultTpl = templates.find((t) => t.isDefault) || templates[0] || DEFAULT_RECEIPT_TEMPLATE;
    return defaultTpl;
  } catch (err) {
    console.warn('[ReceiptCustomization] Failed to load active template, using default:', err);
    return DEFAULT_RECEIPT_TEMPLATE;
  }
}

/**
 * Save or update a receipt template, synchronizing both restaurant and global scopes
 */
export async function saveReceiptTemplate(
  template: ReceiptTemplate,
  restaurantId?: string,
  setAsActive: boolean = true
): Promise<ReceiptTemplate> {
  try {
    const key = restaurantId ? `${TEMPLATES_STORAGE_KEY}_${restaurantId}` : TEMPLATES_STORAGE_KEY;
    const existing = await getAllReceiptTemplates(restaurantId);

    const now = new Date().toISOString();
    const updatedTemplate: ReceiptTemplate = {
      ...template,
      updatedAt: now,
    };

    const index = existing.findIndex((t) => t.id === template.id);
    let newList: ReceiptTemplate[];
    if (index >= 0) {
      newList = [...existing];
      newList[index] = updatedTemplate;
    } else {
      newList = [updatedTemplate, ...existing];
    }

    const jsonString = JSON.stringify(newList);
    await AsyncStorage.setItem(key, jsonString);

    // Always synchronize to global templates storage so other components querying without restaurantId stay updated
    if (restaurantId) {
      await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, jsonString);
    }

    if (setAsActive) {
      const activeKey = restaurantId ? `${ACTIVE_TEMPLATE_KEY}_${restaurantId}` : ACTIVE_TEMPLATE_KEY;
      await AsyncStorage.setItem(activeKey, template.id);

      // Always synchronize active template ID globally
      await AsyncStorage.setItem(ACTIVE_TEMPLATE_KEY, template.id);
    }

    console.log(`[ReceiptCustomization] Saved template '${template.name}' (${template.id}) as active: ${setAsActive}`);
    return updatedTemplate;
  } catch (err) {
    console.error('[ReceiptCustomization] Failed to save template:', err);
    throw err;
  }
}

/**
 * Delete a receipt template (defaults to standard if active is deleted)
 */
export async function deleteReceiptTemplate(templateId: string, restaurantId?: string): Promise<void> {
  try {
    const key = restaurantId ? `${TEMPLATES_STORAGE_KEY}_${restaurantId}` : TEMPLATES_STORAGE_KEY;
    const existing = await getAllReceiptTemplates(restaurantId);
    const filtered = existing.filter((t) => t.id !== templateId);

    const jsonString = JSON.stringify(filtered);
    await AsyncStorage.setItem(key, jsonString);
    if (restaurantId) {
      await AsyncStorage.setItem(TEMPLATES_STORAGE_KEY, jsonString);
    }

    const activeKey = restaurantId ? `${ACTIVE_TEMPLATE_KEY}_${restaurantId}` : ACTIVE_TEMPLATE_KEY;
    const activeId = await AsyncStorage.getItem(activeKey);
    if (activeId === templateId) {
      const fallback = filtered[0]?.id || DEFAULT_RECEIPT_TEMPLATE.id;
      await AsyncStorage.setItem(activeKey, fallback);
      await AsyncStorage.setItem(ACTIVE_TEMPLATE_KEY, fallback);
    }
  } catch (err) {
    console.error('[ReceiptCustomization] Failed to delete template:', err);
    throw err;
  }
}

/**
 * Set active receipt template, syncing both restaurant and global scopes
 */
export async function setActiveReceiptTemplateId(templateId: string, restaurantId?: string): Promise<void> {
  try {
    const activeKey = restaurantId ? `${ACTIVE_TEMPLATE_KEY}_${restaurantId}` : ACTIVE_TEMPLATE_KEY;
    await AsyncStorage.setItem(activeKey, templateId);

    // Always mirror to global active key so all prints everywhere in the app use this active template
    await AsyncStorage.setItem(ACTIVE_TEMPLATE_KEY, templateId);
    console.log(`[ReceiptCustomization] Active template updated globally to: ${templateId}`);
  } catch (err) {
    console.error('[ReceiptCustomization] Failed to set active template:', err);
  }
}

/**
 * Reset restaurant templates to default system templates
 */
export async function resetToDefaultTemplate(restaurantId?: string): Promise<ReceiptTemplate> {
  try {
    const key = restaurantId ? `${TEMPLATES_STORAGE_KEY}_${restaurantId}` : TEMPLATES_STORAGE_KEY;
    const activeKey = restaurantId ? `${ACTIVE_TEMPLATE_KEY}_${restaurantId}` : ACTIVE_TEMPLATE_KEY;

    await AsyncStorage.removeItem(key);
    await AsyncStorage.removeItem(activeKey);
    await AsyncStorage.removeItem(TEMPLATES_STORAGE_KEY);
    await AsyncStorage.removeItem(ACTIVE_TEMPLATE_KEY);

    return DEFAULT_RECEIPT_TEMPLATE;
  } catch (err) {
    console.error('[ReceiptCustomization] Failed to reset templates:', err);
    return DEFAULT_RECEIPT_TEMPLATE;
  }
}

/**
 * Safely format a restaurant or store address object/string into a single clean line
 */
export function formatRestaurantAddress(addr: any): string {
  if (!addr) return '';
  if (typeof addr === 'string') {
    const trimmed = addr.trim();
    if (trimmed === '[object Object]') return '';
    return trimmed;
  }
  if (typeof addr === 'object') {
    if (addr.formattedAddress && typeof addr.formattedAddress === 'string') {
      const trimmed = addr.formattedAddress.trim();
      if (trimmed && trimmed !== '[object Object]') return trimmed;
    }
    if (addr.fullAddress && typeof addr.fullAddress === 'string') {
      const trimmed = addr.fullAddress.trim();
      if (trimmed && trimmed !== '[object Object]') return trimmed;
    }
    const parts = [
      addr.shopNo,
      addr.floor,
      addr.area,
      addr.addressLine1,
      addr.addressLine2,
      addr.street,
      addr.city,
      addr.landmark ? `near ${addr.landmark}` : undefined,
      addr.state,
      addr.pincode || addr.postalCode || addr.postcode || addr.zipCode,
    ].filter((p) => typeof p === 'string' && p.trim().length > 0 && p.trim() !== '[object Object]');

    if (parts.length > 0) {
      return parts.join(', ');
    }
    if (addr.city && typeof addr.city === 'string') return addr.city;
  }
  return '';
}

let _cachedStoreProfile: { restaurantName?: string; phoneNumber?: string; address?: string } | null = null;

export function setCachedStoreProfile(profile: { restaurantName?: string; phoneNumber?: string; address?: string } | null) {
  _cachedStoreProfile = profile;
}

export function getCachedStoreProfile(): { restaurantName?: string; phoneNumber?: string; address?: string } | null {
  return _cachedStoreProfile;
}

/**
 * Realistic Mock Sample Order for Live Preview
 */
export function getSampleOrderForPreview(
  type: 'dine_in' | 'delivery' | 'pickup' = 'dine_in',
  storeNameOverride?: string
): Partial<Order> & any {
  const storeName = storeNameOverride || _cachedStoreProfile?.restaurantName || 'Restaurant Name';
  const storePhone = _cachedStoreProfile?.phoneNumber || 'Phone Number';
  const storeAddress = formatRestaurantAddress(_cachedStoreProfile?.address) || 'Store Address, Store City, Postcode';

  return {
    _id: '65f8a9e2d3b4c10023456789',
    orderNumber: 'ORD-ID-12345',
    orderType: type,
    status: 'preparing',
    createdAt: new Date().toISOString(),
    restaurantId: {
      _id: 'rest_001',
      restaurantName: storeName,
      phoneNumber: storePhone,
      address: storeAddress,
      formattedAddress: storeAddress,
    },
    restaurantName: storeName,
    restaurantAddress: storeAddress,
    customerDetails: {
      name: 'Customer Name',
      phoneNumber: 'Phone Number',
      address: 'Address Line ',
    },
    deliveryAddress: {
      addressLine1: 'Address Line 1',
      street: 'Street',
      city: 'City',
      postalCode: 'Postal Code',
      formattedAddress: 'Address Line , City, Postal Code',
    },
    tableNumber: 'Table Name',
    notes: 'Please make chicken tikka extra crispy. Cutlery requested.',
    paymentType: 'card',
    paymentStatus: 'paid',
    orderedItems: [
      {
        name: 'Item Name',
        quantity: 1,
        price: 13.95,
        customization: {
          size: 'Regular',
          addOns: ['Extra Naan Bread', 'Garlic Dip'],
        },
      },
      {
        name: 'Lamb Rogan Josh',
        quantity: 1,
        price: 15.50,
        customization: {
          size: 'Spicy / Medium',
        },
      },
      {
        name: 'Pilau Basmati Rice',
        quantity: 2,
        price: 3.50,
      },
      {
        name: 'Mango Lassi (Chilled)',
        quantity: 2,
        price: 3.25,
      },
    ],
    pricing: {
      subtotal: 42.95,
      deliveryFee: type === 'delivery' ? 2.50 : 0,
      serviceFee: 1.00,
      platformFee: 1.00,
      tax: 7.15,
      discount: 4.29, // 10% promo
      tip: 2.00,
      total: type === 'delivery' ? 44.16 : 41.66,
    },
  };
}
