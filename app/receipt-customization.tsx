/**
 * Receipt design
 *
 *  List  → pick which template prints, or open one to edit.
 *  Editor → plain-language sections on the left, an exact print preview on the right
 *           (tablets) or behind an "Edit / Preview" switch (phones).
 *
 * Paper width is a printer setting (Printer screen); every template prints at that width.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  BackHandler,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  Receipt,
  Check,
  Plus,
  Pencil,
  Printer,
  MoreHorizontal,
  Store,
  ClipboardList,
  ShoppingBasket,
  MessageSquareText,
  Type,
  Image as ImageIcon,
  RotateCcw,
  Ruler,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReceiptPreview } from '../components/receipt/ReceiptPreview';
import {
  FormFrame,
  FormSection,
  Field,
  ToggleRow,
  Segmented,
  Notice,
  PrimaryButton,
  HeaderPillButton,
  LoadingState,
  SaveBar,
  SAVE_BAR_SPACE,
  formStyles,
} from '../components/settings/FormKit';
import {
  ReceiptTemplate,
  ReceiptContentConfig,
  ReceiptLayoutConfig,
  DEFAULT_RECEIPT_TEMPLATE,
  PaperWidth,
  TextAlignment,
  cloneTemplate,
  getAllReceiptTemplates,
  getActiveReceiptTemplate,
  saveReceiptTemplate,
  deleteReceiptTemplate,
  setActiveReceiptTemplateId,
  resetToDefaultTemplate,
  getSampleOrderForPreview,
  setCachedStoreProfile,
  formatRestaurantAddress,
} from '../services/receipt-customization.service';
import { printTestReceiptTemplate, getLastPrintJobReport } from '../services/thermal-print.service';
import { getPosPrinterConfig } from '../services/pos-config.service';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';

const SPLIT_BREAKPOINT = 900;

type SampleType = 'delivery' | 'pickup' | 'dine_in';
type StoreProfile = { name: string; phone: string; address: string };

const ALIGN_OPTIONS: { value: TextAlignment; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

export default function ReceiptCustomizationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isSplit = width >= SPLIT_BREAKPOINT;
  const gutter = width >= 768 ? 24 : 16;
  const { restaurantId } = useLocalSearchParams<{ restaurantId?: string }>();

  // Data
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);
  const [activeId, setActiveId] = useState<string>(DEFAULT_RECEIPT_TEMPLATE.id);
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('80mm');
  const [store, setStore] = useState<StoreProfile>({ name: '', phone: '', address: '' });

  // Editor
  const [mode, setMode] = useState<'list' | 'editor'>('list');
  const [draft, setDraft] = useState<ReceiptTemplate>(cloneTemplate(DEFAULT_RECEIPT_TEMPLATE));
  const [snapshot, setSnapshot] = useState('');
  const [saving, setSaving] = useState(false);
  const [phoneTab, setPhoneTab] = useState<'edit' | 'preview'>('edit');
  const [sampleType, setSampleType] = useState<SampleType>('delivery');
  const [sampleScheduled, setSampleScheduled] = useState(false);

  // Actions
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReceiptTemplate | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);

  const dirty = mode === 'editor' && snapshot !== '' && JSON.stringify(draft) !== snapshot;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  /* ── Loading ─────────────────────────────────────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, active, cfg] = await Promise.all([
        getAllReceiptTemplates(restaurantId),
        getActiveReceiptTemplate(restaurantId),
        getPosPrinterConfig(restaurantId),
      ]);
      setPaperWidth(cfg.paperWidth || '80mm');
      setTemplates(all);
      setActiveId(active.id);
    } catch {
      showToast({ title: 'Couldn’t load templates', message: 'Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }

    // Store details for the preview (name / address / phone come from the store profile)
    try {
      let profile: StoreProfile | null = null;
      if (restaurantId) {
        const res = await restaurantService.getRestaurantById(restaurantId);
        if (res?.success && res.data?.restaurantName) {
          profile = { name: res.data.restaurantName, phone: res.data.phoneNumber || '', address: formatRestaurantAddress(res.data.address) };
        }
      }
      if (!profile) {
        const res = await restaurantOwnerService.getRestaurantProfile();
        if (res?.success && res.data?.restaurantName) {
          profile = { name: res.data.restaurantName, phone: res.data.phoneNumber || '', address: formatRestaurantAddress(res.data.address) };
        }
      }
      if (profile) {
        setStore(profile);
        setCachedStoreProfile({ restaurantName: profile.name, phoneNumber: profile.phone, address: profile.address });
      }
    } catch {
      // Preview falls back to sample store details
    }
  }, [restaurantId, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  /* ── Sample order for the preview ────────────────────────────────────── */

  const sampleOrder = useMemo(() => {
    const order = getSampleOrderForPreview(sampleType, store.name || undefined, sampleScheduled);
    if (store.name) {
      order.restaurantId = {
        ...order.restaurantId,
        restaurantName: store.name,
        phoneNumber: store.phone || order.restaurantId?.phoneNumber,
        address: store.address || order.restaurantId?.address,
        formattedAddress: store.address || order.restaurantId?.formattedAddress,
      };
      order.restaurantName = store.name;
      order.restaurantAddress = store.address || order.restaurantAddress;
    }
    return order;
  }, [sampleType, sampleScheduled, store]);

  /* ── Editing helpers ─────────────────────────────────────────────────── */

  const setContent = <K extends keyof ReceiptContentConfig>(key: K, value: ReceiptContentConfig[K]) =>
    setDraft((d) => ({ ...d, content: { ...d.content, [key]: value } }));
  const setLayout = <K extends keyof ReceiptLayoutConfig>(key: K, value: ReceiptLayoutConfig[K]) =>
    setDraft((d) => ({ ...d, layout: { ...d.layout, [key]: value } }));
  const setBold = (key: keyof ReceiptLayoutConfig['boldElements'], value: boolean) =>
    setDraft((d) => ({ ...d, layout: { ...d.layout, boldElements: { ...d.layout.boldElements, [key]: value } } }));
  const setItalic = (key: keyof ReceiptLayoutConfig['italicElements'], value: boolean) =>
    setDraft((d) => ({ ...d, layout: { ...d.layout, italicElements: { ...d.layout.italicElements, [key]: value } } }));
  const setAlign = (key: keyof ReceiptLayoutConfig['alignment'], value: TextAlignment) =>
    setDraft((d) => ({ ...d, layout: { ...d.layout, alignment: { ...d.layout.alignment, [key]: value } } }));

  const openEditor = (tpl: ReceiptTemplate) => {
    const copy = cloneTemplate(tpl);
    copy.layout.paperWidth = paperWidth;
    setDraft(copy);
    setSnapshot(JSON.stringify(copy));
    setPhoneTab('edit');
    setMode('editor');
  };

  const validationError = (): string | null => {
    if (!draft.name.trim()) return 'Give the template a name.';
    if (draft.content.showTaxId && !draft.content.taxIdValue?.trim()) return 'Enter your VAT number, or turn off “VAT number”.';
    if (draft.content.showQrCode && !draft.content.qrCodeData?.trim()) return 'Enter a link for the QR code, or turn the QR code off.';
    return null;
  };

  const save = async (): Promise<boolean> => {
    const error = validationError();
    if (error) {
      showToast({ title: 'Check the template', message: error, type: 'error' });
      return false;
    }
    setSaving(true);
    try {
      const saved = await saveReceiptTemplate({ ...draft, name: draft.name.trim() }, restaurantId, true);
      saved.layout.paperWidth = paperWidth;
      setDraft(saved);
      setSnapshot(JSON.stringify(saved));
      setActiveId(saved.id);
      setTemplates(await getAllReceiptTemplates(restaurantId));
      showToast({ title: 'Template saved', message: `“${saved.name}” is now used for all receipts.`, type: 'success' });
      return true;
    } catch (e: any) {
      showToast({ title: 'Couldn’t save', message: e?.message || 'Please try again.', type: 'error' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    try {
      setDraft(JSON.parse(snapshot));
    } catch {}
  };

  /** Leave the editor, asking first when there are unsaved changes. */
  const leaveEditor = useCallback(
    (then: () => void = () => setMode('list')) => {
      if (!dirtyRef.current) {
        then();
        return;
      }
      Alert.alert('Save your changes?', 'You have unsaved changes to this template.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: then },
        {
          text: 'Save',
          onPress: async () => {
            if (await save()) then();
          },
        },
      ]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, snapshot]
  );

  // Android back button inside the editor returns to the list
  useEffect(() => {
    if (mode !== 'editor') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveEditor();
      return true;
    });
    return () => sub.remove();
  }, [mode, leaveEditor]);

  // Leaving the screen (swipe / header back) with unsaved edits asks first
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove' as any, (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      leaveEditor(() => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, leaveEditor]);

  /* ── Template actions ────────────────────────────────────────────────── */

  const activate = async (tpl: ReceiptTemplate) => {
    try {
      await setActiveReceiptTemplateId(tpl.id, restaurantId);
      setActiveId(tpl.id);
      showToast({ title: 'Template in use', message: `“${tpl.name}” will be used for all receipts.`, type: 'success' });
    } catch (e: any) {
      showToast({ title: 'Couldn’t switch template', message: e?.message || 'Please try again.', type: 'error' });
    }
  };

  const testPrint = async (tpl: ReceiptTemplate) => {
    setPrintingId(tpl.id);
    try {
      const ok = await printTestReceiptTemplate(tpl, restaurantId, store.name || undefined);
      const report = getLastPrintJobReport();
      if (ok) {
        showToast({ title: 'Test receipt printed', message: report?.driverLabel || 'Printed successfully.', type: 'success' });
      } else if (report?.error !== 'Print cancelled.') {
        showToast({
          title: 'Test print failed',
          message: report?.error || 'The printer did not respond.',
          type: 'error',
          action: {
            label: 'Printer settings',
            onPress: () => router.push({ pathname: '/printer-settings', params: restaurantId ? { restaurantId } : {} } as any),
          },
        });
      }
    } finally {
      setPrintingId(null);
    }
  };

  const duplicate = async (tpl: ReceiptTemplate) => {
    const now = new Date().toISOString();
    try {
      await saveReceiptTemplate(
        { ...cloneTemplate(tpl), id: `copy_${Date.now()}`, name: `${tpl.name} (copy)`, isDefault: false, createdAt: now, updatedAt: now },
        restaurantId,
        false
      );
      setTemplates(await getAllReceiptTemplates(restaurantId));
      showToast({ title: 'Template duplicated', message: `Created “${tpl.name} (copy)”.`, type: 'success' });
    } catch (e: any) {
      showToast({ title: 'Couldn’t duplicate', message: e?.message || 'Please try again.', type: 'error' });
    }
  };

  const remove = async (tpl: ReceiptTemplate) => {
    setConfirmDelete(null);
    try {
      await deleteReceiptTemplate(tpl.id, restaurantId);
      const [all, active] = await Promise.all([getAllReceiptTemplates(restaurantId), getActiveReceiptTemplate(restaurantId)]);
      setTemplates(all);
      setActiveId(active.id);
      showToast({ title: 'Template deleted', message: `“${tpl.name}” was removed.`, type: 'info' });
    } catch (e: any) {
      showToast({ title: 'Couldn’t delete', message: e?.message || 'Please try again.', type: 'error' });
    }
  };

  const createTemplate = async () => {
    const name = (newName || '').trim();
    if (!name) return;
    const now = new Date().toISOString();
    const tpl: ReceiptTemplate = {
      ...cloneTemplate(DEFAULT_RECEIPT_TEMPLATE),
      id: `custom_${Date.now()}`,
      name,
      description: 'Custom receipt',
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    setNewName(null);
    try {
      await saveReceiptTemplate(tpl, restaurantId, false);
      setTemplates(await getAllReceiptTemplates(restaurantId));
      openEditor(tpl);
    } catch (e: any) {
      showToast({ title: 'Couldn’t create template', message: e?.message || 'Please try again.', type: 'error' });
    }
  };

  const resetAll = async () => {
    setConfirmReset(false);
    await resetToDefaultTemplate(restaurantId);
    await load();
    showToast({ title: 'Templates reset', message: 'The built-in templates are restored.', type: 'success' });
  };

  const showMore = (tpl: ReceiptTemplate) => {
    Alert.alert(tpl.name, undefined, [
      { text: 'Duplicate', onPress: () => duplicate(tpl) },
      ...(templates.length > 1 ? [{ text: 'Delete', style: 'destructive' as const, onPress: () => setConfirmDelete(tpl) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  /* ── Logo ────────────────────────────────────────────────────────────── */

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ title: 'Photo access needed', message: 'Allow photo access to choose a logo.', type: 'info' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4, // logos print at ≤192 dots wide; keeps templates small enough to store
      base64: true,
    });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.base64) return;
    if (asset.base64.length > 450_000) {
      showToast({ title: 'Logo too large', message: 'Choose a smaller image (under about 300 KB).', type: 'error' });
      return;
    }
    setDraft((d) => ({
      ...d,
      content: { ...d.content, showLogo: true, logoUrl: `data:${asset.mimeType || 'image/png'};base64,${asset.base64}` },
    }));
  };

  /* ── Render: template list ───────────────────────────────────────────── */

  const renderList = () => (
    <ScrollView contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
      <FormFrame>
        <Notice tone="info" icon={Ruler}>
          {`Receipts print on ${paperWidth === '58mm' ? '58 mm (small)' : '80 mm (standard)'} paper. Change the paper size in Printer settings.`}
        </Notice>

        <FormSection
          icon={Receipt}
          title="Your templates"
          description="The template marked “In use” prints on every order."
          right={<HeaderPillButton label="New" icon={Plus} onPress={() => setNewName('')} />}
        >
          {templates.map((tpl, i) => {
            const isActive = tpl.id === activeId;
            return (
              <View key={tpl.id} style={[styles.tplRow, i < templates.length - 1 && styles.tplDivider]}>
                <TouchableOpacity style={styles.tplMain} onPress={() => openEditor(tpl)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Edit ${tpl.name}`}>
                  <View style={[styles.tplIcon, isActive && styles.tplIconActive]}>
                    <Receipt size={18} color={isActive ? '#FFFFFF' : Colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.tplTitleRow}>
                      <Text style={styles.tplName} numberOfLines={1}>
                        {tpl.name}
                      </Text>
                      {isActive ? (
                        <View style={styles.inUse}>
                          <Check size={11} color={Colors.statusApproved.text} strokeWidth={3} />
                          <Text style={styles.inUseText}>In use</Text>
                        </View>
                      ) : null}
                    </View>
                    {tpl.description ? (
                      <Text style={styles.tplDesc} numberOfLines={1}>
                        {tpl.description}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>

                <View style={styles.tplActions}>
                  {!isActive && (
                    <TouchableOpacity style={styles.useBtn} onPress={() => activate(tpl)} accessibilityRole="button" accessibilityLabel={`Use ${tpl.name}`}>
                      <Text style={styles.useBtnText}>Use</Text>
                    </TouchableOpacity>
                  )}
                  <IconButton icon={Pencil} label={`Edit ${tpl.name}`} onPress={() => openEditor(tpl)} />
                  <IconButton icon={Printer} label={`Test print ${tpl.name}`} onPress={() => testPrint(tpl)} busy={printingId === tpl.id} />
                  <IconButton icon={MoreHorizontal} label={`More options for ${tpl.name}`} onPress={() => showMore(tpl)} />
                </View>
              </View>
            );
          })}
        </FormSection>

        <TouchableOpacity style={styles.resetLink} onPress={() => setConfirmReset(true)} accessibilityRole="button">
          <RotateCcw size={14} color={Colors.textMuted} />
          <Text style={styles.resetLinkText}>Reset to the built-in templates</Text>
        </TouchableOpacity>
      </FormFrame>
    </ScrollView>
  );

  /* ── Render: editor form ─────────────────────────────────────────────── */

  const c = draft.content;
  const l = draft.layout;

  const renderForm = () => (
    <>
      <FormSection icon={Pencil} title="Template name">
        <Field label="Name" value={draft.name} onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))} maxLength={40} containerStyle={styles.noMargin} />
      </FormSection>

      <FormSection icon={Store} title="Header" description="Your store details at the top of the receipt.">
        <ToggleRow title="Logo" description="Prints in black & white" value={c.showLogo && !!c.logoUrl} onChange={(v) => (v && !c.logoUrl ? pickLogo() : setContent('showLogo', v))} />
        {c.showLogo && c.logoUrl ? (
          <View style={styles.logoRow}>
            <Image source={{ uri: c.logoUrl }} style={styles.logoThumb} contentFit="contain" />
            <PrimaryButton label="Change" tone="secondary" icon={ImageIcon} onPress={pickLogo} />
            <PrimaryButton label="Remove" tone="danger" onPress={() => setDraft((d) => ({ ...d, content: { ...d.content, showLogo: false, logoUrl: '' } }))} />
          </View>
        ) : null}
        <ToggleRow title="Restaurant name" description={store.name || 'From your store profile'} value={c.showRestaurantName} onChange={(v) => setContent('showRestaurantName', v)} />
        <ToggleRow title="Address" value={c.showAddress} onChange={(v) => setContent('showAddress', v)} />
        <ToggleRow title="Phone number" value={c.showPhone} onChange={(v) => setContent('showPhone', v)} />
        <ToggleRow title="VAT number" value={c.showTaxId} onChange={(v) => setContent('showTaxId', v)} last={!c.showTaxId} />
        {c.showTaxId ? (
          <View style={styles.nested}>
            <Field label="Label" value={c.taxIdLabel} onChangeText={(t) => setContent('taxIdLabel', t)} placeholder="VAT Reg No:" maxLength={20} />
            <Field
              label="VAT number"
              value={c.taxIdValue}
              onChangeText={(t) => setContent('taxIdValue', t)}
              placeholder="e.g. GB 123 4567 89"
              autoCapitalize="characters"
              maxLength={24}
              error={!c.taxIdValue?.trim() ? 'Required while the VAT number is shown.' : undefined}
              containerStyle={styles.noMargin}
            />
          </View>
        ) : null}
        <View style={styles.spaced}>
          <Field label="Title (optional)" value={c.customHeaderTitle || ''} onChangeText={(t) => setContent('customHeaderTitle', t)} placeholder="e.g. TAX INVOICE" maxLength={32} />
          <Field label="Tagline (optional)" value={c.headerMessage} onChangeText={(t) => setContent('headerMessage', t)} placeholder="e.g. Freshly prepared for you" maxLength={60} containerStyle={styles.noMargin} />
        </View>
      </FormSection>

      <FormSection icon={ClipboardList} title="Order details">
        <ToggleRow title="Order number" value={c.showOrderNumber} onChange={(v) => setContent('showOrderNumber', v)} />
        <ToggleRow title="Date & time" value={c.showDateTime} onChange={(v) => setContent('showDateTime', v)} last={!c.showDateTime} />
        {c.showDateTime ? (
          <View style={styles.nested}>
            <Segmented
              options={[
                { value: 'uk', label: 'Full date' },
                { value: 'short', label: 'Short date' },
                { value: 'time_only', label: 'Time only' },
              ]}
              value={c.dateTimeFormat}
              onChange={(v) => setContent('dateTimeFormat', v as ReceiptContentConfig['dateTimeFormat'])}
            />
          </View>
        ) : null}
        <ToggleRow title="Scheduled time banner" description="Highlights pre-orders and time slots" value={c.showScheduledTime !== false} onChange={(v) => setContent('showScheduledTime', v)} />
        <ToggleRow title="Table number" description="Dine-in orders" value={c.showTableNumber} onChange={(v) => setContent('showTableNumber', v)} />
        <ToggleRow title="Customer name, phone & address" value={c.showCustomerInfo} onChange={(v) => setContent('showCustomerInfo', v)} />
        <ToggleRow title="Server name" value={c.showServerWaiterName} onChange={(v) => setContent('showServerWaiterName', v)} last={!c.showServerWaiterName} />
        {c.showServerWaiterName ? (
          <View style={styles.nested}>
            <Field
              label="Default server name"
              hint="Used when the order has no server name."
              value={c.serverWaiterName || ''}
              onChangeText={(t) => setContent('serverWaiterName', t)}
              placeholder="e.g. Front counter"
              maxLength={30}
              containerStyle={styles.noMargin}
            />
          </View>
        ) : null}
      </FormSection>

      <FormSection icon={ShoppingBasket} title="Items & totals" description="Add-ons and sizes always print under each item.">
        <ToggleRow title="Customer notes on items" description="e.g. “No onions”" value={c.showItemNotes} onChange={(v) => setContent('showItemNotes', v)} />
        <ToggleRow title="Discount line" value={c.showDiscountLine} onChange={(v) => setContent('showDiscountLine', v)} />
        <ToggleRow title="Payment status" description="e.g. “PAID - CARD” or “CASH DUE”" value={c.showPaymentMethod} onChange={(v) => setContent('showPaymentMethod', v)} />
        <ToggleRow title="VAT breakdown" description="Shows the VAT included in the total" value={c.showItemTaxBreakdown} onChange={(v) => setContent('showItemTaxBreakdown', v)} last={!c.showItemTaxBreakdown} />
        {c.showItemTaxBreakdown ? (
          <View style={styles.nested}>
            <Segmented
              options={[
                { value: '20', label: '20% standard' },
                { value: '5', label: '5% reduced' },
                { value: '0', label: '0%' },
              ]}
              value={String(c.taxPercentage ?? 20)}
              onChange={(v) => setContent('taxPercentage', Number(v))}
            />
          </View>
        ) : null}
      </FormSection>

      <FormSection icon={MessageSquareText} title="Footer">
        <Field
          label="Thank-you message (optional)"
          value={c.footerMessage}
          onChangeText={(t) => setContent('footerMessage', t)}
          placeholder="e.g. Thank you for your order!"
          multiline
          maxLength={120}
        />
        <ToggleRow title="QR code" description="Link to your menu, website or reviews" value={c.showQrCode} onChange={(v) => setContent('showQrCode', v)} last={!c.showQrCode} />
        {c.showQrCode ? (
          <View style={styles.nested}>
            <Field
              label="Link"
              value={c.qrCodeData}
              onChangeText={(t) => setContent('qrCodeData', t.trim())}
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              error={!c.qrCodeData?.trim() ? 'Enter a link — the QR code won’t print without one.' : undefined}
            />
            <Field label="Caption (optional)" value={c.qrCodeLabel} onChangeText={(t) => setContent('qrCodeLabel', t)} placeholder="e.g. Scan to leave a review" maxLength={40} containerStyle={styles.noMargin} />
          </View>
        ) : null}
      </FormSection>

      <FormSection icon={Type} title="Text style">
        <Text style={styles.subLabel}>Text size</Text>
        <Segmented
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
          value={l.fontSize}
          onChange={(v) => setLayout('fontSize', v as ReceiptLayoutConfig['fontSize'])}
        />
        <Text style={styles.subLabel}>Line spacing</Text>
        <Segmented
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'normal', label: 'Normal' },
            { value: 'relaxed', label: 'Relaxed' },
          ]}
          value={l.lineSpacing}
          onChange={(v) => setLayout('lineSpacing', v as ReceiptLayoutConfig['lineSpacing'])}
        />
        <Text style={styles.subLabel}>Header alignment</Text>
        <Segmented options={ALIGN_OPTIONS} value={l.alignment.header} onChange={(v) => setAlign('header', v)} />
        <Text style={styles.subLabel}>Footer alignment</Text>
        <Segmented options={ALIGN_OPTIONS} value={l.alignment.footer} onChange={(v) => setAlign('footer', v)} />

        <Text style={[styles.subLabel, styles.spaced]}>Bold</Text>
        <ToggleRow title="Restaurant name" value={l.boldElements.restaurantName} onChange={(v) => setBold('restaurantName', v)} />
        <ToggleRow title="Order number" value={l.boldElements.orderNumber} onChange={(v) => setBold('orderNumber', v)} />
        <ToggleRow title="Item names" value={l.boldElements.itemNames} onChange={(v) => setBold('itemNames', v)} />
        <ToggleRow title="Total" value={l.boldElements.totalAmount} onChange={(v) => setBold('totalAmount', v)} />
        <ToggleRow title="Customer details" value={l.boldElements.customerDetails} onChange={(v) => setBold('customerDetails', v)} />

        <Text style={[styles.subLabel, styles.spaced]}>Italic</Text>
        <ToggleRow title="Tagline" value={l.italicElements.tagline} onChange={(v) => setItalic('tagline', v)} />
        <ToggleRow title="Thank-you message" value={l.italicElements.footerMessage} onChange={(v) => setItalic('footerMessage', v)} last />
      </FormSection>
    </>
  );

  /* ── Render: preview panel ───────────────────────────────────────────── */

  const renderPreview = () => (
    <View>
      <Segmented<SampleType>
        options={[
          { value: 'delivery', label: 'Delivery' },
          { value: 'pickup', label: 'Takeaway' },
          { value: 'dine_in', label: 'Dine-in' },
        ]}
        value={sampleType}
        onChange={setSampleType}
      />
      <TouchableOpacity
        style={styles.scheduleToggle}
        onPress={() => setSampleScheduled((s) => !s)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: sampleScheduled }}
      >
        <View style={[styles.checkbox, sampleScheduled && styles.checkboxOn]}>{sampleScheduled ? <Check size={12} color="#FFF" strokeWidth={3} /> : null}</View>
        <Text style={styles.scheduleText}>Show as a scheduled order</Text>
      </TouchableOpacity>
      <ReceiptPreview order={sampleOrder} template={draft} paperWidth={paperWidth} />
      <Text style={styles.previewNote}>Exact print preview · {paperWidth} paper · sample order</Text>
    </View>
  );

  const renderEditor = () => {
    if (isSplit) {
      return (
        <View style={[styles.split, { paddingHorizontal: gutter }]}>
          <ScrollView style={styles.flex} contentContainerStyle={[formStyles.scroll, { paddingBottom: SAVE_BAR_SPACE }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {renderForm()}
          </ScrollView>
          <ScrollView style={styles.previewCol} contentContainerStyle={[formStyles.scroll, { paddingBottom: SAVE_BAR_SPACE }]} showsVerticalScrollIndicator={false}>
            {renderPreview()}
          </ScrollView>
        </View>
      );
    }
    return (
      <>
        <View style={[styles.phoneTabs, { paddingHorizontal: gutter }]}>
          <Segmented
            options={[
              { value: 'edit', label: 'Edit' },
              { value: 'preview', label: 'Preview' },
            ]}
            value={phoneTab}
            onChange={(v) => setPhoneTab(v as 'edit' | 'preview')}
          />
        </View>
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: SAVE_BAR_SPACE, paddingTop: 4 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>{phoneTab === 'edit' ? renderForm() : renderPreview()}</FormFrame>
        </ScrollView>
      </>
    );
  };

  /* ── Screen ──────────────────────────────────────────────────────────── */

  return (
    <KeyboardAvoidingView style={formStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {mode === 'list' ? (
        <ScreenHeader title="Receipt design" subtitle="Choose what your receipts show" />
      ) : (
        <ScreenHeader
          title={draft.name || 'Edit template'}
          subtitle={draft.id === activeId ? 'In use on every receipt' : 'Not in use'}
          onBack={() => leaveEditor()}
          rightElement={
            <HeaderPillButton label={printingId === draft.id ? 'Printing…' : 'Test print'} icon={Printer} onPress={() => (printingId ? undefined : testPrint(draft))} />
          }
        />
      )}

      {loading ? <LoadingState label="Loading templates…" /> : mode === 'list' ? renderList() : renderEditor()}

      <SaveBar visible={dirty} saving={saving} onSave={save} onDiscard={discard} saveLabel="Save & use" />

      {/* New template */}
      <Modal visible={newName !== null} transparent animationType="fade" onRequestClose={() => setNewName(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New template</Text>
            <Text style={styles.modalText}>Starts from the standard layout. You can change everything next.</Text>
            <Field label="Name" value={newName || ''} onChangeText={setNewName} placeholder="e.g. Kitchen ticket" autoFocus maxLength={40} onSubmitEditing={createTemplate} returnKeyType="done" />
            <View style={styles.modalActions}>
              <PrimaryButton label="Cancel" tone="secondary" onPress={() => setNewName(null)} style={styles.flex} />
              <PrimaryButton label="Create" onPress={createTemplate} disabled={!newName?.trim()} style={styles.flex} />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={!!confirmDelete}
        title="Delete this template?"
        message={confirmDelete ? `“${confirmDelete.name}” will be removed from this device.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        visible={confirmReset}
        title="Reset all templates?"
        message="Your custom templates and edits will be removed and the built-in templates restored."
        confirmText="Reset"
        cancelText="Cancel"
        isDestructive
        onConfirm={resetAll}
        onClose={() => setConfirmReset(false)}
      />
    </KeyboardAvoidingView>
  );
}

function IconButton({ icon: Icon, label, onPress, busy }: { icon: any; label: string; onPress: () => void; busy?: boolean }) {
  return (
    <TouchableOpacity style={[styles.iconBtn, busy && { opacity: 0.5 }]} onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}>
      <Icon size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  noMargin: { marginBottom: 0 },
  spaced: { marginTop: 14 },
  nested: { paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  subLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },

  // Template list
  tplRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  tplDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  tplMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tplIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tplIconActive: { backgroundColor: Colors.primary },
  tplTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tplName: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: Colors.text },
  tplDesc: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  inUse: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: Colors.statusApproved.bg },
  inUseText: { fontSize: 11, fontWeight: '800', color: Colors.statusApproved.text },
  tplActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  useBtn: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: Colors.primaryLight, justifyContent: 'center', marginRight: 4 },
  useBtnText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  resetLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  resetLinkText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },

  // Editor
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  logoThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: Colors.cardSurface, marginRight: 'auto' },
  split: { flex: 1, flexDirection: 'row', gap: 24, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  previewCol: { width: 400, flexGrow: 0 },
  phoneTabs: { paddingTop: 12, backgroundColor: Colors.backgroundSecondary },
  scheduleToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 14 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.cardBorder, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  scheduleText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  previewNote: { fontSize: 12, color: Colors.textSubtle, textAlign: 'center', marginTop: 12 },

  // New template modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: Colors.background, borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalText: { fontSize: 13, color: Colors.textMuted, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
