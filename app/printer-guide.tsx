/**
 * Printer setup guide — plain-language help for restaurant staff.
 *   1. Quick start (the 3 steps everyone follows)
 *   2. Step-by-step setup per connection type (matches the setup wizard)
 *   3. Fix a problem (organised by what you actually see)
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Wifi,
  Bluetooth,
  Smartphone,
  FileText,
  Printer,
  ListChecks,
  Wrench,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Settings2,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { ScreenHeader } from '../components/ScreenHeader';
import { FormFrame, FormSection, Segmented, Notice, PrimaryButton, formStyles, useFormLayout } from '../components/settings/FormKit';

type Connection = 'wifi' | 'bluetooth' | 'sunmi' | 'system';

type Step = { title: string; body: string };

const SETUP: Record<Connection, { intro: string; steps: Step[]; tip?: string }> = {
  wifi: {
    intro: 'For printers plugged into your router with a network cable, or connected to your Wi-Fi.',
    steps: [
      {
        title: 'Switch the printer on',
        body: 'Load the paper roll with the shiny side facing the print head, close the lid and turn the printer on. For a cable connection, plug it into your router — a light should blink next to the network port.',
      },
      {
        title: 'Find the printer’s IP address',
        body: 'Print a self-test slip: turn the printer off, hold the FEED button, turn it on and let go after 2 seconds. Look for “IP Address” on the slip — for example 192.168.1.120.',
      },
      {
        title: 'Connect this tablet to the same Wi-Fi',
        body: 'The tablet must be on the same Wi-Fi as the printer — not a guest network. On phones, turn mobile data off while setting up.',
      },
      {
        title: 'Add the printer in Krifoo',
        body: 'Open Printer → Set up printer (or Change) → Wi-Fi / Network. Tap “Search Wi-Fi for printers”, or type the IP address. Choose the printer type: “Standard ESC/POS” (port 9100, most printers) or “Epson ePOS” (port 8008, Epson TM printers).',
      },
      {
        title: 'Print a test receipt',
        body: 'Tap “Print test receipt”. When it prints, tap “Save & start printing”.',
      },
    ],
    tip: 'Ask whoever manages your Wi-Fi to give the printer a fixed (reserved) IP address in the router. Otherwise the address can change after a power cut and printing stops.',
  },
  bluetooth: {
    intro: 'For portable and compact receipt printers (Xprinter, Munbyn, Rongta, Epson with Bluetooth and similar).',
    steps: [
      {
        title: 'Switch the printer on',
        body: 'Load the paper roll, close the lid and turn the printer on. Keep it within a few metres of the tablet.',
      },
      {
        title: 'Pair it in the tablet’s Bluetooth settings (Android)',
        body: 'Open Settings → Bluetooth, tap the printer’s name and pair it. If it asks for a PIN, try 0000 or 1234. On iPhone and iPad skip this step — the printer is found inside Krifoo.',
      },
      {
        title: 'Allow “Nearby devices”',
        body: 'The first time you search, Android asks for “Nearby devices” permission. Tap Allow — without it the app can’t see Bluetooth printers.',
      },
      {
        title: 'Choose the printer in Krifoo',
        body: 'Open Printer → Set up printer (or Change) → Bluetooth. Printers are listed first; pick yours by name. Headphones, speakers and watches are hidden automatically.',
      },
      {
        title: 'Print a test receipt',
        body: 'Tap “Print test receipt”. When it prints, tap “Save & start printing”.',
      },
    ],
    tip: 'A Bluetooth printer connects to one device at a time. Disconnect it from other phones or tills, or it won’t accept this tablet.',
  },
  sunmi: {
    intro: 'For Sunmi terminals with a printer built in (V2, V2s, V3, T2 and similar).',
    steps: [
      {
        title: 'Load the paper',
        body: 'Open the paper cover on the Sunmi device, load the roll with the paper coming out from underneath and close the cover.',
      },
      {
        title: 'Choose the built-in printer',
        body: 'Open Printer → Set up printer (or Change) → “Sunmi built-in”. This option only appears on Sunmi devices.',
      },
      {
        title: 'Print a test receipt',
        body: 'Tap “Print test receipt”, then save. No pairing or network is needed.',
      },
    ],
    tip: 'If the Sunmi option doesn’t appear, restart the device and make sure the Sunmi “Printer service” app is up to date.',
  },
  system: {
    intro: 'Print to any AirPrint (iPhone / iPad) or Android-compatible printer through the standard print dialog.',
    steps: [
      {
        title: 'Make sure your printer works with the tablet',
        body: 'The printer must already show up when you print from other apps (AirPrint on iPhone / iPad, or the printer’s plug-in on Android).',
      },
      {
        title: 'Choose “System print”',
        body: 'Open Printer → Set up printer (or Change) → System print, and save.',
      },
      {
        title: 'Confirm each print',
        body: 'Every receipt opens the print dialog — choose the printer and tap Print.',
      },
    ],
    tip: 'System print needs a tap on every receipt, so it isn’t suitable for automatic printing in a busy kitchen. Use a Wi-Fi, Bluetooth or Sunmi printer for that.',
  },
};

type Problem = { title: string; fixes: string[] };

const PROBLEMS: { group: string; items: Problem[] }[] = [
  {
    group: 'Orders don’t print',
    items: [
      {
        title: 'New orders don’t print automatically',
        fixes: [
          'Open Printer and check “Print orders automatically” is on.',
          'Check “Print when”: “Order arrives” prints straight away; “I accept it” only prints after you accept the order.',
          'Look at the printer card. If it says “Problem”, the reason is shown underneath.',
          'Each order prints automatically only once. To print it again, open the order and tap Print.',
        ],
      },
      {
        title: '“Order … didn’t print” message',
        fixes: [
          'Check the printer is on, has paper and the lid is closed.',
          'Tap “Print test receipt” on the Printer screen — the message explains what went wrong.',
          'Print the order again from the order screen once the printer is working.',
        ],
      },
    ],
  },
  {
    group: 'Wi-Fi / network printers',
    items: [
      {
        title: '“Network printer timed out” or “unreachable”',
        fixes: [
          'Make sure the tablet and printer are on the same Wi-Fi (not a guest network).',
          'On phones, turn mobile data off — it can stop the tablet reaching the printer.',
          'Print a self-test slip and check the IP address matches the one in Krifoo. If it changed, tap Change and enter the new one.',
          'Turn the printer off and on again, and wait 30 seconds before testing.',
        ],
      },
      {
        title: '“Connection refused” or “port busy”',
        fixes: [
          'Another till or app may be using the printer. Close it, or wait a minute.',
          'Turn the printer off for 10 seconds and on again.',
          'Check the printer type: “Standard ESC/POS” uses port 9100, “Epson ePOS” uses port 8008.',
        ],
      },
      {
        title: 'The receipt prints strange code or <epos-print> text',
        fixes: ['The printer type is wrong. Tap Change and switch between “Standard ESC/POS” and “Epson ePOS”.'],
      },
    ],
  },
  {
    group: 'Bluetooth printers',
    items: [
      {
        title: 'My printer isn’t in the list',
        fixes: [
          'Android: pair it first in Settings → Bluetooth, then search again in Krifoo.',
          'Allow the “Nearby devices” permission (Settings → Apps → Krifoo Admin → Permissions).',
          'Turn Bluetooth off and on, and switch the printer off and on.',
          'Disconnect the printer from any other phone or till.',
        ],
      },
      {
        title: 'It connects but nothing prints (iPhone / iPad)',
        fixes: [
          'iPhone and iPad can only use Bluetooth LE printers. Many Epson printers use a type of Bluetooth Apple doesn’t allow apps to use — connect those by Wi-Fi instead.',
        ],
      },
    ],
  },
  {
    group: 'How the receipt looks',
    items: [
      {
        title: 'The left side of the receipt is cut off',
        fixes: [
          'Printer → Help & tools → Print calibration slip. Both edge arrows (|<< LEFT and RIGHT >>|) must be visible.',
          'If the left arrow is cut off, increase “Print position” under Paper & copies, and print the slip again.',
          'If you use 80 mm paper, choose 80 mm as the paper width.',
        ],
      },
      {
        title: 'Lines wrap or text runs off the right side',
        fixes: ['Your printer uses 58 mm paper. Choose 58 mm under Paper & copies.'],
      },
      {
        title: 'Big empty space on the right',
        fixes: ['Your printer uses 80 mm paper. Choose 80 mm under Paper & copies to use the full width.'],
      },
      {
        title: 'Paper comes out blank',
        fixes: [
          'The paper roll is in upside down. Thermal paper only prints on one side — turn the roll over.',
          'Make sure you are using thermal receipt paper, not plain paper.',
        ],
      },
      {
        title: '£ or accented letters print wrongly',
        fixes: ['Some older printers don’t support these characters. Print the calibration slip — the “Symbols” line shows what your printer can print.'],
      },
      {
        title: 'Change what the receipt shows',
        fixes: ['Printer → Receipt design. Edit a template and check it in the exact print preview before saving.'],
      },
    ],
  },
  {
    group: 'Paper, copies & cash drawer',
    items: [
      {
        title: 'Each order prints more than once',
        fixes: ['Check “Copies per order” under Paper & copies. Set 1 copy for one receipt per order.'],
      },
      {
        title: 'The paper isn’t cut',
        fixes: ['Check “Cut paper after each receipt” is on. Some small and portable printers have no cutter — tear the paper off instead.'],
      },
      {
        title: 'The cash drawer doesn’t open',
        fixes: [
          'The drawer only opens for cash orders — card and online orders never open it.',
          'Check “Open drawer for cash orders” is on, then tap “Test drawer”.',
          'The drawer cable must be plugged into the printer’s drawer port (often marked DK), not the network port.',
        ],
      },
    ],
  },
];

export default function PrinterGuideScreen() {
  const router = useRouter();
  const { gutter } = useFormLayout();
  const [connection, setConnection] = useState<Connection>('wifi');
  const [open, setOpen] = useState<string | null>(null);
  const setup = SETUP[connection];

  const openPrinterScreen = () => router.push('/printer-settings');
  const openBluetoothSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
        return;
      }
    } catch {}
    Linking.openSettings();
  };
  const openWifiSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
        return;
      }
    } catch {}
    Linking.openSettings();
  };

  return (
    <View style={formStyles.screen}>
      <ScreenHeader title="Printer guide" subtitle="Set up a printer and fix common problems" />
      <ScrollView contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: 48 }]} showsVerticalScrollIndicator={false}>
        <FormFrame>
          {/* 1. Quick start */}
          <FormSection icon={ListChecks} title="Quick start" description="Most printers are working in under 5 minutes.">
            <Steps
              steps={[
                { title: 'Set up the printer', body: 'Printer → Set up printer, then choose how it connects.' },
                { title: 'Print a test receipt', body: 'Check it prints clearly and nothing is cut off.' },
                { title: 'Choose when to print', body: 'Under Automatic printing, print when an order arrives or when you accept it.' },
              ]}
            />
            <PrimaryButton label="Open printer settings" icon={Printer} onPress={openPrinterScreen} style={styles.fullBtn} />
          </FormSection>

          {/* 2. Setup by connection */}
          <FormSection icon={Settings2} title="Step-by-step setup" description="Choose how your printer connects.">
            <Segmented<Connection>
              options={[
                { value: 'wifi', label: 'Wi-Fi' },
                { value: 'bluetooth', label: 'Bluetooth' },
                { value: 'sunmi', label: 'Sunmi' },
                { value: 'system', label: 'AirPrint' },
              ]}
              value={connection}
              onChange={setConnection}
            />
            <View style={styles.introRow}>
              <ConnectionIcon connection={connection} />
              <Text style={styles.introText}>{setup.intro}</Text>
            </View>
            <Steps steps={setup.steps} />
            {setup.tip ? (
              <Notice tone="info" icon={Lightbulb}>
                {setup.tip}
              </Notice>
            ) : null}
            <View style={styles.btnRow}>
              <PrimaryButton label="Set up printer" icon={Printer} onPress={openPrinterScreen} style={styles.flex} />
              {connection === 'bluetooth' ? (
                <PrimaryButton label="Bluetooth settings" tone="secondary" icon={Bluetooth} onPress={openBluetoothSettings} style={styles.flex} />
              ) : connection === 'wifi' ? (
                <PrimaryButton label="Wi-Fi settings" tone="secondary" icon={Wifi} onPress={openWifiSettings} style={styles.flex} />
              ) : null}
            </View>
          </FormSection>

          {/* 3. Troubleshooting */}
          <FormSection icon={Wrench} title="Fix a problem" description="Tap what you see for the fix.">
            {PROBLEMS.map((group, gi) => (
              <View key={group.group} style={gi > 0 && styles.groupSpacing}>
                <Text style={styles.groupTitle}>{group.group}</Text>
                {group.items.map((p, i) => {
                  const id = `${group.group}:${p.title}`;
                  const isOpen = open === id;
                  return (
                    <View key={p.title} style={[styles.faq, i === group.items.length - 1 && styles.faqLast]}>
                      <TouchableOpacity
                        style={styles.faqHead}
                        onPress={() => setOpen(isOpen ? null : id)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isOpen }}
                      >
                        <Text style={[styles.faqTitle, isOpen && styles.faqTitleOpen]}>{p.title}</Text>
                        {isOpen ? <ChevronUp size={18} color={Colors.primary} /> : <ChevronDown size={18} color={Colors.textSubtle} />}
                      </TouchableOpacity>
                      {isOpen ? (
                        <View style={styles.faqBody}>
                          {p.fixes.map((fix, fi) => (
                            <View key={fi} style={styles.fixRow}>
                              <Text style={styles.fixBullet}>{p.fixes.length > 1 ? `${fi + 1}.` : '•'}</Text>
                              <Text style={styles.fixText}>{fix}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </FormSection>

          <Notice tone="success" title="Still stuck?">
            Print a calibration slip from Printer → Help & tools and send a photo of it, with your printer model, to Krifoo support.
          </Notice>
        </FormFrame>
      </ScrollView>
    </View>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => (
        <View key={s.title} style={styles.step}>
          <View style={styles.stepRail}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            {i < steps.length - 1 ? <View style={styles.stepLine} /> : null}
          </View>
          <View style={[styles.flex, i < steps.length - 1 && styles.stepGap]}>
            <Text style={styles.stepTitle}>{s.title}</Text>
            <Text style={styles.stepBody}>{s.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function ConnectionIcon({ connection }: { connection: Connection }) {
  const Icon = connection === 'wifi' ? Wifi : connection === 'bluetooth' ? Bluetooth : connection === 'sunmi' ? Smartphone : FileText;
  return (
    <View style={styles.introIcon}>
      <Icon size={18} color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fullBtn: { marginTop: 4 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  introRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  introIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, fontSize: 14, color: Colors.textMuted, lineHeight: 20 },

  steps: { marginBottom: 14 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 28 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  stepLine: { flex: 1, width: 2, backgroundColor: Colors.primaryLight, marginVertical: 4 },
  stepGap: { paddingBottom: 18 },
  stepTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginTop: 4 },
  stepBody: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginTop: 3 },

  groupSpacing: { marginTop: 18 },
  groupTitle: { fontSize: 12, fontWeight: '800', color: Colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  faq: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  faqLast: { borderBottomWidth: 0 },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  faqTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  faqTitleOpen: { color: Colors.primary },
  faqBody: { paddingBottom: 14, gap: 8 },
  fixRow: { flexDirection: 'row', gap: 8 },
  fixBullet: { width: 18, fontSize: 14, fontWeight: '800', color: Colors.primary, lineHeight: 20 },
  fixText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 20 },
});
