import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { BellRing, Volume2, Timer, Play, Square, RotateCcw, Info } from 'lucide-react-native';
import {
  DEFAULT_SOUND_SETTINGS,
  SoundSettings,
  getSoundSettings,
  playOrderBuzzSound,
  saveSoundSettings,
  stopOrderBuzzSound,
} from '../services/sound.service';
import {
  FormFrame,
  FormSection,
  LoadingState,
  Notice,
  PrimaryButton,
  SAVE_BAR_SPACE,
  SaveBar,
  Segmented,
  ToggleRow,
  formStyles,
  isEqualJSON,
  useFormLayout,
  useUnsavedChangesGuard,
} from '../components/settings/FormKit';

/**
 * New-order alert sound (stored on this device via AsyncStorage — see services/sound.service.ts).
 * Live alerts (SocketContext / push notifications) read these saved values: master switch,
 * "new orders" switch, volume, buzz duration and vibration.
 */

const VOLUME_OPTIONS = [
  { value: '0.3', label: 'Quiet' },
  { value: '0.5', label: 'Medium' },
  { value: '0.7', label: 'Loud' },
  { value: '1', label: 'Max' },
];
const DURATION_OPTIONS = [
  { value: '3', label: '3 sec' },
  { value: '5', label: '5 sec' },
  { value: '10', label: '10 sec' },
  { value: '15', label: '15 sec' },
];

/** Picks the closest option so values saved by the old slider (e.g. 0.85) still show a selection. */
const nearest = (value: number, options: { value: string }[]) =>
  options.reduce((best, o) => (Math.abs(Number(o.value) - value) < Math.abs(Number(best.value) - value) ? o : best)).value;

export default function SoundSettingsScreen() {
  const { showToast } = useToast();
  const { gutter, isTablet } = useFormLayout();

  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [saved, setSaved] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = !isEqualJSON(settings, saved);
  useUnsavedChangesGuard(dirty);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSoundSettings();
      setSettings(data);
      setSaved(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      // Stop any test sound when leaving the screen.
      if (testTimer.current) clearTimeout(testTimer.current);
      stopOrderBuzzSound().catch(() => {});
    };
  }, [load]);

  const update = <K extends keyof SoundSettings>(key: K, value: SoundSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const stopTest = async () => {
    if (testTimer.current) clearTimeout(testTimer.current);
    testTimer.current = null;
    await stopOrderBuzzSound().catch(() => {});
    setTesting(false);
  };

  const test = async () => {
    if (testing) return stopTest();
    if (!settings.enabled) {
      showToast({ title: 'Alerts are off', message: 'Turn on order alerts to test the sound.', type: 'info' });
      return;
    }
    setTesting(true);
    // Preview the values on screen, even if they haven't been saved yet.
    await playOrderBuzzSound(settings.durationSeconds * 1000, undefined, settings);
    testTimer.current = setTimeout(() => {
      setTesting(false);
      testTimer.current = null;
    }, settings.durationSeconds * 1000 + 300);
  };

  const save = async () => {
    setSaving(true);
    try {
      const stored = await saveSoundSettings(settings);
      setSettings(stored);
      setSaved(stored);
      showToast({ title: 'Alerts saved', message: 'New orders will use these sound settings.', type: 'success' });
    } catch {
      showToast({ title: 'Save failed', message: 'Couldn’t save on this device. Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    setConfirmReset(false);
    await stopTest();
    try {
      const stored = await saveSoundSettings(DEFAULT_SOUND_SETTINGS);
      setSettings(stored);
      setSaved(stored);
      showToast({ title: 'Defaults restored', message: 'Order alerts are back to the recommended settings.', type: 'success' });
    } catch {
      showToast({ title: 'Reset failed', message: 'Couldn’t save on this device. Please try again.', type: 'error' });
    }
  };

  return (
    <View style={formStyles.screen}>
      <ScreenHeader
        title="Order alerts"
        subtitle="Sound and vibration on this device"
        rightElement={
          <TouchableOpacity style={styles.resetBtn} onPress={() => setConfirmReset(true)} accessibilityRole="button" accessibilityLabel="Reset to defaults">
            <RotateCcw size={16} color={Colors.textMuted} />
            {isTablet ? <Text style={styles.resetText}>Reset</Text> : null}
          </TouchableOpacity>
        }
      />

      {loading ? (
        <LoadingState label="Loading alert settings…" />
      ) : (
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: SAVE_BAR_SPACE }]}
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>
            <FormSection icon={BellRing} title="Alerts" description="What happens when a new order arrives.">
              <ToggleRow
                title="Order alert sound"
                description={settings.enabled ? 'A buzzer plays for every new order.' : 'No sound — you won’t hear new orders.'}
                value={settings.enabled}
                onChange={(v) => update('enabled', v)}
              />
              <ToggleRow
                title="New orders"
                description="Play the alert when an order is placed."
                value={settings.notifyOrders}
                onChange={(v) => update('notifyOrders', v)}
                disabled={!settings.enabled}
              />
              <ToggleRow
                title="Vibrate"
                description="Also vibrate the device with the sound."
                value={settings.vibrationEnabled}
                onChange={(v) => update('vibrationEnabled', v)}
                disabled={!settings.enabled}
                last
              />
              {!settings.enabled && (
                <View style={{ marginTop: 12 }}>
                  <Notice tone="warning" icon={Info}>
                    With alerts off, staff may miss new orders. Keep them on during opening hours.
                  </Notice>
                </View>
              )}
            </FormSection>

            <View pointerEvents={settings.enabled ? 'auto' : 'none'} style={!settings.enabled && styles.disabled}>
              <FormSection icon={Volume2} title="Volume" description="How loud the buzzer is. Kitchens usually need Max.">
                <Segmented
                  value={nearest(settings.volume, VOLUME_OPTIONS)}
                  onChange={(v) => update('volume', Number(v))}
                  options={VOLUME_OPTIONS}
                />
              </FormSection>

              <FormSection icon={Timer} title="Buzz length" description="How long the buzzer keeps ringing for each order.">
                <Segmented
                  value={nearest(settings.durationSeconds, DURATION_OPTIONS)}
                  onChange={(v) => update('durationSeconds', Number(v))}
                  options={DURATION_OPTIONS}
                />
              </FormSection>
            </View>

            <PrimaryButton
              label={testing ? 'Stop test' : 'Play test alert'}
              icon={testing ? Square : Play}
              tone={testing ? 'secondary' : 'primary'}
              onPress={test}
              style={styles.testBtn}
            />
            <Text style={styles.testHint}>Plays your current choices — even before you save.</Text>
          </FormFrame>
        </ScrollView>
      )}

      <SaveBar visible={dirty && !loading} saving={saving} onSave={save} onDiscard={() => setSettings(saved)} />

      <ConfirmModal
        visible={confirmReset}
        title="Reset order alerts?"
        message="Sound, volume, buzz length and vibration will go back to the recommended defaults."
        confirmText="Reset"
        cancelText="Cancel"
        isDestructive
        onConfirm={resetDefaults}
        onClose={() => setConfirmReset(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    minWidth: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    justifyContent: 'center',
  },
  resetText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  disabled: { opacity: 0.5 },
  testBtn: { height: 52, marginTop: 4 },
  testHint: { fontSize: 12, color: Colors.textSubtle, textAlign: 'center', marginTop: 8 },
});
