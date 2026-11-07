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
  logoShape?: 'square' | 'circle' | 'rounded';
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
  showScheduledTime?: boolean;
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
const DELETED_TEMPLATES_KEY = '@krifoo_deleted_receipt_templates';

/**
 * Built-in templates carry a FIXED timestamp. (Previously they used `new Date()` at app start,
 * which made them "newer" than any saved edit, so edits to built-in templates were lost on restart.)
 */
const PRELOADED_TIMESTAMP = '2024-01-01T00:00:00.000Z';

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplate = {
  id: 'standard_pos',
  name: 'Standard POS Receipt',
  description: 'Balanced, elegant thermal receipt layout suitable for everyday orders',
  isDefault: true,
  createdAt: PRELOADED_TIMESTAMP,
  updatedAt: PRELOADED_TIMESTAMP,
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
    taxIdValue: '',
    showOrderNumber: true,
    showTableNumber: true,
    showServerWaiterName: false,
    serverWaiterName: '',
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
    showScheduledTime: true,
  },
};

export const COMPACT_TAKEAWAY_TEMPLATE: ReceiptTemplate = {
  id: 'compact_takeaway',
  name: 'Compact Takeaway',
  description: 'Fast, compact layout optimized for takeaway counters',
  isDefault: false,
  createdAt: PRELOADED_TIMESTAMP,
  updatedAt: PRELOADED_TIMESTAMP,
  layout: {
    paperWidth: '58mm',
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
    taxIdLabel: 'Tax ID:',
    taxIdValue: '',
    showOrderNumber: true,
    showTableNumber: false,
    showServerWaiterName: false,
    serverWaiterName: '',
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
    qrCodeData: '',
    qrCodeLabel: '',
    showScheduledTime: true,
  },
};

export const DINE_IN_INVOICE_TEMPLATE: ReceiptTemplate = {
  id: 'dine_in_invoice',
  name: 'Full Dine-In & Tax Invoice',
  description: 'Detailed dining receipt with table number, waiter, VAT breakdown, and feedback QR',
  isDefault: false,
  createdAt: PRELOADED_TIMESTAMP,
  updatedAt: PRELOADED_TIMESTAMP,
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
    customHeaderTitle: 'TAX INVOICE / GUEST RECEIPT',
    showAddress: true,
    showPhone: true,
    showTaxId: true, // only prints once the restaurant enters its own VAT number
    taxIdLabel: 'VAT Reg No:',
    taxIdValue: '',
    showOrderNumber: true,
    showTableNumber: true,
    showServerWaiterName: true,
    serverWaiterName: '',
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
    qrCodeData: '', // restaurant must enter its own review link
    qrCodeLabel: 'Scan to leave us a review',
    showScheduledTime: true,
  },
};

/**
 * Fills in any fields missing from a stored template (older app versions, partial saves)
 * WITHOUT overriding the restaurant's own choices.
 *
 * (Previously this forced font size / family / spacing / bold / italic back to defaults on
 * every load and save, so those editor controls never persisted.)
 */
export function normalizeTemplate(template: ReceiptTemplate | null | undefined): ReceiptTemplate {
  const base = DEFAULT_RECEIPT_TEMPLATE;
  if (!template) return cloneTemplate(base);
  const layout: Partial<ReceiptLayoutConfig> = template.layout || {};
  const content: Partial<ReceiptContentConfig> = { ...(template.content || {}) };
  // Scrub placeholder values shipped by older app versions so they never print on real receipts
  if (content.taxIdValue && PLACEHOLDER_TAX_IDS.includes(content.taxIdValue.trim())) content.taxIdValue = '';
  if (content.serverWaiterName && PLACEHOLDER_WAITERS.includes(content.serverWaiterName.trim())) content.serverWaiterName = '';
  if (content.qrCodeData && PLACEHOLDER_QR_LINKS.includes(content.qrCodeData.trim())) content.qrCodeData = '';
  return {
    ...base,
    ...template,
    layout: {
      ...base.layout,
      ...layout,
      alignment: { ...base.layout.alignment, ...(layout.alignment || {}) },
      boldElements: { ...base.layout.boldElements, ...(layout.boldElements || {}) },
      italicElements: { ...base.layout.italicElements, ...(layout.italicElements || {}) },
    },
    content: { ...base.content, ...content },
  };
}

