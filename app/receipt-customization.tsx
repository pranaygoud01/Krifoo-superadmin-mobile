import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  useWindowDimensions,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import {
  ReceiptTemplate,
  ReceiptLayoutConfig,
  ReceiptContentConfig,
  DEFAULT_RECEIPT_TEMPLATE,
  PRELOADED_TEMPLATES,
  getAllReceiptTemplates,
  getActiveReceiptTemplate,
  saveReceiptTemplate,
  deleteReceiptTemplate,
  setActiveReceiptTemplateId,
  resetToDefaultTemplate,
  getSampleOrderForPreview,
  TextAlignment,
  PaperWidth,
  ReceiptFontSize,
  ReceiptFontFamily,
  ReceiptLineSpacing,
  QrCodeType,
  setCachedStoreProfile,
  getCachedStoreProfile,
  formatRestaurantAddress,
} from '../services/receipt-customization.service';
import { printTestReceiptTemplate } from '../services/thermal-print.service';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  Printer,
  Sparkles,
  Check,
  RotateCcw,
  Save,
  Plus,
  Trash2,
  Copy,
  Sliders,
  FileText,
  QrCode,
  Image as ImageIcon,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Eye,
  EyeOff,
  ChevronRight,
  Upload,
  X,
  Store,
  Receipt,
  UtensilsCrossed,
  Bike,
  ShoppingBag,
  ArrowLeft,
  Edit3,
  Bold,
  Italic,
  Pencil,
  Palette,
  ChevronDown,
  Calendar,
  Clock,
  Lock,
} from 'lucide-react-native';

export type CanvaElementId =
  | 'logo'
  | 'header_title'
  | 'restaurant_name'
  | 'header_message'
  | 'address_phone'
  | 'tax_id'
  | 'order_banner'
  | 'date_time'
  | 'order_mode'
  | 'table_server'
  | 'customer_info'
  | 'items_table'
  | 'totals_section'
  | 'payment_method'
  | 'order_notes'
  | 'footer_message'
  | 'qr_code';

const TABLET_BREAKPOINT = 860;

