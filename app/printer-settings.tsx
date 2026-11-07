/**
 * Printer settings — one calm screen:
 *   1. Your printer (status, test print, change)
 *   2. Automatic printing
 *   3. Paper & copies
 *   4. Cash drawer
 *   5. Receipt design
 *   6. Help & tools
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, DeviceEventEmitter, ActivityIndicator } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Printer,
  Bluetooth,
  Wifi,
  Smartphone,
  FileText,
  Zap,
  Ruler,
  Banknote,
  Receipt,
  LifeBuoy,
  ChevronRight,
  CircleCheck,
  CircleAlert,
  Settings2,
  Unlink,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { PrinterSetupWizardModal } from '../components/PrinterSetupWizardModal';
import {
  FormFrame,
  FormSection,
  ToggleRow,
  Segmented,
  Notice,
  PrimaryButton,
  LoadingState,
  formStyles,
  useFormLayout,
} from '../components/settings/FormKit';
import {
  getPosPrinterConfig,
  getLastPrintJobReport,
  PRINT_FAILED_EVENT,
  PrintJobReport,
  testEpsonPrinter,
  testPrinterAlignmentSlip,
  openCashDrawer,
  isSunmiAvailable,
} from '../services/thermal-print.service';
import {
  PosPrinterConfig,
  AutoPrintTrigger,
  DEFAULT_POS_CONFIG,
  isProfileConfigured,
  savePosPrinterConfigStrict,
} from '../services/pos-config.service';
import { getActiveReceiptTemplate, ReceiptTemplate } from '../services/receipt-customization.service';

type PrinterStatus = 'ready' | 'failed' | 'not_set_up';

/** Human description of how the printer is connected. */
function describeConnection(cfg: PosPrinterConfig): { icon: any; title: string; detail: string } {
  switch (cfg.connectionType) {
    case 'builtin':
      return { icon: Smartphone, title: 'Built-in Sunmi printer', detail: 'Prints from this device' };
    case 'system':
      return { icon: FileText, title: 'System print', detail: 'AirPrint / Android print dialog' };
    case 'network': {
      const protocol = cfg.networkProtocol || (cfg.port === 8008 || cfg.port === 80 ? 'epos' : 'raw');
      return {
        icon: Wifi,
        title: cfg.deviceName || cfg.printerName || 'Wi-Fi / network printer',
        detail: cfg.ipAddress ? `${cfg.ipAddress}:${cfg.port} · ${protocol === 'epos' ? 'Epson ePOS' : 'ESC/POS'}` : 'No IP address set',
      };
    }
    case 'bluetooth':
    default:
      return {
        icon: Bluetooth,
        title: cfg.deviceName || cfg.printerName || 'Bluetooth printer',
        detail: cfg.macAddress || cfg.target ? `Bluetooth${cfg.bluetoothMode === 'ble' ? ' LE' : ''}` : 'No printer paired',
      };
  }
}

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { gutter } = useFormLayout();
  const { restaurantId } = useLocalSearchParams<{ restaurantId?: string }>();

  const [config, setConfig] = useState<PosPrinterConfig>(DEFAULT_POS_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [hasSunmi, setHasSunmi] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<ReceiptTemplate | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [busy, setBusy] = useState<null | 'test' | 'calibration' | 'drawer'>(null);
  const [lastFailure, setLastFailure] = useState<PrintJobReport | null>(() => {
    const r = getLastPrintJobReport();
    return r && !r.success && !r.skipped && r.error !== 'Print cancelled.' ? r : null;
  });

  // Load the printer config once; refresh the template name whenever the screen is shown
  useEffect(() => {
    getPosPrinterConfig(restaurantId)
      .then(setConfig)
      .finally(() => setLoaded(true));
    isSunmiAvailable().then(setHasSunmi).catch(() => setHasSunmi(false));
  }, [restaurantId]);

  useFocusEffect(
    useCallback(() => {
      getActiveReceiptTemplate(restaurantId).then(setActiveTemplate).catch(() => {});
    }, [restaurantId])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PRINT_FAILED_EVENT, (r: PrintJobReport) => setLastFailure(r));
    return () => sub.remove();
  }, []);

  const isConfigured = isProfileConfigured(config);
  const status: PrinterStatus = !isConfigured ? 'not_set_up' : lastFailure ? 'failed' : 'ready';
  const connection = describeConnection(config);
  const ConnectionIcon = connection.icon;
  const supportsDrawer = isConfigured && config.connectionType !== 'system';

  /** Saves settings immediately (optimistic); reverts the UI if storage fails. */
  const save = async (partial: Partial<PosPrinterConfig>) => {
    const previous = config;
    setConfig({ ...config, ...partial });
    try {
      setConfig(await savePosPrinterConfigStrict(partial, restaurantId));
    } catch (e: any) {
      setConfig(previous);
      showToast({ title: 'Couldn’t save', message: e?.message || 'Storage on this device failed. Please try again.', type: 'error' });
    }
  };

  const handleTestPrint = async () => {
    setBusy('test');
    try {
      const result = await testEpsonPrinter(config, restaurantId);
      if (result.success) {
        setLastFailure(null);
        showToast({ title: 'Test receipt printed', message: result.message, type: 'success' });
      } else if (result.message !== 'Print cancelled.') {
        showToast({ title: 'Test print failed', message: result.message, type: 'error' });
      }
    } finally {
      setBusy(null);
    }
  };

  const handleCalibration = async () => {
    setBusy('calibration');
    try {
      const result = await testPrinterAlignmentSlip(config);
      showToast({
        title: result.success ? 'Calibration slip printed' : 'Couldn’t print calibration slip',
        message: result.message,
        type: result.success ? 'success' : 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleDrawerTest = async () => {
    setBusy('drawer');
    try {
      const ok = await openCashDrawer(restaurantId);
      showToast(
        ok
          ? { title: 'Drawer opened', message: 'The cash drawer received the open signal.', type: 'success' }
          : { title: 'Drawer didn’t open', message: 'Check the drawer cable is plugged into the printer.', type: 'error' }
      );
    } finally {
      setBusy(null);
    }
  };

  const handleForget = async () => {
    setConfirmForget(false);
    await save({ connectionType: 'bluetooth', ipAddress: '', target: '', macAddress: '', deviceName: '', printerName: '' });
    setLastFailure(null);
    showToast({ title: 'Printer removed', message: 'Set up a printer again to print receipts.', type: 'info' });
  };

  const openReceiptDesign = () =>
    router.push({ pathname: '/receipt-customization', params: restaurantId ? { restaurantId } : {} } as any);

  return (
    <View style={formStyles.screen}>
      <ScreenHeader title="Printer" subtitle="Receipt printer and printing preferences" />

      {!loaded ? (
        <LoadingState label="Loading printer settings…" />
      ) : (
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: 48 }]}
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>
            {/* ── 1. Your printer ─────────────────────────────────────────── */}
            <View style={styles.printerCard}>
              {isConfigured ? (
                <>
                  <View style={styles.printerRow}>
                    <View style={[styles.printerIcon, status === 'failed' && styles.printerIconFailed]}>
                      <ConnectionIcon size={24} color={status === 'failed' ? Colors.danger : Colors.primary} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.printerName} numberOfLines={1}>
                        {connection.title}
                      </Text>
                      <Text style={styles.printerDetail} numberOfLines={1}>
                        {connection.detail}
                      </Text>
                    </View>
                    <StatusPill status={status} />
                  </View>

                  {lastFailure ? (
                    <View style={styles.failureBox} accessibilityLiveRegion="polite">
                      <CircleAlert size={16} color={Colors.statusRejected.text} />
                      <View style={styles.flex}>
                        <Text style={styles.failureTitle}>Order {lastFailure.orderNumber} didn’t print</Text>
                        <Text style={styles.failureText}>{lastFailure.error}</Text>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    <PrimaryButton
                      label="Print test receipt"
                      icon={Printer}
                      onPress={handleTestPrint}
                      loading={busy === 'test'}
                      disabled={!!busy}
                      style={styles.flex}
                    />
                    <PrimaryButton label="Change" icon={Settings2} tone="secondary" onPress={() => setWizardOpen(true)} disabled={!!busy} />
                  </View>
                </>
              ) : (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Printer size={30} color={Colors.primary} />
                  </View>
                  <Text style={styles.emptyTitle}>No printer connected</Text>
                  <Text style={styles.emptyText}>
                    Connect a Bluetooth, Wi-Fi or built-in printer to print order receipts automatically.
                  </Text>
                  <PrimaryButton label="Set up printer" icon={Printer} onPress={() => setWizardOpen(true)} style={styles.emptyBtn} />
                </View>
              )}
            </View>

            {/* ── 2. Automatic printing ───────────────────────────────────── */}
            <FormSection icon={Zap} title="Automatic printing" description="Each order prints once. You can always reprint it from the order.">
              <ToggleRow
                title="Print orders automatically"
                description={config.autoPrint === false ? 'Off — print orders from the order screen.' : undefined}
                value={config.autoPrint !== false}
                onChange={(v) => save({ autoPrint: v })}
                last
              />
              {config.autoPrint !== false && (
                <View style={styles.subBlock}>
                  <Text style={styles.subLabel}>Print when</Text>
                  <Segmented<AutoPrintTrigger>
                    options={[
                      { value: 'new_order', label: 'Order arrives' },
                      { value: 'accepted', label: 'I accept it' },
                    ]}
                    value={config.autoPrintTrigger || 'new_order'}
                    onChange={(v) => save({ autoPrintTrigger: v })}
                  />
                  {!isConfigured ? <Notice tone="warning">Set up a printer first — nothing can print until then.</Notice> : null}
                </View>
              )}
            </FormSection>

            {/* ── 3. Paper & copies ───────────────────────────────────────── */}
            <FormSection icon={Ruler} title="Paper & copies">
              <Text style={styles.subLabel}>Paper roll width</Text>
              <Segmented<'58mm' | '80mm'>
                options={[
                  { value: '58mm', label: '58 mm · small' },
                  { value: '80mm', label: '80 mm · standard' },
                ]}
                value={config.paperWidth}
                onChange={(v) => save({ paperWidth: v })}
              />
              <Text style={styles.hint}>Not sure? Print a calibration slip below — the ruler must fit on one line.</Text>

              <Text style={[styles.subLabel, styles.spaced]}>Print position</Text>
              <Segmented<string>
                options={['0', '2', '4', '6', '8'].map((mm) => ({ value: mm, label: mm === '0' ? 'Default' : `+${mm} mm` }))}
                value={String([0, 2, 4, 6, 8].includes(config.printOffsetMm || 0) ? config.printOffsetMm || 0 : 0)}
                onChange={(v) => save({ printOffsetMm: Number(v) })}
              />
              <Text style={styles.hint}>
                If the first letters on the left of your receipt are cut off, move the print to the right until the
                calibration slip shows both edge arrows.
              </Text>

              <Text style={[styles.subLabel, styles.spaced]}>Copies per order</Text>
              <Segmented<string>
                options={[
                  { value: '1', label: '1 copy' },
                  { value: '2', label: '2 copies' },
                  { value: '3', label: '3 copies' },
                ]}
                value={String(Math.min(config.copies || 1, 3))}
                onChange={(v) => save({ copies: Number(v) })}
              />
              <Text style={styles.hint}>2 copies = one for the kitchen, one for the customer.</Text>

              <View style={styles.spaced}>
                <ToggleRow
                  title="Cut paper after each receipt"
                  description="Turn off if your printer has no cutter."
                  value={config.autoCut !== false}
                  onChange={(v) => save({ autoCut: v })}
                  last
                />
              </View>
            </FormSection>

            {/* ── 4. Cash drawer ──────────────────────────────────────────── */}
            {supportsDrawer && (
              <FormSection icon={Banknote} title="Cash drawer" description="For tills with a drawer plugged into the printer.">
                <ToggleRow
                  title="Open drawer for cash orders"
                  description="Card and online orders never open the drawer."
                  value={!!config.openCashDrawer}
                  onChange={(v) => save({ openCashDrawer: v })}
                  last
                />
                <PrimaryButton
                  label="Test drawer"
                  tone="secondary"
                  icon={Banknote}
                  onPress={handleDrawerTest}
                  loading={busy === 'drawer'}
                  disabled={!!busy}
                  style={styles.inlineBtn}
                />
              </FormSection>
            )}

            {/* ── 5. Receipt design ───────────────────────────────────────── */}
            <TouchableOpacity style={styles.linkCard} onPress={openReceiptDesign} activeOpacity={0.8} accessibilityRole="button">
              <View style={styles.linkIcon}>
                <Receipt size={20} color={Colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.linkTitle}>Receipt design</Text>
                <Text style={styles.linkText} numberOfLines={1}>
                  {activeTemplate ? `Using “${activeTemplate.name}”` : 'Choose what your receipts show'}
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textSubtle} />
            </TouchableOpacity>

            {/* ── 6. Help & tools ─────────────────────────────────────────── */}
            <FormSection icon={LifeBuoy} title="Help & tools">
              <ToolRow
                icon={Ruler}
                title="Print calibration slip"
                description="Checks paper width and alignment"
                onPress={handleCalibration}
                busy={busy === 'calibration'}
                disabled={!isConfigured || !!busy}
              />
              <ToolRow
                icon={LifeBuoy}
                title="Printer setup guide"
                description="Step-by-step help for common printers"
                onPress={() => router.push('/printer-guide')}
                last={!isConfigured}
              />
              {isConfigured && (
                <ToolRow icon={Unlink} title="Remove this printer" tone="danger" onPress={() => setConfirmForget(true)} last />
              )}
            </FormSection>

            {hasSunmi && config.connectionType !== 'builtin' ? (
              <Notice tone="info" title="This device has a built-in printer">
                Tap Change and choose “Sunmi built-in” to print without any cables.
              </Notice>
            ) : null}
          </FormFrame>
        </ScrollView>
      )}

      <PrinterSetupWizardModal
        visible={wizardOpen}
        onClose={() => setWizardOpen(false)}
        restaurantId={restaurantId}
        currentConfig={config}
        onComplete={(saved, verified) => {
          setConfig(saved);
          setLastFailure(null);
          showToast(
            verified
              ? { title: 'Printer connected', message: 'Receipts will print on this printer.', type: 'success' }
              : { title: 'Printer saved', message: 'Automatic printing is off until the printer connects.', type: 'info' }
          );
        }}
      />

      <ConfirmModal
        visible={confirmForget}
        title="Remove this printer?"
        message="Receipts won’t print on this device until you set up a printer again."
        confirmText="Remove"
        cancelText="Cancel"
        isDestructive
        onConfirm={handleForget}
        onClose={() => setConfirmForget(false)}
      />
    </View>
  );
}