const PLACEHOLDER_TAX_IDS = ['GB 123 4567 89', 'GB 987 6543 21', 'GB123456789'];
const PLACEHOLDER_WAITERS = ['Front Counter', 'Alex / Table Service', 'Front Staff'];
const PLACEHOLDER_QR_LINKS = ['https://g.page/r/krifoo-feedback/review'];

/** @deprecated kept for backward compatibility — now only fills missing fields. */
export const normalizeTemplateFontHierarchy = normalizeTemplate;

/** Deep copy so callers can never mutate cached / constant template objects. */
export function cloneTemplate(template: ReceiptTemplate): ReceiptTemplate {
  return JSON.parse(JSON.stringify(template));
}

export const PRELOADED_TEMPLATES: ReceiptTemplate[] = [
  DEFAULT_RECEIPT_TEMPLATE,
  COMPACT_TAKEAWAY_TEMPLATE,
  DINE_IN_INVOICE_TEMPLATE,
];

const templatesKey = (restaurantId?: string) =>
  restaurantId ? `${TEMPLATES_STORAGE_KEY}_${restaurantId}` : TEMPLATES_STORAGE_KEY;
const activeKey = (restaurantId?: string) =>
  restaurantId ? `${ACTIVE_TEMPLATE_KEY}_${restaurantId}` : ACTIVE_TEMPLATE_KEY;
const deletedKey = (restaurantId?: string) =>
  restaurantId ? `${DELETED_TEMPLATES_KEY}_${restaurantId}` : DELETED_TEMPLATES_KEY;

async function readJsonArray<T>(key: string): Promise<T[] | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null; // corrupted key — ignore
  }
}

/**
 * Reads the stored templates for a restaurant.
 * The restaurant's own key wins; the global key is only used as a legacy fallback
 * (so one restaurant's edits can no longer override another's).
 */
async function readStoredTemplates(restaurantId?: string): Promise<ReceiptTemplate[]> {
  if (restaurantId) {
    const own = await readJsonArray<ReceiptTemplate>(templatesKey(restaurantId));
    if (own) return own;
  }
  return (await readJsonArray<ReceiptTemplate>(templatesKey())) || [];
}

async function readDeletedIds(restaurantId?: string): Promise<string[]> {
  if (restaurantId) {
    const own = await readJsonArray<string>(deletedKey(restaurantId));
    if (own) return own;
  }
  return (await readJsonArray<string>(deletedKey())) || [];
}

/** Writes to the restaurant key, and to the global key so screens opened without a restaurantId stay in sync. */
async function writeScoped(keyFn: (r?: string) => string, value: string, restaurantId?: string) {
  if (restaurantId) await AsyncStorage.setItem(keyFn(restaurantId), value);
  await AsyncStorage.setItem(keyFn(), value);
}

/**
 * Get all receipt templates for a restaurant.
 * Stored templates always override the built-in version with the same id, and
 * deleted built-in templates stay deleted.
 */
export async function getAllReceiptTemplates(restaurantId?: string): Promise<ReceiptTemplate[]> {
  try {
    const stored = await readStoredTemplates(restaurantId);
    const deleted = new Set(await readDeletedIds(restaurantId));
    const storedById = new Map(stored.filter((t) => t && t.id).map((t) => [t.id, t]));

    const result: ReceiptTemplate[] = [];
    // Built-ins first (in their usual order), replaced by the stored copy when edited
    for (const builtIn of PRELOADED_TEMPLATES) {
      if (deleted.has(builtIn.id)) continue;
      result.push(storedById.get(builtIn.id) || builtIn);
      storedById.delete(builtIn.id);
    }
    // Then custom templates
    for (const custom of storedById.values()) {
      if (!deleted.has(custom.id)) result.push(custom);
    }

    const finalList = result.length > 0 ? result : [DEFAULT_RECEIPT_TEMPLATE];
    return finalList.map(normalizeTemplate);
  } catch (err) {
    console.warn('[ReceiptCustomization] Failed to load templates, returning defaults:', err);
    return PRELOADED_TEMPLATES.map(normalizeTemplate);
  }
}