export default function ReceiptCustomizationScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const restaurantId = params.restaurantId;
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= TABLET_BREAKPOINT;



  // Screen Mode: 'templates_list' | 'editor'
  const [screenMode, setScreenMode] = useState<'templates_list' | 'editor'>('templates_list');
  const [activeTemplateId, setActiveTemplateId] = useState<string>(DEFAULT_RECEIPT_TEMPLATE.id);
  const [testPrintingId, setTestPrintingId] = useState<string | null>(null);
  const [targetDeleteTemplate, setTargetDeleteTemplate] = useState<ReceiptTemplate | null>(null);

  // Templates list and active template
  const [templates, setTemplates] = useState<ReceiptTemplate[]>(PRELOADED_TEMPLATES);
  const [currentTemplate, setCurrentTemplate] = useState<ReceiptTemplate>(DEFAULT_RECEIPT_TEMPLATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);

  // Sample order preview mode
  const [sampleOrderType, setSampleOrderType] = useState<'dine_in' | 'delivery' | 'pickup'>('dine_in');

  // Canva-Style Visual Editor State
  const [canvaMode, setCanvaMode] = useState<boolean>(true);
  const [selectedCanvaId, setSelectedCanvaId] = useState<CanvaElementId | null>('restaurant_name');
  const [inlineEditingId, setInlineEditingId] = useState<CanvaElementId | null>(null);

  // Preview Customization Tool State
  const [previewToolsExpanded, setPreviewToolsExpanded] = useState<boolean>(true);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [backendRestaurantName, setBackendRestaurantName] = useState<string>('');
  const [backendRestaurantAddress, setBackendRestaurantAddress] = useState<string>('');
  const [backendRestaurantPhone, setBackendRestaurantPhone] = useState<string>('');

  // Load initial templates and restaurant data from backend
  useEffect(() => {
    loadTemplates();
  }, [restaurantId]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const all = await getAllReceiptTemplates(restaurantId);
      const active = await getActiveReceiptTemplate(restaurantId);
      setTemplates(all);
      setActiveTemplateId(active.id);
      setCurrentTemplate(active);

      // Fetch restaurant name directly from backend order/store profile
      try {
        let storeName = '';
        let storePhone = '';
        let storeAddress = '';
        if (restaurantId) {
          const restRes = await restaurantService.getRestaurantById(restaurantId);
          if (restRes?.success && restRes.data?.restaurantName) {
            storeName = restRes.data.restaurantName;
            storePhone = restRes.data.phoneNumber || '';
            storeAddress = formatRestaurantAddress(restRes.data.address);
          }
        }
        if (!storeName) {
          const ownerRes = await restaurantOwnerService.getRestaurantProfile();
          if (ownerRes?.success && ownerRes.data?.restaurantName) {
            storeName = ownerRes.data.restaurantName;
            storePhone = ownerRes.data.phoneNumber || '';
            storeAddress = formatRestaurantAddress(ownerRes.data.address);
          }
        }
        if (storeName) {
          setBackendRestaurantName(storeName);
          if (storeAddress) setBackendRestaurantAddress(storeAddress);
          if (storePhone) setBackendRestaurantPhone(storePhone);
          setCachedStoreProfile({
            restaurantName: storeName,
            phoneNumber: storePhone,
            address: storeAddress,
          });
        }
      } catch (restErr) {
        console.warn('[ReceiptCustomization] Could not fetch backend restaurant profile:', restErr);
      }
    } catch (err) {
      console.error('[ReceiptCustomization] Error loading templates:', err);
      showToast({ title: 'Error', message: 'Failed to load templates', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Open editor for a template
  const handleOpenEditor = (template: ReceiptTemplate) => {
    setCurrentTemplate(template);
    setScreenMode('editor');
  };

  // Switch / Activate template
  const handleActivateTemplate = async (template: ReceiptTemplate, e?: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setActiveTemplateId(template.id);
    setCurrentTemplate(template);
    await setActiveReceiptTemplateId(template.id, restaurantId);
    showToast({
      title: 'Active Template Updated ✅',
      message: `'${template.name}' is now active for all receipt prints.`,
      type: 'success',
    });
  };

  // Test Print specific template card
  const handleCardTestPrint = async (template: ReceiptTemplate, e?: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setTestPrintingId(template.id);
    try {
      showToast({
        title: 'Dispatching Test Print...',
        message: `Sending '${template.name}' (${template.layout.paperWidth}) to printer...`,
        type: 'info',
      });
      const ok = await printTestReceiptTemplate(template, restaurantId, backendRestaurantName);
      if (ok) {
        showToast({ title: 'Test Print Sent ✅', message: 'Receipt printed successfully', type: 'success' });
      }
    } catch (err: any) {
      console.error('[ReceiptCustomization] Test print error:', err);
      showToast({ title: 'Print Failed ❌', message: err?.message || 'Error executing test print', type: 'error' });
    } finally {
      setTestPrintingId(null);
    }
  };

  // Duplicate specific template card
  const handleDuplicateTemplateItem = async (template: ReceiptTemplate, e?: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const dupName = `${template.name} (Copy)`;
    const newId = `copy_${Date.now()}`;
    const dupTpl: ReceiptTemplate = {
      ...template,
      id: newId,
      name: dupName,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const saved = await saveReceiptTemplate(dupTpl, restaurantId, false);
      const all = await getAllReceiptTemplates(restaurantId);
      setTemplates(all);
      showToast({ title: 'Template Duplicated', message: `Created '${dupName}'`, type: 'success' });
    } catch (err: any) {
      showToast({ title: 'Duplicate Failed', message: err?.message || 'Could not duplicate', type: 'error' });
    }
  };

  // Update layout property
  const updateLayout = (updater: (prev: ReceiptLayoutConfig) => ReceiptLayoutConfig) => {
    setCurrentTemplate((prev) => ({
      ...prev,
      layout: updater(prev.layout),
    }));
  };

  // Update content property
  const updateContent = (updater: (prev: ReceiptContentConfig) => ReceiptContentConfig) => {
    setCurrentTemplate((prev) => ({
      ...prev,
      content: updater(prev.content),
    }));
  };

  // Update layout and auto-sync globally if this template is active
  const handleTopHardwareChange = async (partialLayout: Partial<ReceiptLayoutConfig>, label: string) => {
    const updated: ReceiptTemplate = {
      ...currentTemplate,
      layout: {
        ...currentTemplate.layout,
        ...partialLayout,
      },
    };
    setCurrentTemplate(updated);
    setOpenDropdownId(null);

    // If currently active template, immediately persist globally
    if (activeTemplateId === currentTemplate.id) {
      try {
        await saveReceiptTemplate(updated, restaurantId, true);
        const all = await getAllReceiptTemplates(restaurantId);
        setTemplates(all);
        showToast({
          title: `${label} Active Globally ✅`,
          message: `Active template updated for all receipt prints in the app.`,
          type: 'success',
        });
      } catch (e) {
        console.warn('[ReceiptCustomization] Failed to auto-save top hardware setting:', e);
      }
    }
  };

  // Pick Logo Image
  const handlePickLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast({ title: 'Permission Required', message: 'Please allow gallery access to choose a logo.', type: 'info' });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        const uri = res.assets[0].uri;
        updateContent((prev) => ({ ...prev, logoUrl: uri, showLogo: true }));
        showToast({ title: 'Logo Selected', message: 'Logo will be rendered on the receipt', type: 'success' });
      }
    } catch (err) {
      console.error('[ReceiptCustomization] Image picker error:', err);
      showToast({ title: 'Error', message: 'Failed to select image', type: 'error' });
    }
  };

  // Save changes
  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      const saved = await saveReceiptTemplate(currentTemplate, restaurantId, true);
      const all = await getAllReceiptTemplates(restaurantId);
      setTemplates(all);
      setCurrentTemplate(saved);
      setActiveTemplateId(saved.id);
      showToast({
        title: 'Template Saved ✅',
        message: `'${saved.name}' has been updated and applied to all receipt prints.`,
        type: 'success',
      });
    } catch (err: any) {
      showToast({ title: 'Save Failed', message: err?.message || 'Failed to save template', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Create new template
  const handleCreateNewTemplate = async () => {
    if (!newTemplateName.trim()) {
      showToast({ title: 'Name Required', message: 'Please enter a name for the new template', type: 'info' });
      return;
    }

    const newId = `custom_${Date.now()}`;
    const newTpl: ReceiptTemplate = {
      ...currentTemplate,
      id: newId,
      name: newTemplateName.trim(),
      description: 'Custom restaurant receipt template',
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const saved = await saveReceiptTemplate(newTpl, restaurantId, true);
      const all = await getAllReceiptTemplates(restaurantId);
      setTemplates(all);
      setCurrentTemplate(saved);
      setShowNewModal(false);
      setNewTemplateName('');
      setActiveTemplateId(saved.id);
      setScreenMode('editor');
      showToast({
        title: 'Template Created 🎉',
        message: `'${saved.name}' created and opened for customization`,
        type: 'success',
      });
    } catch (err: any) {
      showToast({ title: 'Creation Failed', message: err?.message || 'Failed to create template', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Duplicate current template
  const handleDuplicateTemplate = async () => {
    const dupName = `${currentTemplate.name} (Copy)`;
    const newId = `copy_${Date.now()}`;
    const dupTpl: ReceiptTemplate = {
      ...currentTemplate,
      id: newId,
      name: dupName,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const saved = await saveReceiptTemplate(dupTpl, restaurantId, true);
      const all = await getAllReceiptTemplates(restaurantId);
      setTemplates(all);
      setCurrentTemplate(saved);
      showToast({ title: 'Template Duplicated', message: `Created '${dupName}'`, type: 'success' });
    } catch (err: any) {
      showToast({ title: 'Duplicate Failed', message: err?.message || 'Could not duplicate', type: 'error' });
    }
  };

  // Delete template
  const handleDeleteTemplate = async () => {
    const tplToDelete = targetDeleteTemplate || currentTemplate;
    try {
      await deleteReceiptTemplate(tplToDelete.id, restaurantId);
      const all = await getAllReceiptTemplates(restaurantId);
      const active = await getActiveReceiptTemplate(restaurantId);
      setTemplates(all);
      setActiveTemplateId(active.id);
      setCurrentTemplate(active);
      setShowDeleteConfirm(false);
      setTargetDeleteTemplate(null);
      showToast({ title: 'Template Deleted', message: `'${tplToDelete.name}' removed successfully`, type: 'info' });
    } catch (err: any) {
      showToast({ title: 'Delete Failed', message: err?.message || 'Could not delete template', type: 'error' });
    }
  };

  // Reset to default
  const handleResetDefaults = async () => {
    try {
      const reset = await resetToDefaultTemplate(restaurantId);
      const all = await getAllReceiptTemplates(restaurantId);
      setTemplates(all);
      setCurrentTemplate(reset);
      setShowResetConfirm(false);
      showToast({ title: 'Reset Complete', message: 'All templates restored to system defaults', type: 'success' });
    } catch (err: any) {
      showToast({ title: 'Reset Failed', message: err?.message || 'Could not reset', type: 'error' });
    }
  };

  // Test Print
  const handleTestPrint = async () => {
    setTestPrinting(true);
    try {
      showToast({
        title: 'Dispatching Test Print...',
        message: `Sending '${currentTemplate.name}' to printer...`,
        type: 'info',
      });
      const ok = await printTestReceiptTemplate(currentTemplate, restaurantId, backendRestaurantName);
      if (ok) {
        showToast({ title: 'Test Print Sent ✅', message: 'Receipt printed successfully', type: 'success' });
      } else {
        showToast({ title: 'Notice', message: 'Printer completed or spooler opened.', type: 'info' });
      }
    } catch (err: any) {
      console.error('[ReceiptCustomization] Test print error:', err);
      showToast({ title: 'Print Failed ❌', message: err?.message || 'Error executing test print', type: 'error' });
    } finally {
      setTestPrinting(false);
    }
  };

  // Mock order for preview - populated with real backend restaurant data
  const sampleOrder = useMemo(() => {
    const base = getSampleOrderForPreview(sampleOrderType, backendRestaurantName);
    const resolvedAddress = formatRestaurantAddress(backendRestaurantAddress) || base.restaurantAddress;
    const resolvedPhone = backendRestaurantPhone || base.restaurantId?.phoneNumber;
    base.restaurantId = {
      ...base.restaurantId,
      restaurantName: backendRestaurantName || base.restaurantId?.restaurantName,
      address: resolvedAddress,
      formattedAddress: resolvedAddress,
      phoneNumber: resolvedPhone,
    };
    base.restaurantName = backendRestaurantName || base.restaurantName;
    base.restaurantAddress = resolvedAddress;
    return base;
  }, [sampleOrderType, backendRestaurantName, backendRestaurantAddress, backendRestaurantPhone]);

  // Render Align Selector Component
  const renderAlignPicker = (
    label: string,
    currentAlign: TextAlignment,
    onSelect: (a: TextAlignment) => void
  ) => (
    <View style={styles.alignGroup}>
      <Text style={styles.alignGroupLabel}>{label}</Text>
      <View style={styles.alignButtonsRow}>
        <TouchableOpacity
          style={[styles.alignBtn, currentAlign === 'left' && styles.alignBtnActive]}
          onPress={() => onSelect('left')}
          activeOpacity={0.7}
        >
          <AlignLeft size={14} color={currentAlign === 'left' ? '#FFFFFF' : '#4B5563'} />
          <Text style={[styles.alignBtnText, currentAlign === 'left' && styles.alignBtnTextActive]}>Left</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.alignBtn, currentAlign === 'center' && styles.alignBtnActive]}
          onPress={() => onSelect('center')}
          activeOpacity={0.7}
        >
          <AlignCenter size={14} color={currentAlign === 'center' ? '#FFFFFF' : '#4B5563'} />
          <Text style={[styles.alignBtnText, currentAlign === 'center' && styles.alignBtnTextActive]}>Center</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.alignBtn, currentAlign === 'right' && styles.alignBtnActive]}
          onPress={() => onSelect('right')}
          activeOpacity={0.7}
        >
          <AlignRight size={14} color={currentAlign === 'right' ? '#FFFFFF' : '#4B5563'} />
          <Text style={[styles.alignBtnText, currentAlign === 'right' && styles.alignBtnTextActive]}>Right</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render Toggle Row Component
  const renderToggleRow = (
    title: string,
    subtitle: string | undefined,
    value: boolean,
    onToggle: (v: boolean) => void
  ) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {subtitle ? <Text style={styles.toggleSubtitle}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#E2E8F0', true: '#FF5C39' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );

  // -------------------------------------------------------------
  // CANVA VISUAL EDITOR LOGIC & HELPERS
  // -------------------------------------------------------------

  const handleCanvaSelect = (id: CanvaElementId, directEdit = false) => {
    if (id === 'restaurant_name') {
      // Restaurant name is fetched directly from backend order and is NOT text editable
      setSelectedCanvaId(id);
      setInlineEditingId(null);
      return;
    }
    if (selectedCanvaId === id && directEdit) {
      setInlineEditingId(id);
    } else {
      setSelectedCanvaId(id);
      if (directEdit) {
        setInlineEditingId(id);
      } else {
        setInlineEditingId(null);
      }
    }
  };

  const handleCanvaAlign = (align: TextAlignment) => {
    if (!selectedCanvaId) return;
    if (
      selectedCanvaId === 'logo' ||
      selectedCanvaId === 'header_title' ||
      selectedCanvaId === 'restaurant_name' ||
      selectedCanvaId === 'header_message' ||
      selectedCanvaId === 'address_phone' ||
      selectedCanvaId === 'tax_id'
    ) {
      updateLayout((l) => ({ ...l, alignment: { ...l.alignment, header: align } }));
    } else if (selectedCanvaId === 'items_table') {
      updateLayout((l) => ({ ...l, alignment: { ...l.alignment, items: align } }));
    } else if (selectedCanvaId === 'totals_section') {
      updateLayout((l) => ({ ...l, alignment: { ...l.alignment, totals: align } }));
    } else if (selectedCanvaId === 'footer_message') {
      updateLayout((l) => ({ ...l, alignment: { ...l.alignment, footer: align } }));
    }
  };

  const handleCanvaBoldToggle = () => {
    if (!selectedCanvaId) return;
    if (selectedCanvaId === 'restaurant_name') {
      updateLayout((l) => ({
        ...l,
        boldElements: { ...l.boldElements, restaurantName: !l.boldElements.restaurantName },
      }));
    } else if (selectedCanvaId === 'order_banner') {
      updateLayout((l) => ({
        ...l,
        boldElements: { ...l.boldElements, orderNumber: !l.boldElements.orderNumber },
      }));
    } else if (selectedCanvaId === 'items_table') {
      updateLayout((l) => ({
        ...l,
        boldElements: { ...l.boldElements, itemNames: !l.boldElements.itemNames },
      }));
    } else if (selectedCanvaId === 'totals_section') {
      updateLayout((l) => ({
        ...l,
        boldElements: { ...l.boldElements, totalAmount: !l.boldElements.totalAmount },
      }));
    } else if (selectedCanvaId === 'customer_info') {
      updateLayout((l) => ({
        ...l,
        boldElements: { ...l.boldElements, customerDetails: !l.boldElements.customerDetails },
      }));
    }
  };

  const handleCanvaItalicToggle = () => {
    if (!selectedCanvaId) return;
    if (selectedCanvaId === 'header_message') {
      updateLayout((l) => ({
        ...l,
        italicElements: { ...l.italicElements, tagline: !l.italicElements.tagline },
      }));
    } else if (selectedCanvaId === 'footer_message') {
      updateLayout((l) => ({
        ...l,
        italicElements: { ...l.italicElements, footerMessage: !l.italicElements.footerMessage },
      }));
    }
  };

  const handleCanvaFontSizeCycle = () => {
    updateLayout((l) => {
      const nextSize: ReceiptFontSize =
        l.fontSize === 'small' ? 'medium' : l.fontSize === 'medium' ? 'large' : 'small';
      return { ...l, fontSize: nextSize };
    });
  };

  const handleCanvaHide = (id: CanvaElementId) => {
    if (id === 'logo') {
      updateContent((c) => ({ ...c, showLogo: false }));
      showToast({ title: 'Logo Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'header_title') {
      updateContent((c) => ({ ...c, customHeaderTitle: '' }));
      showToast({ title: 'Header Title Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'restaurant_name') {
      updateContent((c) => ({ ...c, showRestaurantName: false }));
      showToast({ title: 'Restaurant Name Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'header_message') {
      updateContent((c) => ({ ...c, headerMessage: '' }));
      showToast({ title: 'Tagline Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'address_phone') {
      updateContent((c) => ({ ...c, showAddress: false, showPhone: false }));
      showToast({ title: 'Address & Phone Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'tax_id') {
      updateContent((c) => ({ ...c, showTaxId: false }));
      showToast({ title: 'Tax ID Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'order_banner') {
      updateContent((c) => ({ ...c, showOrderNumber: false }));
      showToast({ title: 'Order # Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'date_time') {
      updateContent((c) => ({ ...c, showDateTime: false }));
      showToast({ title: 'Date & Time Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'table_server') {
      updateContent((c) => ({ ...c, showTableNumber: false, showServerWaiterName: false }));
      showToast({ title: 'Table & Server Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'customer_info') {
      updateContent((c) => ({ ...c, showCustomerInfo: false }));
      showToast({ title: 'Customer Info Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'items_table') {
      updateContent((c) => ({ ...c, showItemNotes: !c.showItemNotes }));
      showToast({ title: 'Item Notes Toggled', message: 'Item details updated', type: 'info' });
      return;
    } else if (id === 'totals_section') {
      updateContent((c) => ({ ...c, showItemTaxBreakdown: false, showDiscountLine: false }));
      showToast({ title: 'Tax & Discount Rows Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'payment_method') {
      updateContent((c) => ({ ...c, showPaymentMethod: false }));
      showToast({ title: 'Payment Status Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'footer_message') {
      updateContent((c) => ({ ...c, footerMessage: '' }));
      showToast({ title: 'Footer Note Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    } else if (id === 'qr_code') {
      updateContent((c) => ({ ...c, showQrCode: false }));
      showToast({ title: 'QR Code Hidden', message: 'Restored anytime from + Add Elements below', type: 'info' });
    }

    setSelectedCanvaId(null);
    setInlineEditingId(null);
  };

  const handleCanvaRestore = (key: string) => {
    switch (key) {
      case 'logo':
        updateContent((c) => ({ ...c, showLogo: true }));
        setSelectedCanvaId('logo');
        showToast({ title: 'Logo Added', message: 'Logo section is now visible', type: 'success' });
        break;
      case 'header_title':
        updateContent((c) => ({ ...c, customHeaderTitle: c.customHeaderTitle || 'TAX INVOICE' }));
        setSelectedCanvaId('header_title');
        setInlineEditingId('header_title');
        showToast({ title: 'Header Title Added', message: 'Type directly on receipt to edit', type: 'success' });
        break;
      case 'restaurant_name':
        updateContent((c) => ({ ...c, showRestaurantName: true }));
        setSelectedCanvaId('restaurant_name');
        showToast({ title: 'Restaurant Name Added', message: 'Restaurant name is now visible', type: 'success' });
        break;
      case 'header_message':
        updateContent((c) => ({ ...c, headerMessage: c.headerMessage || 'Authentic Flavors & Fresh Cooking' }));
        setSelectedCanvaId('header_message');
        setInlineEditingId('header_message');
        showToast({ title: 'Tagline Added', message: 'Type directly on receipt to customize', type: 'success' });
        break;
      case 'address':
        updateContent((c) => ({ ...c, showAddress: true }));
        setSelectedCanvaId('address_phone');
        showToast({ title: 'Address Added', message: 'Restaurant address is visible', type: 'success' });
        break;
      case 'phone':
        updateContent((c) => ({ ...c, showPhone: true }));
        setSelectedCanvaId('address_phone');
        showToast({ title: 'Phone Added', message: 'Restaurant phone is visible', type: 'success' });
        break;
      case 'tax_id':
        updateContent((c) => ({ ...c, showTaxId: true, taxIdValue: c.taxIdValue || 'GB123456789' }));
        setSelectedCanvaId('tax_id');
        setInlineEditingId('tax_id');
        showToast({ title: 'Tax ID Added', message: 'Type your VAT ID directly', type: 'success' });
        break;
      case 'order_banner':
        updateContent((c) => ({ ...c, showOrderNumber: true }));
        setSelectedCanvaId('order_banner');
        showToast({ title: 'Order Banner Added', message: 'Order number banner is visible', type: 'success' });
        break;
      case 'date_time':
        updateContent((c) => ({ ...c, showDateTime: true }));
        setSelectedCanvaId('date_time');
        showToast({ title: 'Date & Time Added', message: 'Timestamp is visible', type: 'success' });
        break;
      case 'table_number':
        updateContent((c) => ({ ...c, showTableNumber: true }));
        setSelectedCanvaId('table_server');
        showToast({ title: 'Table Number Added', message: 'Table number will print on dine-in receipts', type: 'success' });
        break;
      case 'server_name':
        updateContent((c) => ({ ...c, showServerWaiterName: true, serverWaiterName: c.serverWaiterName || 'Front Staff' }));
        setSelectedCanvaId('table_server');
        setInlineEditingId('table_server');
        showToast({ title: 'Server Name Added', message: 'Type waiter/server name directly', type: 'success' });
        break;
      case 'customer_info':
        updateContent((c) => ({ ...c, showCustomerInfo: true }));
        setSelectedCanvaId('customer_info');
        showToast({ title: 'Customer Info Added', message: 'Customer details will print', type: 'success' });
        break;
      case 'item_notes':
        updateContent((c) => ({ ...c, showItemNotes: true }));
        setSelectedCanvaId('items_table');
        showToast({ title: 'Item Notes Added', message: 'Add-ons & sizes will print under items', type: 'success' });
        break;
      case 'tax_breakdown':
        updateContent((c) => ({ ...c, showItemTaxBreakdown: true }));
        setSelectedCanvaId('totals_section');
        showToast({ title: 'Tax Breakdown Added', message: 'VAT/Tax line is now shown in totals', type: 'success' });
        break;
      case 'discount_line':
        updateContent((c) => ({ ...c, showDiscountLine: true }));
        setSelectedCanvaId('totals_section');
        showToast({ title: 'Discount Added', message: 'Promotional discount row is visible', type: 'success' });
        break;
      case 'payment_method':
        updateContent((c) => ({ ...c, showPaymentMethod: true }));
        setSelectedCanvaId('payment_method');
        showToast({ title: 'Payment Status Added', message: 'Payment method is shown', type: 'success' });
        break;
      case 'footer_message':
        updateContent((c) => ({ ...c, footerMessage: c.footerMessage || 'Thank you for your visit! Please visit again.' }));
        setSelectedCanvaId('footer_message');
        setInlineEditingId('footer_message');
        showToast({ title: 'Footer Note Added', message: 'Type thank-you message directly', type: 'success' });
        break;
      case 'qr_code':
        updateContent((c) => ({
          ...c,
          showQrCode: true,
          qrCodeData: c.qrCodeData || 'https://krifoo.com',
          qrCodeLabel: c.qrCodeLabel || 'Scan to view menu & order',
        }));
        setSelectedCanvaId('qr_code');
        showToast({ title: 'QR Code Added', message: 'QR Code block is now on your receipt', type: 'success' });
        break;
    }
  };

  // Canva Item Bounding Box Wrapper
  const renderCanvaBox = (
    id: CanvaElementId,
    label: string,
    children: React.ReactNode,
    options?: {
      editable?: boolean;
      style?: any;
    }
  ) => {
    const isSelected = canvaMode && selectedCanvaId === id;
    const isEditing = canvaMode && inlineEditingId === id;

    if (!canvaMode) {
      return <View style={options?.style}>{children}</View>;
    }

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => handleCanvaSelect(id, options?.editable)}
        style={[
          styles.canvaBoxBase,
          isSelected && styles.canvaBoxSelected,
          !isSelected && styles.canvaBoxIdle,
          options?.style,
        ]}
      >
        {/* Floating Tag Pill when Selected */}
        {isSelected && (
          <View style={styles.canvaPillTag}>
            <Text style={styles.canvaPillTagText}>{label}</Text>
            {options?.editable && !isEditing && (
              <TouchableOpacity
                onPress={() => setInlineEditingId(id)}
                style={styles.canvaPillEditAction}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Pencil size={9} color="#FFFFFF" />
                <Text style={styles.canvaPillEditText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 4 Corner Canva Anchor Handles */}
        {isSelected && (
          <>
            <View style={[styles.canvaAnchorHandle, styles.canvaAnchorTL]} />
            <View style={[styles.canvaAnchorHandle, styles.canvaAnchorTR]} />
            <View style={[styles.canvaAnchorHandle, styles.canvaAnchorBL]} />
            <View style={[styles.canvaAnchorHandle, styles.canvaAnchorBR]} />
          </>
        )}

        {children}
      </TouchableOpacity>
    );
  };

  // Floating Canva Toolbar Component
  const renderCanvaFloatingToolbar = () => {
    if (!canvaMode || !selectedCanvaId) return null;

    const layout = currentTemplate.layout;

    // Determine capabilities for selected element
    const isHeaderSection = [
      'logo',
      'header_title',
      'restaurant_name',
      'header_message',
      'address_phone',
      'tax_id',
    ].includes(selectedCanvaId);

    const hasAlignment =
      isHeaderSection ||
      selectedCanvaId === 'items_table' ||
      selectedCanvaId === 'totals_section' ||
      selectedCanvaId === 'footer_message';

    const currentAlign: TextAlignment = isHeaderSection
      ? layout.alignment.header
      : selectedCanvaId === 'items_table'
        ? layout.alignment.items
        : selectedCanvaId === 'totals_section'
          ? layout.alignment.totals
          : selectedCanvaId === 'footer_message'
            ? layout.alignment.footer
            : 'center';

    const hasBold =
      selectedCanvaId === 'restaurant_name' ||
      selectedCanvaId === 'order_banner' ||
      selectedCanvaId === 'items_table' ||
      selectedCanvaId === 'totals_section' ||
      selectedCanvaId === 'customer_info';

    const isBoldActive =
      (selectedCanvaId === 'restaurant_name' && layout.boldElements.restaurantName) ||
      (selectedCanvaId === 'order_banner' && layout.boldElements.orderNumber) ||
      (selectedCanvaId === 'items_table' && layout.boldElements.itemNames) ||
      (selectedCanvaId === 'totals_section' && layout.boldElements.totalAmount) ||
      (selectedCanvaId === 'customer_info' && layout.boldElements.customerDetails);

    const hasItalic = selectedCanvaId === 'header_message' || selectedCanvaId === 'footer_message';

    const isItalicActive =
      (selectedCanvaId === 'header_message' && layout.italicElements.tagline) ||
      (selectedCanvaId === 'footer_message' && layout.italicElements.footerMessage);

    const hasDirectTextEdit = [
      'header_title',
      'header_message',
      'tax_id',
      'table_server',
      'footer_message',
      'qr_code',
    ].includes(selectedCanvaId);

    const elementTitles: Record<CanvaElementId, string> = {
      logo: 'Logo Image',
      header_title: 'Custom Header Title',
      restaurant_name: 'Restaurant Name',
      header_message: 'Tagline / Subtitle',
      address_phone: 'Address & Phone',
      tax_id: 'Tax / VAT ID',
      order_banner: 'Order Number Banner',
      date_time: 'Date & Time Stamp',
      order_mode: 'Order Type Tag',
      table_server: 'Table & Waiter',
      customer_info: 'Customer Details',
      items_table: 'Items Table',
      totals_section: 'Totals & Taxes',
      payment_method: 'Payment Status',
      order_notes: 'Order Notes',
      footer_message: 'Footer Message',
      qr_code: 'QR Code Block',
    };

    return (
      <View style={styles.canvaToolbarContainer}>
        <View style={styles.canvaToolbarHeader}>
          <View style={styles.canvaToolbarTitleRow}>
            <View style={styles.canvaToolbarBadgeDot} />
            <Text style={styles.canvaToolbarTitle}>{elementTitles[selectedCanvaId]}</Text>
          </View>
          <TouchableOpacity
            style={styles.canvaToolbarCloseBtn}
            onPress={() => {
              setSelectedCanvaId(null);
              setInlineEditingId(null);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={15} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.canvaToolbarActionsRow}>
          {/* Direct Text Edit Button */}
          {hasDirectTextEdit && (
            <TouchableOpacity
              style={[
                styles.canvaToolBtn,
                inlineEditingId === selectedCanvaId && styles.canvaToolBtnActive,
              ]}
              onPress={() => setInlineEditingId(selectedCanvaId)}
              activeOpacity={0.7}
            >
              <Pencil
                size={13}
                color={inlineEditingId === selectedCanvaId ? '#FFFFFF' : '#E2E8F0'}
              />
              <Text
                style={[
                  styles.canvaToolBtnText,
                  inlineEditingId === selectedCanvaId && styles.canvaToolBtnTextActive,
                ]}
              >
                Edit Text
              </Text>
            </TouchableOpacity>
          )}

          {/* Alignment Selector */}
          {hasAlignment && (
            <View style={styles.canvaToolSegment}>
              <TouchableOpacity
                style={[styles.canvaToolSegmentBtn, currentAlign === 'left' && styles.canvaToolSegmentBtnActive]}
                onPress={() => handleCanvaAlign('left')}
                activeOpacity={0.7}
              >
                <AlignLeft size={13} color={currentAlign === 'left' ? '#FFFFFF' : '#94A3B8'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.canvaToolSegmentBtn, currentAlign === 'center' && styles.canvaToolSegmentBtnActive]}
                onPress={() => handleCanvaAlign('center')}
                activeOpacity={0.7}
              >
                <AlignCenter size={13} color={currentAlign === 'center' ? '#FFFFFF' : '#94A3B8'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.canvaToolSegmentBtn, currentAlign === 'right' && styles.canvaToolSegmentBtnActive]}
                onPress={() => handleCanvaAlign('right')}
                activeOpacity={0.7}
              >
                <AlignRight size={13} color={currentAlign === 'right' ? '#FFFFFF' : '#94A3B8'} />
              </TouchableOpacity>
            </View>
          )}

          {/* Bold Toggle */}
          {hasBold && (
            <TouchableOpacity
              style={[styles.canvaToolBtn, isBoldActive && styles.canvaToolBtnActive]}
              onPress={handleCanvaBoldToggle}
              activeOpacity={0.7}
            >
              <Bold size={13} color={isBoldActive ? '#FFFFFF' : '#E2E8F0'} />
              <Text style={[styles.canvaToolBtnText, isBoldActive && styles.canvaToolBtnTextActive]}>
                Bold
              </Text>
            </TouchableOpacity>
          )}

          {/* Italic Toggle */}
          {hasItalic && (
            <TouchableOpacity
              style={[styles.canvaToolBtn, isItalicActive && styles.canvaToolBtnActive]}
              onPress={handleCanvaItalicToggle}
              activeOpacity={0.7}
            >
              <Italic size={13} color={isItalicActive ? '#FFFFFF' : '#E2E8F0'} />
              <Text style={[styles.canvaToolBtnText, isItalicActive && styles.canvaToolBtnTextActive]}>
                Italic
              </Text>
            </TouchableOpacity>
          )}

          {/* Font Size Cycle */}
          <TouchableOpacity
            style={styles.canvaToolBtn}
            onPress={handleCanvaFontSizeCycle}
            activeOpacity={0.7}
          >
            <Type size={13} color="#E2E8F0" />
            <Text style={styles.canvaToolBtnText}>
              {layout.fontSize.toUpperCase()}
            </Text>
          </TouchableOpacity>

          {/* Hide Element Button */}
          <TouchableOpacity
            style={[styles.canvaToolBtn, styles.canvaToolBtnDanger]}
            onPress={() => handleCanvaHide(selectedCanvaId)}
            activeOpacity={0.7}
          >
            <EyeOff size={13} color="#F87171" />
            <Text style={[styles.canvaToolBtnText, { color: '#F87171' }]}>Hide</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Add Elements Shelf (Canva Style)
  const renderAddElementsShelf = () => {
    const content = currentTemplate.content;

    const availableToRestore: { key: string; label: string; icon: any }[] = [];

    if (!content.showLogo) availableToRestore.push({ key: 'logo', label: '+ Logo', icon: ImageIcon });
    if (!content.customHeaderTitle) availableToRestore.push({ key: 'header_title', label: '+ Header Title', icon: Type });
    if (!content.showRestaurantName) availableToRestore.push({ key: 'restaurant_name', label: '+ Restaurant Name', icon: Store });
    if (!content.headerMessage) availableToRestore.push({ key: 'header_message', label: '+ Tagline', icon: Edit3 });
    if (!content.showAddress) availableToRestore.push({ key: 'address', label: '+ Address', icon: FileText });
    if (!content.showPhone) availableToRestore.push({ key: 'phone', label: '+ Phone', icon: FileText });
    if (!content.showTaxId) availableToRestore.push({ key: 'tax_id', label: '+ Tax / VAT ID', icon: FileText });
    if (!content.showOrderNumber) availableToRestore.push({ key: 'order_banner', label: '+ Order # Banner', icon: Receipt });
    if (!content.showDateTime) availableToRestore.push({ key: 'date_time', label: '+ Date & Time', icon: FileText });
    if (!content.showTableNumber) availableToRestore.push({ key: 'table_number', label: '+ Table #', icon: UtensilsCrossed });
    if (!content.showServerWaiterName) availableToRestore.push({ key: 'server_name', label: '+ Server Name', icon: FileText });
    if (!content.showCustomerInfo) availableToRestore.push({ key: 'customer_info', label: '+ Customer Info', icon: FileText });
    if (!content.showItemNotes) availableToRestore.push({ key: 'item_notes', label: '+ Item Addons/Notes', icon: FileText });
    if (!content.showItemTaxBreakdown) availableToRestore.push({ key: 'tax_breakdown', label: '+ Tax Breakdown', icon: FileText });
    if (!content.showDiscountLine) availableToRestore.push({ key: 'discount_line', label: '+ Discount Line', icon: FileText });
    if (!content.showPaymentMethod) availableToRestore.push({ key: 'payment_method', label: '+ Payment Status', icon: FileText });
    if (!content.footerMessage) availableToRestore.push({ key: 'footer_message', label: '+ Footer Message', icon: Edit3 });
    if (!content.showQrCode) availableToRestore.push({ key: 'qr_code', label: '+ QR Code', icon: QrCode });

    return (
      <View style={styles.addShelfContainer}>
        <View style={styles.addShelfHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Palette size={15} color="#2563EB" />
            <Text style={styles.addShelfTitle}>Add / Restore Elements</Text>
          </View>
          <Text style={styles.addShelfCount}>
            {availableToRestore.length} hidden {availableToRestore.length === 1 ? 'item' : 'items'}
          </Text>
        </View>
        <Text style={styles.addShelfSubtitle}>
          Tap any element to place it onto your receipt and customize directly:
        </Text>

        {availableToRestore.length === 0 ? (
          <View style={styles.addShelfEmpty}>
            <Check size={14} color="#10B981" />
            <Text style={styles.addShelfEmptyText}>All available receipt elements are active on your receipt!</Text>
          </View>
        ) : (
          <View style={styles.addShelfChipsWrap}>
            {availableToRestore.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.addShelfChip}
                onPress={() => handleCanvaRestore(item.key)}
                activeOpacity={0.7}
              >
                <Plus size={12} color="#2563EB" />
                <Text style={styles.addShelfChipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  // Helper to render an interactive dropdown field for the Preview Customization Tool
  const renderDropdownField = (
    dropdownId: string,
    label: string,
    icon: React.ReactNode,
    currentDisplay: string,
    options: { value: string; label: string; desc?: string }[],
    onSelect: (val: string) => void
  ) => {
    const isOpen = openDropdownId === dropdownId;

    return (
      <View style={styles.toolDropdownFieldWrapper}>
        <Text style={styles.toolDropdownLabel}>{label}</Text>
        <TouchableOpacity
          style={[styles.toolDropdownSelector, isOpen && styles.toolDropdownSelectorOpen]}
          onPress={() => setOpenDropdownId(isOpen ? null : dropdownId)}
          activeOpacity={0.75}
        >
          <View style={styles.toolDropdownSelectorLeft}>
            {icon}
            <Text style={styles.toolDropdownSelectorText} numberOfLines={1}>
              {currentDisplay}
            </Text>
          </View>
          <ChevronDown
            size={16}
            color={isOpen ? '#FF5C39' : '#64748B'}
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
          />
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.toolDropdownMenu}>
            {options.map((opt) => {
              const isSelected = opt.value === currentDisplay || opt.label.startsWith(currentDisplay);
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.toolDropdownItem, isSelected && styles.toolDropdownItemSelected]}
                  onPress={() => {
                    onSelect(opt.value);
                    setOpenDropdownId(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.toolDropdownItemLabel, isSelected && styles.toolDropdownItemLabelSelected]}>
                      {opt.label}
                    </Text>
                    {/* {opt.desc ? (
                      <Text style={styles.toolDropdownItemDesc} numberOfLines={1}>
                        {opt.desc}
                      </Text>
                    ) : null} */}
                  </View>
                  {isSelected && <Check size={14} color="#FF5C39" />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  // -------------------------------------------------------------
  // PREVIEW TAB CUSTOMIZATION TOOL (Rolls, Hardware & Date/Time)
  // -------------------------------------------------------------
  const renderPreviewCustomizationTools = () => {
    return (
      <View style={styles.previewToolsCard}>
        {/* Header with expand/collapse */}
        <TouchableOpacity
          style={styles.previewToolsHeader}
          onPress={() => setPreviewToolsExpanded(!previewToolsExpanded)}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <View style={styles.previewToolsIconBadge}>
              <Sliders size={14} color="#FF5C39" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewToolsTitle}>Formatting Tools</Text>
              <Text style={styles.previewToolsSubtitle} numberOfLines={1}>
                Line spacing, base font scale & date format
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* <View style={styles.liveSyncBadge}>
              <View style={styles.liveSyncDot} />
              <Text style={styles.liveSyncText}>LIVE</Text>
            </View> */}
            <ChevronDown
              size={18}
              color="#64748B"
              style={{ transform: [{ rotate: previewToolsExpanded ? '180deg' : '0deg' }] }}
            />
          </View>
        </TouchableOpacity>

        {previewToolsExpanded && (
          <View style={styles.previewToolsBody}>
            {/* Group 1: Typography & Line Spacing */}
            <View style={styles.previewToolGroup}>
              <View style={styles.previewToolGroupHeader}>
                <Sliders size={13} color="#0F172A" />
                <Text style={styles.previewToolGroupTitle}>Typography & Spacing</Text>
              </View>

              {/* Dropdown 3: Line Spacing */}
              {renderDropdownField(
                'lineSpacing',
                'Line Spacing',
                <Sliders size={13} color="#475569" />,
                currentTemplate.layout.lineSpacing === 'compact'
                  ? 'Compact Spacing (Saves Paper)'
                  : currentTemplate.layout.lineSpacing === 'relaxed'
                    ? 'Relaxed Spacing (Spacious)'
                    : 'Normal Spacing (Standard)',
                [
                  {
                    value: 'normal',
                    label: 'Normal Spacing (Standard)',
                    desc: 'Default balanced vertical line spacing',
                  },
                  {
                    value: 'compact',
                    label: 'Compact Spacing (Saves Paper)',
                    desc: 'Tighter line pitch to reduce roll usage',
                  },
                  {
                    value: 'relaxed',
                    label: 'Relaxed Spacing (Spacious)',
                    desc: 'Generous line height for quick kitchen reading',
                  },
                ],
                (val) => updateLayout((l) => ({ ...l, lineSpacing: val as ReceiptLineSpacing }))
              )}

              {/* Dropdown 4: Base Font Size */}
              {renderDropdownField(
                'fontSize',
                'Base Font Scale',
                <Type size={13} color="#475569" />,
                currentTemplate.layout.fontSize === 'small'
                  ? 'Small (Compact 11px)'
                  : currentTemplate.layout.fontSize === 'large'
                    ? 'Large (Prominent 14px)'
                    : 'Medium (Standard 12.5px)',
                [
                  {
                    value: 'small',
                    label: 'Small (Compact 11px)',
                    desc: 'Compact font for long, item-heavy receipts',
                  },
                  {
                    value: 'medium',
                    label: 'Medium (Standard 12.5px)',
                    desc: 'Recommended standard readable font',
                  },
                  {
                    value: 'large',
                    label: 'Large (Prominent 14px)',
                    desc: 'High visibility for busy kitchen prep stations',
                  },
                ],
                (val) => updateLayout((l) => ({ ...l, fontSize: val as ReceiptFontSize }))
              )}
            </View>

            {/* Divider */}
            <View style={styles.previewToolsGroupDivider} />

            {/* Group 2: Date & Time Format */}
            <View style={styles.previewToolGroup}>
              <View style={styles.previewToolGroupHeader}>
                <Clock size={13} color="#0F172A" />
                <Text style={styles.previewToolGroupTitle}>Date & Time Format</Text>
              </View>

              {/* Dropdown 5: Date Time Format */}
              {renderDropdownField(
                'dateTimeFormat',
                'Timestamp Display Format',
                <Calendar size={13} color="#475569" />,
                currentTemplate.content.dateTimeFormat === 'time_only'
                  ? 'Time Only (HH:mm)'
                  : currentTemplate.content.dateTimeFormat === 'short'
                    ? 'Short Date (DD/MM HH:mm)'
                    : 'Full UK (DD/MM/YYYY HH:mm)',
                [
                  {
                    value: 'uk',
                    label: 'Full UK (DD/MM/YYYY HH:mm)',
                    desc: 'e.g. 08/09/2026 19:45',
                  },
                  {
                    value: 'short',
                    label: 'Short Date (DD/MM HH:mm)',
                    desc: 'e.g. 08/09 19:45',
                  },
                  {
                    value: 'time_only',
                    label: 'Time Only (HH:mm)',
                    desc: 'e.g. 19:45 (ideal for quick takeaway/express)',
                  },
                ],
                (val) => updateContent((c) => ({ ...c, dateTimeFormat: val as any }))
              )}

              {/* Dropdown 6: Date Time Visibility */}
              {renderDropdownField(
                'showDateTime',
                'Timestamp Visibility',
                <Eye size={13} color="#475569" />,
                currentTemplate.content.showDateTime ? 'Visible on Receipt' : 'Hidden from Receipt',
                [
                  {
                    value: 'visible',
                    label: 'Visible on Receipt',
                    desc: 'Print date and time stamp on receipt paper',
                  },
                  {
                    value: 'hidden',
                    label: 'Hidden from Receipt',
                    desc: 'Do not print order date/time',
                  },
                ],
                (val) => updateContent((c) => ({ ...c, showDateTime: val === 'visible' }))
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  // Render Thermal Paper Live Preview
  const renderLiveReceiptPreview = () => {
    const layout = currentTemplate.layout;
    const content = currentTemplate.content;
    const is58mm = layout.paperWidth === '58mm';

    const paperFontFamily = layout.fontFamily === 'fontB' ? 'Consolas' : 'Courier';
    const fontSize = layout.fontSize === 'small' ? 10.5 : layout.fontSize === 'large' ? 13.5 : 12;

    const restName = content.showRestaurantName
      ? (backendRestaurantName || sampleOrder.restaurantId?.restaurantName || sampleOrder.restaurantName || getCachedStoreProfile()?.restaurantName || 'Restaurant Name').toUpperCase()
      : '';
    const headerTitle = content.customHeaderTitle ? content.customHeaderTitle.toUpperCase() : '';
    const phone =
      backendRestaurantPhone ||
      (typeof sampleOrder.restaurantId === 'object' ? sampleOrder.restaurantId?.phoneNumber : '') ||
      sampleOrder.restaurantPhone ||
      getCachedStoreProfile()?.phoneNumber ||
      '+44 1234 567890';
    const address =
      formatRestaurantAddress(backendRestaurantAddress) ||
      formatRestaurantAddress(sampleOrder.restaurantId?.address) ||
      formatRestaurantAddress(sampleOrder.restaurantAddress) ||
      formatRestaurantAddress(getCachedStoreProfile()?.address) ||
      'Store Address, Store City, Postcode';
    const orderNum = sampleOrder.orderNumber || 'ORDER-ID';
    const isDine = sampleOrderType === 'dine_in';
    const isDeliv = sampleOrderType === 'delivery';

    return (
      <View style={styles.previewCardContainer}>
        {/* Sample Order Switcher */}
        <View style={styles.sampleOrderSwitchRow}>
          <Text style={styles.sampleOrderLabel}>Preview Mode:</Text>
          <View style={styles.sampleOrderChips}>
            <TouchableOpacity
              style={[styles.sampleChip, sampleOrderType === 'dine_in' && styles.sampleChipActive]}
              onPress={() => setSampleOrderType('dine_in')}
            >
              <UtensilsCrossed size={12} color={sampleOrderType === 'dine_in' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.sampleChipText, sampleOrderType === 'dine_in' && styles.sampleChipTextActive]}>
                Dine-In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sampleChip, sampleOrderType === 'delivery' && styles.sampleChipActive]}
              onPress={() => setSampleOrderType('delivery')}
            >
              <Bike size={12} color={sampleOrderType === 'delivery' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.sampleChipText, sampleOrderType === 'delivery' && styles.sampleChipTextActive]}>
                Delivery
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sampleChip, sampleOrderType === 'pickup' && styles.sampleChipActive]}
              onPress={() => setSampleOrderType('pickup')}
            >
              <ShoppingBag size={12} color={sampleOrderType === 'pickup' ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.sampleChipText, sampleOrderType === 'pickup' && styles.sampleChipTextActive]}>
                Takeaway
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Canva Mode Toggle Banner */}
        <View style={styles.canvaBannerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Palette size={14} color={canvaMode ? '#2563EB' : '#64748B'} />
            <Text style={styles.canvaBannerText}>
              {canvaMode ? 'Editor' : 'Preview Mode'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.canvaModePill, canvaMode && styles.canvaModePillActive]}
            onPress={() => {
              setCanvaMode(!canvaMode);
              if (canvaMode) {
                setSelectedCanvaId(null);
                setInlineEditingId(null);
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.canvaModePillText, canvaMode && styles.canvaModePillTextActive]}>
              {canvaMode ? 'Edit Mode' : 'Preview Mode'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Floating Contextual Canva Toolbar */}
        {renderCanvaFloatingToolbar()}

        {/* Paper Simulation Wrapper */}
        <View style={[styles.paperOuterShadow, is58mm && styles.paperOuterShadow58mm]}>
          {/* Top Zig-Zag Tear Edge */}
          <View style={styles.zigzagEdgeTop}>
            {Array.from({ length: is58mm ? 23 : 30 }).map((_, i) => (
              <View key={i} style={styles.zigzagToothTop} />
            ))}
          </View>

          <View
            style={[
              styles.thermalPaper,
              is58mm && styles.thermalPaper58mm,
            ]}
          >
            {/* Header Section */}
            <View style={{ alignItems: layout.alignment.header === 'left' ? 'flex-start' : layout.alignment.header === 'right' ? 'flex-end' : 'center' }}>
              {/* Logo */}
              {content.showLogo && (
                renderCanvaBox(
                  'logo',
                  'Logo Image',
                  content.logoUrl ? (
                    <Image source={{ uri: content.logoUrl }} style={styles.paperLogo} resizeMode="contain" />
                  ) : (
                    <TouchableOpacity onPress={handlePickLogo} style={styles.paperLogoPlaceholder}>
                      <Upload size={14} color="#64748B" />
                      <Text style={styles.paperLogoPlaceholderText}>+ Upload Logo</Text>
                    </TouchableOpacity>
                  )
                )
              )}

              {/* Custom Header Title */}
              {content.customHeaderTitle ? (
                renderCanvaBox(
                  'header_title',
                  'Custom Header Title',
                  inlineEditingId === 'header_title' ? (
                    <View style={styles.canvaInlineInputRow}>
                      <TextInput
                        style={[
                          styles.canvaInlineInput,
                          {
                            fontWeight: '800',
                            fontSize: fontSize + 1,
                            textAlign: layout.alignment.header,
                            fontFamily: paperFontFamily,
                          },
                        ]}
                        value={content.customHeaderTitle}
                        onChangeText={(t) => updateContent((c) => ({ ...c, customHeaderTitle: t }))}
                        autoFocus
                        selectTextOnFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          setInlineEditingId(null);
                          Keyboard.dismiss();
                        }}
                      />
                      <TouchableOpacity
                        style={styles.canvaInlineDoneBtn}
                        onPress={() => { setInlineEditingId(null); Keyboard.dismiss(); }}
                      >
                        <Check size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={[styles.paperText, { fontWeight: '800', fontSize: fontSize + 1, letterSpacing: 0.5, textAlign: layout.alignment.header }]}>
                      {headerTitle}
                    </Text>
                  ),
                  { editable: true }
                )
              ) : null}

              {/* Restaurant Name - Fetched directly from backend order (Not text editable) */}
              {content.showRestaurantName ? (
                renderCanvaBox(
                  'restaurant_name',
                  'Restaurant Name ',
                  <Text
                    style={[
                      styles.paperText,
                      {
                        fontSize: layout.fontSize === 'large' ? fontSize + 4 : fontSize + 2,
                        fontWeight: layout.boldElements.restaurantName ? '900' : '600',
                        textAlign: layout.alignment.header,
                      },
                    ]}
                  >
                    {restName}
                  </Text>,
                  { editable: false }
                )
              ) : null}

              {/* Tagline / Subtitle */}
              {content.headerMessage ? (
                renderCanvaBox(
                  'header_message',
                  'Tagline / Subtitle',
                  inlineEditingId === 'header_message' ? (
                    <View style={styles.canvaInlineInputRow}>
                      <TextInput
                        style={[
                          styles.canvaInlineInput,
                          {
                            fontSize: fontSize - 1,
                            fontStyle: layout.italicElements.tagline ? 'italic' : 'normal',
                            textAlign: layout.alignment.header,
                            fontFamily: paperFontFamily,
                          },
                        ]}
                        value={content.headerMessage}
                        placeholder="Tagline / Header note..."
                        onChangeText={(t) => updateContent((c) => ({ ...c, headerMessage: t }))}
                        autoFocus
                        selectTextOnFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          setInlineEditingId(null);
                          Keyboard.dismiss();
                        }}
                      />
                      <TouchableOpacity
                        style={styles.canvaInlineDoneBtn}
                        onPress={() => { setInlineEditingId(null); Keyboard.dismiss(); }}
                      >
                        <Check size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.paperText,
                        {
                          fontSize: fontSize - 1,
                          fontStyle: layout.italicElements.tagline ? 'italic' : 'normal',
                          color: '#334155',
                          textAlign: layout.alignment.header,
                        },
                      ]}
                    >
                      {content.headerMessage}
                    </Text>
                  ),
                  { editable: true }
                )
              ) : null}

              {/* Address & Phone */}
              {(content.showAddress || content.showPhone) && (
                renderCanvaBox(
                  'address_phone',
                  'Address & Phone',
                  <View style={{ alignItems: layout.alignment.header === 'left' ? 'flex-start' : layout.alignment.header === 'right' ? 'flex-end' : 'center' }}>
                    {content.showAddress ? (
                      <Text style={[styles.paperText, { fontSize: fontSize - 1.5, textAlign: layout.alignment.header }]}>{address}</Text>
                    ) : null}
                    {content.showPhone ? (
                      <Text style={[styles.paperText, { fontSize: fontSize - 1.5, textAlign: layout.alignment.header }]}>Tel: {phone}</Text>
                    ) : null}
                  </View>
                )
              )}

              {/* Tax / VAT ID */}
              {content.showTaxId && content.taxIdValue ? (
                renderCanvaBox(
                  'tax_id',
                  'Tax / VAT ID',
                  inlineEditingId === 'tax_id' ? (
                    <View style={styles.canvaInlineInputRow}>
                      <TextInput
                        style={[
                          styles.canvaInlineInput,
                          {
                            fontSize: fontSize - 2,
                            textAlign: layout.alignment.header,
                            fontFamily: paperFontFamily,
                          },
                        ]}
                        value={content.taxIdValue}
                        placeholder="Tax / VAT Number"
                        onChangeText={(t) => updateContent((c) => ({ ...c, taxIdValue: t }))}
                        autoFocus
                        selectTextOnFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          setInlineEditingId(null);
                          Keyboard.dismiss();
                        }}
                      />
                      <TouchableOpacity
                        style={styles.canvaInlineDoneBtn}
                        onPress={() => { setInlineEditingId(null); Keyboard.dismiss(); }}
                      >
                        <Check size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={[styles.paperText, { fontSize: fontSize - 2, textAlign: layout.alignment.header, marginTop: 2 }]}>
                      {content.taxIdLabel || 'Tax ID:'} {content.taxIdValue}
                    </Text>
                  ),
                  { editable: true }
                )
              ) : null}
            </View>

            <View style={styles.paperDivider} />

            {/* Order Number Banner */}
            {content.showOrderNumber ? (
              renderCanvaBox(
                'order_banner',
                'Order # Banner',
                <View style={styles.paperOrderBanner}>
                  <Text
                    style={[
                      styles.paperOrderBannerText,
                      {
                        fontWeight: layout.boldElements.orderNumber ? '900' : '700',
                        fontSize: fontSize + 2,
                      },
                    ]}
                  >
                    ORDER #{orderNum}
                  </Text>
                </View>
              )
            ) : null}

            {/* Date & Time */}
            {content.showDateTime ? (
              renderCanvaBox(
                'date_time',
                'Date & Time Stamp',
                <Text style={[styles.paperText, { textAlign: 'center', fontSize: fontSize - 2 }]}>
                  Placed: {content.dateTimeFormat === 'time_only' ? '19:45' : '08/09/2026 19:45'}
                </Text>
              )
            ) : null}

            {/* Order Type Tag */}
            {renderCanvaBox(
              'order_mode',
              'Order Type Tag',
              <Text style={[styles.paperText, { textAlign: 'center', fontWeight: '800', marginTop: 2 }]}>
                [ {isDine ? 'EAT-IN / DINE-IN' : isDeliv ? 'DELIVERY ORDER' : 'PICKUP / TAKEAWAY'} ]
              </Text>
            )}

            {/* Table & Server Waiter Name */}
            {(content.showTableNumber && isDine) || content.showServerWaiterName ? (
              renderCanvaBox(
                'table_server',
                'Table & Server',
                inlineEditingId === 'table_server' ? (
                  <View style={styles.canvaInlineInputRow}>
                    <Text style={[styles.paperText, { fontSize: fontSize - 1 }]}>Server: </Text>
                    <TextInput
                      style={[
                        styles.canvaInlineInput,
                        {
                          fontSize: fontSize - 1,
                          fontFamily: paperFontFamily,
                          flex: 1,
                        },
                      ]}
                      value={content.serverWaiterName || ''}
                      placeholder="Server name..."
                      onChangeText={(t) => updateContent((c) => ({ ...c, serverWaiterName: t }))}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        setInlineEditingId(null);
                        Keyboard.dismiss();
                      }}
                    />
                    <TouchableOpacity
                      style={styles.canvaInlineDoneBtn}
                      onPress={() => { setInlineEditingId(null); Keyboard.dismiss(); }}
                    >
                      <Check size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ alignItems: 'center' }}>
                    {content.showTableNumber && isDine ? (
                      <Text style={[styles.paperText, { textAlign: 'center', fontWeight: '900', fontSize: fontSize + 1, color: '#0F172A' }]}>
                        TABLE: 7
                      </Text>
                    ) : null}
                    {content.showServerWaiterName ? (
                      <Text style={[styles.paperText, { textAlign: 'center', fontSize: fontSize - 1 }]}>
                        Server: {content.serverWaiterName || 'Front Staff'}
                      </Text>
                    ) : null}
                  </View>
                ),
                { editable: true }
              )
            ) : null}

            {/* Customer Details */}
            {content.showCustomerInfo ? (
              renderCanvaBox(
                'customer_info',
                'Customer Details',
                <>
                  <View style={styles.paperDivider} />
                  <View style={{ width: '100%' }}>
                    <Text style={[styles.paperText, { fontWeight: layout.boldElements.customerDetails ? '800' : '500' }]}>
                      Customer: Oliver Smith
                    </Text>
                    <Text style={styles.paperText}>Phone:    07700 900123</Text>
                    {isDeliv ? (
                      <>
                        <Text style={[styles.paperText, { fontWeight: '700' }]}>Address:  14 Cambridge Road</Text>
                        <Text style={[styles.paperText, { fontWeight: '800' }]}>Postcode: CB2 1AB</Text>
                      </>
                    ) : null}
                  </View>
                </>
              )
            ) : null}

            <View style={styles.paperDivider} />

            {/* Items Table */}
            {renderCanvaBox(
              'items_table',
              'Items Table',
              <View style={{ width: '100%' }}>
                {/* Items Header */}
                <View style={styles.paperItemsHeaderRow}>
                  <Text style={[styles.paperColHeader, { width: 32 }]}>QTY</Text>
                  <Text style={[styles.paperColHeader, { flex: 1, paddingHorizontal: 4, textAlign: layout.alignment.items }]}>ITEM</Text>
                  <Text style={[styles.paperColHeader, { width: 55, textAlign: 'right' }]}>PRICE</Text>
                </View>
                <View style={styles.paperDividerThin} />

                {/* Items Rows */}
                {sampleOrder.orderedItems.map((item: any, idx: number) => (
                  <View key={idx} style={{ marginBottom: 3 }}>
                    <View style={styles.paperItemRow}>
                      <Text style={[styles.paperText, { width: 32, fontWeight: '700' }]}>{item.quantity}x</Text>
                      <Text
                        style={[
                          styles.paperText,
                          {
                            flex: 1,
                            paddingHorizontal: 4,
                            fontWeight: layout.boldElements.itemNames ? '800' : '500',
                            textAlign: layout.alignment.items,
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>
                      <Text style={[styles.paperText, { width: 55, textAlign: 'right', fontWeight: '700' }]}>
                        £{(item.price * item.quantity).toFixed(2)}
                      </Text>
                    </View>
                    {content.showItemNotes && item.customization?.size ? (
                      <Text style={[styles.paperText, styles.paperItemNote]}>* Size: {item.customization.size}</Text>
                    ) : null}
                    {content.showItemNotes && item.customization?.addOns?.length ? (
                      <Text style={[styles.paperText, styles.paperItemNote]}>+ {item.customization.addOns.join(', ')}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.paperDivider} />

            {/* Totals Section */}
            {renderCanvaBox(
              'totals_section',
              'Totals & Tax Summary',
              <View style={{ width: '100%' }}>
                <View style={styles.paperSummaryRow}>
                  <Text style={styles.paperText}>Subtotal</Text>
                  <Text style={styles.paperText}>£42.95</Text>
                </View>

                {isDeliv ? (
                  <View style={styles.paperSummaryRow}>
                    <Text style={styles.paperText}>Delivery Fee</Text>
                    <Text style={styles.paperText}>£2.50</Text>
                  </View>
                ) : null}

                {content.showItemTaxBreakdown ? (
                  <View style={styles.paperSummaryRow}>
                    <Text style={styles.paperText}>Tax / VAT ({content.taxPercentage || 20}%)</Text>
                    <Text style={styles.paperText}>£7.15</Text>
                  </View>
                ) : null}

                {content.showDiscountLine ? (
                  <View style={styles.paperSummaryRow}>
                    <Text style={styles.paperText}>Discount (10% Promo)</Text>
                    <Text style={[styles.paperText, { color: '#B91C1C' }]}>-£4.29</Text>
                  </View>
                ) : null}

                <View style={styles.paperDoubleDivider} />

                <View style={styles.paperTotalRow}>
                  <Text
                    style={[
                      styles.paperTotalText,
                      {
                        fontSize: layout.fontSize === 'small' ? fontSize + 1 : fontSize + 3,
                        fontWeight: layout.boldElements.totalAmount ? '900' : '700',
                      },
                    ]}
                  >
                    TOTAL
                  </Text>
                  <Text
                    style={[
                      styles.paperTotalText,
                      {
                        fontSize: layout.fontSize === 'small' ? fontSize + 1 : fontSize + 3,
                        fontWeight: layout.boldElements.totalAmount ? '900' : '700',
                      },
                    ]}
                  >
                    £{isDeliv ? '43.16' : '40.66'}
                  </Text>
                </View>

                <View style={styles.paperDoubleDivider} />
              </View>
            )}

            {/* Payment Method */}
            {content.showPaymentMethod ? (
              renderCanvaBox(
                'payment_method',
                'Payment Status',
                <Text style={[styles.paperText, { textAlign: 'center', fontWeight: '800', marginVertical: 4 }]}>
                  PAYMENT: ONLINE (PAID)
                </Text>
              )
            ) : null}

            {/* Special Instructions */}
            {sampleOrder.notes ? (
              renderCanvaBox(
                'order_notes',
                'Order Notes',
                <>
                  <View style={styles.paperDivider} />
                  <Text style={[styles.paperText, { fontWeight: '700' }]}>NOTE: {sampleOrder.notes}</Text>
                </>
              )
            ) : null}

            {/* Footer Message */}
            {content.footerMessage ? (
              renderCanvaBox(
                'footer_message',
                'Footer Note',
                inlineEditingId === 'footer_message' ? (
                  <View style={styles.canvaInlineInputRow}>
                    <TextInput
                      style={[
                        styles.canvaInlineInput,
                        {
                          fontWeight: '800',
                          fontStyle: layout.italicElements.footerMessage ? 'italic' : 'normal',
                          textAlign: layout.alignment.footer,
                          fontFamily: paperFontFamily,
                        },
                      ]}
                      value={content.footerMessage}
                      placeholder="Enter thank you message..."
                      onChangeText={(t) => updateContent((c) => ({ ...c, footerMessage: t }))}
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        setInlineEditingId(null);
                        Keyboard.dismiss();
                      }}
                    />
                    <TouchableOpacity
                      style={styles.canvaInlineDoneBtn}
                      onPress={() => { setInlineEditingId(null); Keyboard.dismiss(); }}
                    >
                      <Check size={12} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ marginTop: 8, alignItems: layout.alignment.footer === 'left' ? 'flex-start' : layout.alignment.footer === 'right' ? 'flex-end' : 'center' }}>
                    <Text
                      style={[
                        styles.paperText,
                        {
                          fontWeight: '800',
                          fontStyle: layout.italicElements.footerMessage ? 'italic' : 'normal',
                          textAlign: layout.alignment.footer,
                        },
                      ]}
                    >
                      {content.footerMessage}
                    </Text>
                  </View>
                ),
                { editable: true }
              )
            ) : null}

            {/* QR Code */}
            {content.showQrCode && content.qrCodeData ? (
              renderCanvaBox(
                'qr_code',
                'QR Code & Caption',
                <View style={styles.paperQrContainer}>
                  <View style={styles.paperQrMockBox}>
                    <QrCode size={52} color="#0F172A" />
                  </View>
                  {inlineEditingId === 'qr_code' ? (
                    <View style={styles.canvaInlineInputRow}>
                      <TextInput
                        style={[
                          styles.canvaInlineInput,
                          {
                            fontSize: fontSize - 2,
                            fontWeight: '700',
                            textAlign: 'center',
                            fontFamily: paperFontFamily,
                          },
                        ]}
                        value={content.qrCodeLabel || ''}
                        placeholder="QR caption..."
                        onChangeText={(t) => updateContent((c) => ({ ...c, qrCodeLabel: t }))}
                        autoFocus
                        selectTextOnFocus
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          setInlineEditingId(null);
                          Keyboard.dismiss();
                        }}
                      />
                      <TouchableOpacity
                        style={styles.canvaInlineDoneBtn}
                        onPress={() => { setInlineEditingId(null); Keyboard.dismiss(); }}
                      >
                        <Check size={12} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : content.qrCodeLabel ? (
                    <Text style={[styles.paperText, { fontSize: fontSize - 2, fontWeight: '700', textAlign: 'center' }]}>
                      {content.qrCodeLabel}
                    </Text>
                  ) : null}
                </View>,
                { editable: true }
              )
            ) : null}
          </View>

          {/* Bottom Zig-Zag Tear Edge */}
          <View style={styles.zigzagEdgeBottom}>
            {Array.from({ length: is58mm ? 18 : 26 }).map((_, i) => (
              <View key={i} style={styles.zigzagToothBottom} />
            ))}
          </View>
        </View>

        {/* Canva "+ Add / Restore Elements" Drawer Shelf */}
        {renderAddElementsShelf()}

        {/* Hardware & Formatting Customization Tools */}
        {renderPreviewCustomizationTools()}
      </View>
    );
  };


  // -------------------------------------------------------------
  // TEMPLATES LIST VIEW (Cards Grid / List)
  // -------------------------------------------------------------
  const renderTemplatesListView = () => {
    return (
      <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
        {/* Header Bar */}
        <View style={styles.topHeader}>
          <View style={styles.topHeaderLeft}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
              <ArrowLeft size={18} color="#11181C" />
            </TouchableOpacity>
            <View>
              <View style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <Text style={styles.headerTitle}>Receipt Templates</Text>
                <View style={styles.badgePro}>
                  <Sparkles size={11} color="#FF5C39" />
                  <Text style={styles.badgeProText}>{templates.length} TEMPLATES</Text>
                </View>
              </View>
              {/* <Text style={styles.headerSubtitle}>
                Select an active print layout or tap any card to customize
              </Text> */}
            </View>
          </View>

          <View style={styles.topHeaderRight}>
            <TouchableOpacity onPress={() => setShowResetConfirm(true)} style={styles.resetHeaderBtn} activeOpacity={0.7}>
              <RotateCcw size={13} color="#64748B" />
              <Text style={styles.resetHeaderBtnText}>Reset</Text>
            </TouchableOpacity>
            {/* <TouchableOpacity onPress={() => setShowNewModal(true)} style={styles.newTemplateHeaderBtn} activeOpacity={0.8}>
              <Plus size={14} color="#FFFFFF" />
              <Text style={styles.newTemplateHeaderBtnText}>New Template</Text>
            </TouchableOpacity> */}
          </View>
        </View>

        <ScrollView
          style={styles.templatesListScroll}
          contentContainerStyle={styles.templatesListScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Active Template Notice Banner */}
          <View style={styles.activeTemplateBanner}>
            <View style={styles.activeTemplateBannerLeft}>
              <View style={styles.activePulseDot} />
              <Text style={styles.activeTemplateBannerLabel}>Active:</Text>
              <Text style={styles.activeTemplateBannerName}>
                {templates.find((t) => t.id === activeTemplateId)?.name || currentTemplate.name}
              </Text>
            </View>
            <View style={styles.activeTemplateBannerTag}>
              <Text style={styles.activeTemplateBannerTagText}>
                {templates.find((t) => t.id === activeTemplateId)?.layout.paperWidth || '80mm'} Roll
              </Text>
            </View>
          </View>

          {/* Cards List */}
          <View style={styles.cardsListContainer}>
            {templates.map((tpl) => {
              const isActive = activeTemplateId === tpl.id;
              const is58mm = tpl.layout.paperWidth === '58mm';
              const isPrintingThis = testPrintingId === tpl.id;

              return (
                <TouchableOpacity
                  key={tpl.id}
                  style={[
                    styles.templateCard,
                    isActive && styles.templateCardActive,
                  ]}
                  onPress={() => handleOpenEditor(tpl)}
                  activeOpacity={0.92}
                >
                  {/* Card Top Row: Icon, Titles & Badges */}
                  <View style={styles.cardTopRow}>
                    {/* <View style={[styles.cardIconBox, isActive && styles.cardIconBoxActive]}>
                      <Receipt size={20} color={isActive ? '#10B981' : '#FF5C39'} />
                    </View> */}

                    <View style={{ flex: 1, paddingHorizontal: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.cardName}>{tpl.name}</Text>
                        {isActive && (
                          <View style={styles.cardActivePill}>
                            <Check size={10} color="#065F46" />
                            <Text style={styles.cardActivePillText}>ACTIVE</Text>
                          </View>
                        )}
                      </View>
                      {/* <Text style={styles.cardDesc} numberOfLines={2}>
                        {tpl.description || 'Thermal receipt print configuration'}
                      </Text> */}
                    </View>

                    <View style={[styles.cardRollBadge, is58mm && styles.cardRollBadge58mm]}>
                      <Text style={styles.cardRollBadgeText}>{tpl.layout.paperWidth}</Text>
                    </View>
                  </View>

                  {/* Feature Chips */}
                  <View style={styles.cardChipsRow}>
                    <View style={styles.cardChip}>
                      <Text style={styles.cardChipText}>{tpl.layout.paperWidth} Roll</Text>
                    </View>
                    <View style={styles.cardChip}>
                      <Text style={styles.cardChipText}>
                        {tpl.layout.fontFamily === 'fontA' ? 'Font A' : 'Font B'}
                      </Text>
                    </View>
                    {/* <View style={styles.cardChip}>
                      <Text style={styles.cardChipText}>{tpl.layout.lineSpacing} Spacing</Text>
                    </View> */}
                    {/* {tpl.content.showLogo && (
                      <View style={styles.cardChip}>
                        <Text style={styles.cardChipText}>Logo</Text>
                      </View>
                    )} */}
                    {/* {tpl.content.showQrCode && (
                      <View style={styles.cardChip}>
                        <Text style={styles.cardChipText}>QR Code</Text>
                      </View>
                    )} */}
                    {/* {tpl.content.showTaxId && (
                      <View style={styles.cardChip}>
                        <Text style={styles.cardChipText}>VAT ID</Text>
                      </View>
                    )} */}
                  </View>

                  <View style={styles.cardDivider} />

                  {/* Card Interactive Actions Row */}
                  <View style={styles.cardBottomRow}>
                    {/* Active Template Button */}
                    {isActive ? (
                      <View style={styles.cardActiveButton}>
                        <Check size={13} color="#10B981" />
                        <Text style={styles.cardActiveButtonText}>Active</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.cardActivateButton}
                        onPress={(e) => handleActivateTemplate(tpl, e)}
                        activeOpacity={0.7}
                      >
                        <Check size={13} color="#475569" />
                        <Text style={styles.cardActivateButtonText}>Set as Active</Text>
                      </TouchableOpacity>
                    )}

                    {/* Test Print Button */}
                    <TouchableOpacity
                      style={styles.cardTestPrintButton}
                      onPress={(e) => handleCardTestPrint(tpl, e)}
                      disabled={isPrintingThis}
                      activeOpacity={0.7}
                    >
                      {isPrintingThis ? (
                        <ActivityIndicator size="small" color="#0F172A" />
                      ) : (
                        <>
                          <Printer size={13} color="#0F172A" />
                          <Text style={styles.cardTestPrintButtonText}>Test Print</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Customize / Edit Button */}
                    <TouchableOpacity
                      style={styles.cardCustomizeButton}
                      onPress={() => handleOpenEditor(tpl)}
                      activeOpacity={0.8}
                    >
                      <Sliders size={13} color="#FFFFFF" />
                      <Text style={styles.cardCustomizeButtonText}>Customize</Text>
                      <ChevronRight size={13} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Actions: Duplicate & Delete */}
                    <View style={styles.cardActionsGroup}>
                      <TouchableOpacity
                        style={styles.cardActionIcon}
                        onPress={(e) => handleDuplicateTemplateItem(tpl, e)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Copy size={13} color="#64748B" />
                      </TouchableOpacity>

                      {!tpl.isDefault && (
                        <TouchableOpacity
                          style={styles.cardActionIcon}
                          onPress={(e) => {
                            if (e && e.stopPropagation) e.stopPropagation();
                            setTargetDeleteTemplate(tpl);
                            setShowDeleteConfirm(true);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={13} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Below: Prominent Add New Template Button Card */}
            <TouchableOpacity
              style={styles.addNewTemplateCard}
              onPress={() => setShowNewModal(true)}
              activeOpacity={0.8}
            >
              <View style={styles.addNewCircle}>
                <Plus size={20} color="#FF5C39" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addNewCardTitle}>+ Create New Template</Text>
                <Text style={styles.addNewCardSubtitle}>
                  Design a custom receipt layout
                </Text>
              </View>
              <ChevronRight size={18} color="#FF5C39" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#FF5C39" />
          <Text style={styles.loadingText}>Loading Receipt Customization...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {screenMode === 'templates_list' ? (
          renderTemplatesListView()
        ) : (
          <>
            {/* Enhanced Modern Editor Header */}
            <View style={styles.enhancedEditorHeader}>
              {/* Row 1: Top Navigation & Action Controls */}
              <View style={styles.editorNavRow}>
                <TouchableOpacity
                  onPress={() => setScreenMode('templates_list')}
                  style={styles.editorBackBtn}
                  activeOpacity={0.7}
                >
                  <ArrowLeft size={16} color="#0F172A" />
                  <Text style={styles.editorBackText}>Templates</Text>
                </TouchableOpacity>

                <View style={styles.editorActionsGroup}>
                  {/* {activeTemplateId !== currentTemplate.id && (
                    <TouchableOpacity
                      style={styles.editorSetActiveBtn}
                      onPress={() => handleActivateTemplate(currentTemplate)}
                      activeOpacity={0.8}
                    >
                      <Check size={13} color="#059669" />
                      <Text style={styles.editorSetActiveText}>Set Active</Text>
                    </TouchableOpacity>
                  )} */}

                  <TouchableOpacity
                    style={styles.editorTestPrintBtn}
                    onPress={handleTestPrint}
                    disabled={testPrinting}
                    activeOpacity={0.8}
                  >
                    {testPrinting ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                      <>
                        <Printer size={13} color="#0F172A" />
                        <Text style={styles.editorTestPrintText}>Test Print</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.editorSaveBtn}
                    onPress={handleSaveTemplate}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Save size={14} color="#FFFFFF" />
                        <Text style={styles.editorSaveText}>Save</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Row 2: Template Name, Active Status & Hardware Specs */}
              <View style={styles.editorMetaBar}>
                <View style={styles.editorTitleRow}>
                  <Text style={styles.editorMainTitle} numberOfLines={1}>
                    {currentTemplate.name}
                  </Text>
                  {activeTemplateId === currentTemplate.id ? (
                    <View style={styles.editorActivePill}>
                      <View style={styles.editorActivePulse} />
                      <Text style={styles.editorActivePillText}>ACTIVE TEMPLATE</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.editorInactivePill}
                      onPress={() => handleActivateTemplate(currentTemplate)}
                      activeOpacity={0.7}
                    >
                      <Check size={11} color="#64748B" style={{ marginRight: 3 }} />
                      <Text style={styles.editorInactivePillText}>SET ACTIVE GLOBALLY</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Top Hardware Customization Dropdowns */}
                <View style={styles.topHardwareRow}>
                  {/* Dropdown 1: Paper Roll Width */}
                  <View style={styles.topDropdownAnchor}>
                    <TouchableOpacity
                      style={[
                        styles.topDropdownBtn,
                        openDropdownId === 'top_paper_width' && styles.topDropdownBtnOpen,
                      ]}
                      onPress={() => setOpenDropdownId(openDropdownId === 'top_paper_width' ? null : 'top_paper_width')}
                      activeOpacity={0.75}
                    >
                      <Receipt size={12} color={openDropdownId === 'top_paper_width' ? '#FF5C39' : '#0F172A'} />
                      <Text style={styles.topDropdownBtnLabel}>Roll:</Text>
                      <Text style={styles.topDropdownBtnValue}>
                        {currentTemplate.layout.paperWidth}
                      </Text>
                      <ChevronDown
                        size={12}
                        color={openDropdownId === 'top_paper_width' ? '#FF5C39' : '#64748B'}
                        style={{ transform: [{ rotate: openDropdownId === 'top_paper_width' ? '180deg' : '0deg' }] }}
                      />
                    </TouchableOpacity>

                    {openDropdownId === 'top_paper_width' && (
                      <View style={styles.topFloatingMenu}>
                        <TouchableOpacity
                          style={[
                            styles.topFloatingMenuItem,
                            currentTemplate.layout.paperWidth === '80mm' && styles.topFloatingMenuItemActive,
                          ]}
                          onPress={() => handleTopHardwareChange({ paperWidth: '80mm' }, 'Paper Roll 80mm')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.topFloatingMenuLabel,
                                currentTemplate.layout.paperWidth === '80mm' && styles.topFloatingMenuLabelActive,
                              ]}
                            >
                              80mm (Standard)
                            </Text>
                            <Text style={styles.topFloatingMenuSub}>48 cols • Standard roll</Text>
                          </View>
                          {currentTemplate.layout.paperWidth === '80mm' && <Check size={13} color="#FF5C39" />}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.topFloatingMenuItem,
                            currentTemplate.layout.paperWidth === '58mm' && styles.topFloatingMenuItemActive,
                          ]}
                          onPress={() => handleTopHardwareChange({ paperWidth: '58mm' }, 'Paper Roll 58mm')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.topFloatingMenuLabel,
                                currentTemplate.layout.paperWidth === '58mm' && styles.topFloatingMenuLabelActive,
                              ]}
                            >
                              58mm (Compact)
                            </Text>
                            <Text style={styles.topFloatingMenuSub}>32 cols • Handheld / Mobile</Text>
                          </View>
                          {currentTemplate.layout.paperWidth === '58mm' && <Check size={13} color="#FF5C39" />}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Dropdown 2: Hardware Font Pitch / Family */}
                  <View style={styles.topDropdownAnchor}>
                    <TouchableOpacity
                      style={[
                        styles.topDropdownBtn,
                        openDropdownId === 'top_font_family' && styles.topDropdownBtnOpen,
                      ]}
                      onPress={() => setOpenDropdownId(openDropdownId === 'top_font_family' ? null : 'top_font_family')}
                      activeOpacity={0.75}
                    >
                      <Type size={12} color={openDropdownId === 'top_font_family' ? '#FF5C39' : '#0F172A'} />
                      <Text style={styles.topDropdownBtnLabel}>Font:</Text>
                      <Text style={styles.topDropdownBtnValue}>
                        {currentTemplate.layout.fontFamily === 'fontB' ? 'Font B' : 'Font A'}
                      </Text>
                      <ChevronDown
                        size={12}
                        color={openDropdownId === 'top_font_family' ? '#FF5C39' : '#64748B'}
                        style={{ transform: [{ rotate: openDropdownId === 'top_font_family' ? '180deg' : '0deg' }] }}
                      />
                    </TouchableOpacity>

                    {openDropdownId === 'top_font_family' && (
                      <View style={[styles.topFloatingMenu, { minWidth: 200 }]}>
                        <TouchableOpacity
                          style={[
                            styles.topFloatingMenuItem,
                            currentTemplate.layout.fontFamily === 'fontA' && styles.topFloatingMenuItemActive,
                          ]}
                          onPress={() => handleTopHardwareChange({ fontFamily: 'fontA' }, 'Font A')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.topFloatingMenuLabel,
                                currentTemplate.layout.fontFamily === 'fontA' && styles.topFloatingMenuLabelActive,
                              ]}
                            >
                              Font A (Standard)
                            </Text>
                            <Text style={styles.topFloatingMenuSub}>12×24 • 48 chars/line</Text>
                          </View>
                          {currentTemplate.layout.fontFamily === 'fontA' && <Check size={13} color="#FF5C39" />}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.topFloatingMenuItem,
                            currentTemplate.layout.fontFamily === 'fontB' && styles.topFloatingMenuItemActive,
                          ]}
                          onPress={() => handleTopHardwareChange({ fontFamily: 'fontB' }, 'Font B')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.topFloatingMenuLabel,
                                currentTemplate.layout.fontFamily === 'fontB' && styles.topFloatingMenuLabelActive,
                              ]}
                            >
                              Font B (Condensed)
                            </Text>
                            <Text style={styles.topFloatingMenuSub}>9×17 • Dense columns</Text>
                          </View>
                          {currentTemplate.layout.fontFamily === 'fontB' && <Check size={13} color="#FF5C39" />}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* Canva Live Editor badge */}
                  {/* <View style={styles.editorMetaChipAccent}>
                    <Palette size={11} color="#FF5C39" />
                    <Text style={styles.editorMetaChipAccentText}>Canva Live Editor</Text>
                  </View> */}
                </View>
              </View>
            </View>

            {/* Main Body: Unified Full-Width Live Editor & Preview */}
            <View style={styles.mainLayoutWrapper}>
              <View style={styles.previewColumn}>

                <ScrollView
                  style={styles.previewScrollArea}
                  contentContainerStyle={styles.previewScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  automaticallyAdjustKeyboardInsets={true}
                  onScrollBeginDrag={() => setOpenDropdownId(null)}
                >
                  {renderLiveReceiptPreview()}
                </ScrollView>
              </View>
            </View>

          </>
        )}

        {/* New Template Modal */}
        {showNewModal && (
          <View style={styles.simpleModalBackdrop}>
            <View style={styles.simpleModalContent}>
              <Text style={styles.simpleModalTitle}>New Receipt Template</Text>
              <Text style={styles.simpleModalSubtitle}>
                Create a dedicated template for lunch, event, or express takeaway
              </Text>
              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                placeholder="e.g. Weekend Event Template"
                value={newTemplateName}
                onChangeText={setNewTemplateName}
                autoFocus
                placeholderTextColor={'#2d2e30ff'}
              />
              <View style={styles.simpleModalBtnRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowNewModal(false)}>
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleCreateNewTemplate}>
                  <Text style={styles.modalConfirmBtnText}>Create & Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          visible={showDeleteConfirm}
          title="Delete Template"
          message={`Are you sure you want to delete '${(targetDeleteTemplate || currentTemplate).name}'? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          isDestructive={true}
          onConfirm={handleDeleteTemplate}
          onClose={() => {
            setShowDeleteConfirm(false);
            setTargetDeleteTemplate(null);
          }}
        />

        {/* Reset Defaults Confirmation Modal */}
        <ConfirmModal
          visible={showResetConfirm}
          title="Reset All Templates"
          message="Are you sure you want to reset all receipt templates to system factory defaults? Any custom templates will be replaced."
          confirmText="Reset to Defaults"
          cancelText="Keep Current"
          isDestructive={true}
          onConfirm={handleResetDefaults}
          onClose={() => setShowResetConfirm(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#64748B', fontWeight: '600' },

  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  topHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  backBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  badgePro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF1EE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeProText: { fontSize: 10, fontWeight: '800', color: '#FF5C39' },
  headerSubtitle: { fontSize: 11, color: '#64748B', marginTop: 1 },

  topHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  testPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  testPrintBtnText: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FF5C39',
  },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  templatesBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  templatesBarTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  templatesBarTitle: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  templateActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tmplActionSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 },
  tmplActionSmallText: { fontSize: 11, fontWeight: '700', color: '#FF5C39' },

  templatesChipsList: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  templateChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  templateChipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  templateChipTextActive: { color: '#FFFFFF' },
  widthBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  widthBadgeText: { fontSize: 9, fontWeight: '800', color: '#475569' },

  mobileViewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 3,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    gap: 4,
  },
  mobileModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 6,
  },
  mobileModeBtnActive: { backgroundColor: '#FF5C39' },
  mobileModeBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  mobileModeBtnTextActive: { color: '#FFFFFF' },

  mainLayoutWrapper: { flex: 1, flexDirection: 'row' },
  controlsColumn: { flex: 1 },
  controlsColumnTablet: { flex: 1.15, borderRightWidth: 1, borderRightColor: '#E2E8F0' },

  categoryTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  catTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  catTabActive: {
    borderBottomColor: '#FF5C39',
  },
  catTabText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  catTabTextActive: { color: '#FF5C39', fontWeight: '800' },

  controlsScrollBody: { flex: 1, padding: 16 },
  controlsScrollContent: { paddingBottom: 260 },
  tabContent: { gap: 14, paddingBottom: 240 },

  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionHeading: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  sectionSubtitle: { fontSize: 11.5, color: '#64748B', marginBottom: 12 },
  subGroupLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },

  pillSelectorRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pillOption: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillOptionActive: {
    backgroundColor: '#FF5C39',
    borderColor: '#FF5C39',
  },
  pillOptionText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  pillOptionTextActive: { color: '#FFFFFF' },

  alignGroup: { marginBottom: 12 },
  alignGroupLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  alignButtonsRow: { flexDirection: 'row', gap: 8 },
  alignBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alignBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  alignBtnText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  alignBtnTextActive: { color: '#FFFFFF' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  toggleTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  toggleSubtitle: { fontSize: 11, color: '#64748B', marginTop: 1 },

  inputBlock: { marginTop: 8 },
  inputLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 4 },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  uploadLogoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#FFF1EE',
    borderWidth: 1,
    borderColor: '#FFD9D0',
  },
  uploadLogoBtnText: { fontSize: 12, fontWeight: '700', color: '#FF5C39' },
  pickedLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  logoThumb: { width: 34, height: 34, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  logoUrlText: { flex: 1, fontSize: 11, color: '#64748B' },

  // Preview Column
  previewColumn: { flex: 1, backgroundColor: '#F1F5F9' },
  previewColumnTablet: { flex: 0.95 },
  previewHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  previewHeaderTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#10B981' },
  liveTagText: { fontSize: 9.5, fontWeight: '800', color: '#065F46' },

  previewScrollArea: { flex: 1, padding: 16 },
  previewScrollContent: { paddingBottom: 260 },
  previewCardContainer: { alignItems: 'center', paddingBottom: 260 },

  sampleOrderSwitchRow: {
    width: '100%',
    maxWidth: 360,
    marginBottom: 12,
  },
  sampleOrderLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  sampleOrderChips: { flexDirection: 'row', gap: 6 },
  sampleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sampleChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  sampleChipText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },
  sampleChipTextActive: { color: '#FFFFFF' },

  // Thermal Paper Simulation
  paperOuterShadow: {
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  paperOuterShadow58mm: {
    maxWidth: 270,
  },
  zigzagEdgeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
    height: 6,
    backgroundColor: 'transparent',
  },
  zigzagToothTop: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFDF9',
  },
  zigzagEdgeBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    overflow: 'hidden',
    height: 6,
    backgroundColor: 'transparent',
  },
  zigzagToothBottom: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFDF9',
  },
  thermalPaper: {
    backgroundColor: '#FFFDF9', // Creamy warm thermal paper color
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  thermalPaper58mm: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  paperLogo: { width: 70, height: 50, marginBottom: 6 },
  paperText: {
    color: '#000000',
    letterSpacing: -0.2,
  },
  paperDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  paperDividerThin: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    marginVertical: 4,
  },
  paperDoubleDivider: {
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    marginVertical: 6,
  },
  paperOrderBanner: {
    backgroundColor: '#000000',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginVertical: 4,
    alignItems: 'center',
  },
  paperOrderBannerText: {
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  paperItemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paperColHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: '#000000',
  },
  paperItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paperItemNote: {
    fontSize: 10,
    color: '#475569',
    paddingLeft: 34,
  },
  paperSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  paperTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paperTotalText: {
    fontWeight: '900',
    color: '#000000',
  },
  paperQrContainer: {
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  paperQrMockBox: {
    padding: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 4,
  },

  // Simple modal
  simpleModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 999,
  },
  simpleModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  simpleModalTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  simpleModalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  simpleModalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalCancelBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#F1F5F9' },
  modalCancelBtnText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  modalConfirmBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#FF5C39' },
  modalConfirmBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  // CANVA VISUAL EDITOR STYLES
  canvaBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  canvaBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  canvaModePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#DBEAFE',
  },
  canvaModePillActive: {
    backgroundColor: '#2563EB',
  },
  canvaModePillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E40AF',
  },
  canvaModePillTextActive: {
    color: '#FFFFFF',
  },

  // Floating Canva Toolbar
  canvaToolbarContainer: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  canvaToolbarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 6,
    marginBottom: 8,
  },
  canvaToolbarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  canvaToolbarBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#38BDF8',
  },
  canvaToolbarTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  canvaToolbarCloseBtn: {
    padding: 2,
  },
  canvaToolbarActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  canvaToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  canvaToolBtnActive: {
    backgroundColor: '#FF5C39',
  },
  canvaToolBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  canvaToolBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  canvaToolBtnTextActive: {
    color: '#FFFFFF',
  },
  canvaBackendLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  canvaBackendLockText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FBBF24',
  },
  canvaToolSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 6,
    padding: 2,
  },
  canvaToolSegmentBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  canvaToolSegmentBtnActive: {
    backgroundColor: '#FF5C39',
  },

  // Canva Box & Handles
  canvaBoxBase: {
    position: 'relative',
    marginVertical: 1.5,
    padding: 2,
    borderRadius: 4,
  },
  canvaBoxIdle: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  canvaBoxSelected: {
    borderWidth: 2,
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.04)',
  },
  canvaPillTag: {
    position: 'absolute',
    top: -11,
    left: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
    elevation: 3,
  },
  canvaPillTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  canvaPillEditAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  canvaPillEditText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  canvaAnchorHandle: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    zIndex: 12,
  },
  canvaAnchorTL: { top: -4, left: -4 },
  canvaAnchorTR: { top: -4, right: -4 },
  canvaAnchorBL: { bottom: -4, left: -4 },
  canvaAnchorBR: { bottom: -4, right: -4 },

  // Inline Direct Inputs on Paper
  canvaInlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: '100%',
  },
  canvaInlineInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    color: '#000000',
  },
  canvaInlineDoneBtn: {
    backgroundColor: '#10B981',
    padding: 5,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paperLogoPlaceholder: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  paperLogoPlaceholderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },

  // Add / Restore Elements Shelf
  addShelfContainer: {
    width: '100%',
    maxWidth: 360,
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  addShelfHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  addShelfTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  addShelfCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  addShelfSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
  },
  addShelfChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  addShelfChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addShelfChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  addShelfEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  addShelfEmptyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },


  controlsHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  controlsHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  controlsHeaderSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  previewTipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  previewTipIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewTipTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#9A3412',
    marginBottom: 2,
  },
  previewTipSubtitle: {
    fontSize: 11,
    color: '#7C2D12',
    lineHeight: 15,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 8,
  },


  // TEMPLATE CARDS LIST STYLES
  templatesListScroll: { flex: 1 },
  templatesListScrollContent: { padding: 16, paddingBottom: 60 },
  resetHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  resetHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  newTemplateHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FF5C39',
  },
  newTemplateHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  activeTemplateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  activeTemplateBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  activePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  activeTemplateBannerLabel: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
  },
  activeTemplateBannerName: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '800',
  },
  activeTemplateBannerTag: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeTemplateBannerTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },

  cardsListContainer: {
    gap: 14,
  },
  templateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  templateCardActive: {
    borderColor: '#10B981',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFF1EE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIconBoxActive: {
    backgroundColor: '#ECFDF5',
  },
  cardName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cardActivePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
  },
  cardDesc: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cardRollBadge: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardRollBadge58mm: {
    backgroundColor: '#3B82F6',
  },
  cardRollBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  cardChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  cardChip: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },

  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  cardActiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardActiveButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  cardActivateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardActivateButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  cardTestPrintButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardTestPrintButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardCustomizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF5C39',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  cardCustomizeButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cardActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  cardActionIcon: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  // Below: Add New Card
  addNewTemplateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#FFD7CE',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
  },
  addNewCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF1EE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addNewCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FF5C39',
  },
  addNewCardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },

  // Enhanced Editor Header Styles
  enhancedEditorHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    zIndex: 100,
  },
  editorNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  editorBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  editorBackText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  editorActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editorSetActiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  editorSetActiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  editorTestPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editorTestPrintText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  editorSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7.5,
    borderRadius: 8,
    backgroundColor: '#FF5C39',
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  editorSaveText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  editorMetaBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },
  editorTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  editorMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  editorActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 20,
  },
  editorActivePulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  editorActivePillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  editorInactivePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 20,
  },
  editorInactivePillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  editorBadgesStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  topHardwareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    zIndex: 100,
  },
  topDropdownAnchor: {
    position: 'relative',
    zIndex: 100,
  },
  topDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  topDropdownBtnOpen: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF7F5',
  },
  topDropdownBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  topDropdownBtnValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  topFloatingMenu: {
    position: 'absolute',
    top: 34,
    left: 0,
    minWidth: 185,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 25,
    zIndex: 9999,
  },
  topFloatingMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F1F5F9',
  },
  topFloatingMenuItemActive: {
    backgroundColor: '#FFF1EE',
  },
  topFloatingMenuLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  topFloatingMenuLabelActive: {
    color: '#FF5C39',
    fontWeight: '800',
  },
  topFloatingMenuSub: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },
  editorMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  editorMetaChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  editorMetaChipAccent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF1EE',
    borderWidth: 1,
    borderColor: '#FFD7CE',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  editorMetaChipAccentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF5C39',
  },

  // Preview Tab Customization Tools Styles
  previewToolsCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  previewToolsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  previewToolsIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFF1EE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewToolsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  previewToolsSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveSyncDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10B981',
  },
  liveSyncText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
  },
  previewToolsBody: {
    padding: 14,
    gap: 12,
  },
  previewToolGroup: {
    gap: 10,
  },
  previewToolGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  previewToolGroupTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewToolsGroupDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  toolDropdownFieldWrapper: {
    gap: 4,
  },
  toolDropdownLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  toolDropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  toolDropdownSelectorOpen: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF7F5',
  },
  toolDropdownSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  toolDropdownSelectorText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  toolDropdownMenu: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    marginTop: 4,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  toolDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F1F5F9',
  },
  toolDropdownItemSelected: {
    backgroundColor: '#FFF1EE',
  },
  toolDropdownItemLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  toolDropdownItemLabelSelected: {
    color: '#FF5C39',
    fontWeight: '800',
  },
  toolDropdownItemDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

});