function StatusPill({ status }: { status: PrinterStatus }) {
  const map = {
    ready: { label: 'Ready', bg: Colors.statusApproved.bg, fg: Colors.statusApproved.text, Icon: CircleCheck },
    failed: { label: 'Problem', bg: Colors.statusRejected.bg, fg: Colors.statusRejected.text, Icon: CircleAlert },
    not_set_up: { label: 'Not set up', bg: Colors.cardSurface, fg: Colors.textMuted, Icon: CircleAlert },
  }[status];
  const Icon = map.Icon;
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }]} accessibilityLabel={`Printer status: ${map.label}`}>
      <Icon size={13} color={map.fg} />
      <Text style={[styles.pillText, { color: map.fg }]}>{map.label}</Text>
    </View>
  );
}

function ToolRow({
  icon: Icon,
  title,
  description,
  onPress,
  busy,
  disabled,
  tone,
  last,
}: {
  icon: any;
  title: string;
  description?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'danger';
  last?: boolean;
}) {
  const isDanger = tone === 'danger';
  return (
    <TouchableOpacity
      style={[styles.toolRow, !last && styles.toolDivider, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <Icon size={18} color={isDanger ? Colors.danger : Colors.textMuted} />
      <View style={styles.flex}>
        <Text style={[styles.toolTitle, { color: isDanger ? Colors.danger : Colors.text }]}>{title}</Text>
        {description ? <Text style={styles.toolText}>{description}</Text> : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : <ChevronRight size={18} color={Colors.textSubtle} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },

  printerCard: {
    backgroundColor: Colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
    marginBottom: 16,
  },
  printerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  printerIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printerIconFailed: { backgroundColor: Colors.statusRejected.bg },
  printerName: { fontSize: 17, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  printerDetail: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },

  failureBox: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.statusRejected.bg,
  },
  failureTitle: { fontSize: 13, fontWeight: '800', color: Colors.statusRejected.text },
  failureText: { fontSize: 13, color: Colors.statusRejected.text, marginTop: 2, lineHeight: 18 },

  emptyState: { alignItems: 'center', paddingVertical: 12 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20, maxWidth: 340 },
  emptyBtn: { marginTop: 16, alignSelf: 'stretch' },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13 },
  pillText: { fontSize: 12, fontWeight: '800' },

  subBlock: { marginTop: 4 },
  subLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },
  spaced: { marginTop: 16 },
  hint: { fontSize: 12, color: Colors.textSubtle, marginTop: -6, lineHeight: 16 },
  inlineBtn: { alignSelf: 'flex-start', marginTop: 8 },

  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  linkText: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  toolDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  toolTitle: { fontSize: 15, fontWeight: '700' },
  toolText: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