/**
 * Get active template for a restaurant (always a fresh copy — safe to modify).
 */
export async function getActiveReceiptTemplate(restaurantId?: string): Promise<ReceiptTemplate> {
  try {
    let activeId: string | null = null;
    if (restaurantId) activeId = await AsyncStorage.getItem(activeKey(restaurantId));
    if (!activeId) activeId = await AsyncStorage.getItem(activeKey());

    const templates = await getAllReceiptTemplates(restaurantId);
    const found =
      (activeId && templates.find((t) => t.id === activeId)) ||
      templates.find((t) => t.isDefault) ||
      templates[0];
    return normalizeTemplate(found || DEFAULT_RECEIPT_TEMPLATE);
  } catch (err) {
    console.warn('[ReceiptCustomization] Failed to load active template, using default:', err);
    return cloneTemplate(DEFAULT_RECEIPT_TEMPLATE);
  }
}

/** Rough size guard — AsyncStorage on Android fails on very large single values. */
const MAX_TEMPLATES_JSON_BYTES = 1_500_000;

/**
 * Save or update a receipt template.
 */
export async function saveReceiptTemplate(
  template: ReceiptTemplate,
  restaurantId?: string,
  setAsActive: boolean = true
): Promise<ReceiptTemplate> {
  try {
    const stored = await readStoredTemplates(restaurantId);
    const updatedTemplate = normalizeTemplate({
      ...template,
      updatedAt: new Date().toISOString(),
    });

    const index = stored.findIndex((t) => t.id === template.id);
    const newList = index >= 0
      ? stored.map((t, i) => (i === index ? updatedTemplate : t))
      : [...stored, updatedTemplate];

    const jsonString = JSON.stringify(newList);
    if (jsonString.length > MAX_TEMPLATES_JSON_BYTES) {
      throw new Error('Templates are too large to save. Try a smaller logo image.');
    }
    await writeScoped(templatesKey, jsonString, restaurantId);

    // Saving a template that was previously deleted brings it back
    const deleted = await readDeletedIds(restaurantId);
    if (deleted.includes(template.id)) {
      await writeScoped(deletedKey, JSON.stringify(deleted.filter((id) => id !== template.id)), restaurantId);
    }

    if (setAsActive) {
      await writeScoped(activeKey, template.id, restaurantId);
    }

    return updatedTemplate;
  } catch (err) {
    console.error('[ReceiptCustomization] Failed to save template:', err);
    throw err;
  }
}

/**
 * Delete a receipt template. Built-in templates are remembered as deleted so they don't reappear.
 * If the active template is deleted, the first remaining template becomes active.
 */
export async function deleteReceiptTemplate(templateId: string, restaurantId?: string): Promise<void> {
  try {
    const stored = await readStoredTemplates(restaurantId);
    await writeScoped(templatesKey, JSON.stringify(stored.filter((t) => t.id !== templateId)), restaurantId);

    const deleted = await readDeletedIds(restaurantId);
    if (!deleted.includes(templateId)) {
      await writeScoped(deletedKey, JSON.stringify([...deleted, templateId]), restaurantId);
    }

    const currentActive =
      (restaurantId && (await AsyncStorage.getItem(activeKey(restaurantId)))) ||
      (await AsyncStorage.getItem(activeKey()));
    if (!currentActive || currentActive === templateId) {
      const remaining = await getAllReceiptTemplates(restaurantId);
      const fallback = remaining.find((t) => t.id !== templateId)?.id || DEFAULT_RECEIPT_TEMPLATE.id;
      await writeScoped(activeKey, fallback, restaurantId);
    }
  } catch (err) {
    console.error('[ReceiptCustomization] Failed to delete template:', err);
    throw err;
  }
}

/**
 * Set active receipt template.
 */
export async function setActiveReceiptTemplateId(templateId: string, restaurantId?: string): Promise<void> {
  await writeScoped(activeKey, templateId, restaurantId);
}

/**
 * Reset this restaurant's templates to the built-in defaults.
 */
export async function resetToDefaultTemplate(restaurantId?: string): Promise<ReceiptTemplate> {
  try {
    const keys = [templatesKey(), activeKey(), deletedKey()];
    if (restaurantId) keys.push(templatesKey(restaurantId), activeKey(restaurantId), deletedKey(restaurantId));
    await AsyncStorage.multiRemove(keys);
  } catch (err) {
    console.error('[ReceiptCustomization] Failed to reset templates:', err);
  }
  return cloneTemplate(DEFAULT_RECEIPT_TEMPLATE);
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
 * Checks whether a phone number is a dummy/placeholder (e.g. used for POS walk-in / counter orders)
 * so it won't be printed as customer phone on receipts or shown as contact info.
 */
export function isDummyCustomerPhone(phone?: string | null, restaurantPhone?: string | null): boolean {
  if (!phone) return true;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return true;
  if (
    digits === '0000000000' ||
    digits === '7000000001' ||
    digits === '07000000001' ||
    digits === '1234567890' ||
    /^(.)\1+$/.test(digits)
  ) {
    return true;
  }
  // If the phone number matches the store or restaurant phone number, treat as dummy customer phone
  // so the store's own number is not printed under "Customer: Phone:"
  const rawStore = restaurantPhone || _cachedStoreProfile?.phoneNumber;
  if (rawStore) {
    const storeDigits = String(rawStore).replace(/\D/g, '');
    if (storeDigits && (digits === storeDigits || digits.endsWith(storeDigits.slice(-9)) || storeDigits.endsWith(digits.slice(-9)))) {
      return true;
    }
  }
  return false;
}

/**
 * Realistic Mock Sample Order for Live Preview
 */
export function getSampleOrderForPreview(
  type: 'dine_in' | 'delivery' | 'pickup' = 'delivery',
  storeNameOverride?: string,
  isScheduled: boolean = false
): Partial<Order> & any {
  const storeName = storeNameOverride || _cachedStoreProfile?.restaurantName || 'DEMO KITCHEN';
  const storePhone = _cachedStoreProfile?.phoneNumber || '9876543210';
  const storeAddress = formatRestaurantAddress(_cachedStoreProfile?.address) || 'Unit 1, G Floor, CB1 2AW, London, near Opposite central park';

  const scheduledTarget = type === 'delivery' ? 'Today, 18:00 - 18:30' : 'Today, 18:30';

  return {
    _id: '65f8a9e2d3b4c10023456789',
    orderNumber: '3',
    orderType: type,
    status: 'preparing',
    createdAt: new Date().toISOString(),
    isScheduled: isScheduled,
    scheduleTimeDate: isScheduled ? scheduledTarget : undefined,
    collectionTime: isScheduled && type === 'pickup' ? '18:30' : undefined,
    deliverySlotTime: isScheduled && type === 'delivery' ? '18:00 - 18:30' : undefined,
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
      name: 'Testuser',
      phoneNumber: '9876543210',
      address: '12, 1 Whitehall, Greater London, SW1A 2DD, London, England, CB1 2AW',
    },
    deliveryAddress: {
      addressLine1: '12, 1 Whitehall',
      street: 'Whitehall',
      city: 'London',
      postalCode: 'CB1 2AW',
      formattedAddress: '12, 1 Whitehall, Greater London, London, SW1A 2DD, London, England, CB1 2AW',
    },
    tableNumber: type === 'dine_in' ? '3' : undefined,
    paymentType: 'cash',
    paymentStatus: 'pending',
    orderedItems: [
      {
        name: 'DOUBLE TROUBLE DEAL',
        itemName: 'DOUBLE TROUBLE DEAL',
        quantity: 1,
        price: 26.45,
        basePrice: 26.45,
        itemTotal: 26.45,
        selectedVariants: [],
        selectedAddons: [
          {
            optionTitle: "Devson's Original",
            price: 0,
          },
          {
            optionTitle: 'Chicken',
            price: 2.5,
          },
        ],
      },
    ],
    // Totals are consistent with the item list so previews and test prints add up
    pricing: {
      subtotal: SAMPLE_SUBTOTAL,
      deliveryFee: type === 'delivery' ? SAMPLE_DELIVERY_FEE : 0,
      handlingCharge: SAMPLE_HANDLING,
      discount: SAMPLE_DISCOUNT,
      total: Number(
        (SAMPLE_SUBTOTAL + (type === 'delivery' ? SAMPLE_DELIVERY_FEE : 0) + SAMPLE_HANDLING - SAMPLE_DISCOUNT).toFixed(2)
      ),
    },
  };
}

const SAMPLE_SUBTOTAL = 26.45;
const SAMPLE_DELIVERY_FEE = 1.49;
const SAMPLE_HANDLING = 0.5;
const SAMPLE_DISCOUNT = 2.0;

/**
 * Resolves all modifiers, variants, and add-ons for an ordered item into clean printable display lines.
 * Handles:
 * - selectedVariants: [{ variantName, optionTitle, name, additionalPrice, price, groupTitle }, ...]
 * - selectedAddons: [{ optionTitle, addonName, name, price, additionalPrice }, ...]
 * - selectedWeightVariant: { variantName, weight, unit, price }
 * - customization: { size, addOns }
 * - options: [...]
 */
export function getItemOptionsList(item: any): string[] {
  const options: string[] = [];
  if (!item) return options;

  // 1. Weight Variant
  if (item.selectedWeightVariant) {
    const wv = item.selectedWeightVariant;
    const wvName = wv.variantName || wv.name || (wv.weight ? `${wv.weight} ${wv.unit || ''}` : '');
    const wvPriceNum = Number(wv.additionalPrice ?? wv.price ?? 0);
    const wvPriceStr = wvPriceNum > 0 ? ` (+£${wvPriceNum.toFixed(2)})` : '';
    if (wvName) options.push(`${wvName}${wvPriceStr}`.trim());
  }

  // 2. Selected Variants
  if (Array.isArray(item.selectedVariants)) {
    item.selectedVariants.forEach((v: any) => {
      if (typeof v === 'string' && v.trim()) {
        options.push(v.trim());
      } else if (v && typeof v === 'object') {
        const vName = v.variantName || v.optionTitle || v.name || v.title || v.optionName || '';
        const vPriceNum = Number(v.additionalPrice ?? v.price ?? 0);
        const vPriceStr = vPriceNum > 0 ? ` (+£${vPriceNum.toFixed(2)})` : '';
        const groupPrefix = v.groupTitle ? `${v.groupTitle}: ` : '';
        if (vName) {
          options.push(`${groupPrefix}${vName}${vPriceStr}`.trim());
        }
      }
    });
  }

  // 3. Selected Addons
  if (Array.isArray(item.selectedAddons)) {
    item.selectedAddons.forEach((a: any) => {
      if (typeof a === 'string' && a.trim()) {
        options.push(a.trim());
      } else if (a && typeof a === 'object') {
        const aName = a.optionTitle || a.addonName || a.name || a.title || '';
        const aPriceNum = Number(a.price ?? a.additionalPrice ?? 0);
        const aPriceStr = aPriceNum > 0 ? ` (+£${aPriceNum.toFixed(2)})` : '';
        if (aName) {
          options.push(`${aName}${aPriceStr}`.trim());
        }
      }
    });
  }

  // 4. Legacy Customization (size, addOns)
  if (item.customization?.size) {
    options.push(`Size: ${item.customization.size}`);
  }
  if (Array.isArray(item.customization?.addOns)) {
    item.customization.addOns.forEach((a: any) => {
      if (typeof a === 'string' && a.trim()) {
        options.push(a.trim());
      } else if (a && typeof a === 'object') {
        const aName = a.optionTitle || a.addonName || a.name || a.title || '';
        const aPriceNum = Number(a.price ?? a.additionalPrice ?? 0);
        const aPriceStr = aPriceNum > 0 ? ` (+£${aPriceNum.toFixed(2)})` : '';
        if (aName) options.push(`${aName}${aPriceStr}`.trim());
      }
    });
  }

  // 5. Options array fallback
  if (Array.isArray(item.options)) {
    item.options.forEach((opt: any) => {
      if (typeof opt === 'string' && opt.trim()) {
        options.push(opt.trim());
      } else if (opt?.name || opt?.optionTitle) {
        options.push(opt.optionTitle || opt.name);
      }
    });
  }

  return options;
}
