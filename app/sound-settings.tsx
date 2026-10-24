import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
  PanResponder,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import {
  Bell,
  Volume2,
  VolumeX,
  Clock,
  Smartphone,
  CheckCircle2,
  Receipt,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Volume1,
  Save,
  Check,
  Sparkles,
  Info,
  ShieldCheck,
  Sliders,
  Volume,
  Lightbulb,
  Minus,
  Plus,
} from 'lucide-react-native';
import {
  playOrderBuzzSound,
  stopOrderBuzzSound,
  getSoundSettings,
  saveSoundSettings,
  SoundSettings,
  DEFAULT_SOUND_SETTINGS,
} from '../services/sound.service';

/**
 * Custom Interactive Slider with Draggable Thumb, Track Tapping, and Stepper Controls
 */
interface InteractiveSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  activeColor?: string;
  leftLabel?: string;
  rightLabel?: string;
}

const InteractiveSlider: React.FC<InteractiveSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  activeColor = Colors.primary,
  leftLabel,
  rightLabel,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);

  const calculateValueFromX = (x: number) => {
    if (trackWidth <= 0) return value;
    const clampedX = Math.max(0, Math.min(x, trackWidth));
    const ratio = clampedX / trackWidth;
    const rawVal = min + ratio * (max - min);
    const steppedVal = Math.round(rawVal / step) * step;
    const precision = step < 1 ? 2 : 0;
    const clampedVal = Math.min(max, Math.max(min, Number(steppedVal.toFixed(precision))));
    return clampedVal;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const val = calculateValueFromX(evt.nativeEvent.locationX);
        onChange(val);
      },
      onPanResponderMove: (evt) => {
        const val = calculateValueFromX(evt.nativeEvent.locationX);
        onChange(val);
      },
    })
  ).current;

  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  const handleDecrement = () => {
    const next = Math.max(min, Number((value - step).toFixed(step < 1 ? 2 : 0)));
    onChange(next);
  };

  const handleIncrement = () => {
    const next = Math.min(max, Number((value + step).toFixed(step < 1 ? 2 : 0)));
    onChange(next);
  };

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.controlRow}>
        {/* Stepper Minus */}
        <TouchableOpacity
          style={sliderStyles.stepperBtn}
          onPress={handleDecrement}
          disabled={value <= min}
          activeOpacity={0.7}
        >
          <Minus size={15} color={value <= min ? '#CBD5E1' : '#475569'} />
        </TouchableOpacity>

        {/* Horizontal Interactive Track */}
        <View
          style={sliderStyles.trackTouchArea}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          {/* Base Inactive Track */}
          <View style={sliderStyles.trackBackground} />

          {/* Active Colored Fill Track */}
          <View
            style={[
              sliderStyles.trackActive,
              { width: `${percentage}%`, backgroundColor: activeColor },
            ]}
          />

          {/* Draggable Circle Thumb */}
          <View
            style={[
              sliderStyles.thumb,
              {
                left: `${percentage}%`,
                borderColor: activeColor,
              },
            ]}
          >
            <View style={[sliderStyles.thumbInnerDot, { backgroundColor: activeColor }]} />
          </View>
        </View>

        {/* Stepper Plus */}
        <TouchableOpacity
          style={sliderStyles.stepperBtn}
          onPress={handleIncrement}
          disabled={value >= max}
          activeOpacity={0.7}
        >
          <Plus size={15} color={value >= max ? '#CBD5E1' : '#475569'} />
        </TouchableOpacity>
      </View>

      {/* Min & Max Range Labels */}
      {(leftLabel || rightLabel) && (
        <View style={sliderStyles.labelsRow}>
          <Text style={sliderStyles.rangeLabel}>{leftLabel || `${min}`}</Text>
          <Text style={sliderStyles.rangeLabel}>{rightLabel || `${max}`}</Text>
        </View>
      )}
    </View>
  );
};

export default function SoundSettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [persistedSettings, setPersistedSettings] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [isTestingSound, setIsTestingSound] = useState(false);
  const [testTimeout, setTestTimeout] = useState<any>(null);

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(persistedSettings);

  useEffect(() => {
    loadSettings();
    return () => {
      stopOrderBuzzSound().catch(() => {});
      if (testTimeout) clearTimeout(testTimeout);
    };
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await getSoundSettings();
      setSettings(data);
      setPersistedSettings(data);
    } catch (e) {
      console.warn('[SoundSettings] Failed to load settings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = <K extends keyof SoundSettings>(key: K, val: SoundSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await saveSoundSettings(settings);
      setPersistedSettings(settings);
      setSaveSuccess(true);
      showToast({
        title: 'Sound Settings Saved',
        message: 'Alert volume, buzzer duration, and trigger preferences updated.',
        type: 'success',
      });
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      showToast({
        title: 'Save Error',
        message: 'Failed to save sound settings. Please try again.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setSettings(persistedSettings);
    showToast({
      title: 'Changes Discarded',
      message: 'Reverted to last saved settings.',
      type: 'info',
    });
  };

  const handleTestOrderBuzz = async () => {
    if (!settings.enabled) {
      showToast({
        title: 'Master Audio Muted',
        message: 'Enable Master Sound Alerts switch above to test audio buzzer.',
        type: 'info',
      });
      return;
    }

    if (isTestingSound) {
      if (testTimeout) clearTimeout(testTimeout);
      await stopOrderBuzzSound();
      setIsTestingSound(false);
    } else {
      setIsTestingSound(true);
      await playOrderBuzzSound(settings.durationSeconds * 1000);
      const timer = setTimeout(() => {
        setIsTestingSound(false);
      }, settings.durationSeconds * 1000 + 300);
      setTestTimeout(timer);
    }
  };

  const handleResetDefaults = () => {
    Alert.alert(
      'Reset Sound Settings',
      'Restore all sound, buzzer durations, and alert triggers to factory defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to Defaults',
          style: 'destructive',
          onPress: async () => {
            await stopOrderBuzzSound();
            setIsTestingSound(false);
            setSettings(DEFAULT_SOUND_SETTINGS);
            try {
              await saveSoundSettings(DEFAULT_SOUND_SETTINGS);
              setPersistedSettings(DEFAULT_SOUND_SETTINGS);
              setSaveSuccess(false);
              showToast({
                title: 'Restored to Defaults',
                message: 'Sound alert settings have been reset to factory recommendations.',
                type: 'info',
              });
            } catch (e) {
              console.warn('Error resetting sound settings:', e);
            }
          },
        },
      ]
    );
  };

  const durationPresets = [
    { label: '3s', sub: 'Short', value: 3 },
    { label: '5s', sub: 'Standard', value: 5, badge: 'DEFAULT' },
    { label: '10s', sub: 'Busy Shift', value: 10 },
    { label: '15s', sub: 'High Noise', value: 15, badge: 'KITCHEN' },
  ];

  const volumePresets = [
    { label: '30%', sub: 'Quiet', value: 0.3 },
    { label: '50%', sub: 'Medium', value: 0.5 },
    { label: '70%', sub: 'Loud', value: 0.7 },
    { label: '100%', sub: 'Maximum', value: 1.0, badge: 'RECOMMENDED' },
  ];

  const volumePercent = Math.round(settings.volume * 100);

  const getVolumeBadge = () => {
    if (volumePercent >= 90) return { label: 'MAXIMUM LOUD', color: '#059669', bg: '#D1FAE5' };
    if (volumePercent >= 60) return { label: 'BALANCED LOUD', color: '#2563EB', bg: '#DBEAFE' };
    return { label: 'SOFT / QUIET', color: '#D97706', bg: '#FEF3C7' };
  };

  const getDurationBadge = () => {
    if (settings.durationSeconds >= 12) return { label: 'CONTINUOUS ALARM', color: '#DC2626', bg: '#FEE2E2' };
    if (settings.durationSeconds >= 8) return { label: 'EXTENDED CHIME', color: '#7C3AED', bg: '#EDE9FE' };
    return { label: 'STANDARD RING', color: '#059669', bg: '#D1FAE5' };
  };

  const volBadge = getVolumeBadge();
  const durBadge = getDurationBadge();

  return (
    <View style={styles.container}>
      <Header
        title="Sound & Buzz Alerts"
        showBackButton={true}
        rightElement={
          <TouchableOpacity
            style={styles.resetHeaderBtn}
            onPress={handleResetDefaults}
            activeOpacity={0.7}
          >
            <RotateCcw size={15} color={Colors.textMuted} />
            <Text style={styles.resetHeaderBtnText}>Reset</Text>
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading sound preferences...</Text>
        </View>
      ) : (
        <View style={styles.contentWrapper}>
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingHorizontal: isTablet ? 24 : 16,
                  maxWidth: 840,
                  alignSelf: 'center',
                  width: '100%',
                  paddingBottom: hasChanges || saveSuccess ? 120 : 100,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {/* Unsaved Changes Notification Banner */}
              {hasChanges && (
                <View style={styles.unsavedAlertBanner}>
                  <View style={styles.unsavedDot} />
                  <Text style={styles.unsavedAlertText}>
                    You have unsaved changes. Tap "Save Sound Settings" below to apply.
                  </Text>
                </View>
              )}

              {/* ========================================================================= */}
              {/* 1. MASTER AUDIO CONTROLLER (HERO STATUS CARD)                             */}
              {/* ========================================================================= */}
              <View
                style={[
                  styles.masterCard,
                  settings.enabled ? styles.masterCardActive : styles.masterCardMuted,
                ]}
              >
                <View style={styles.masterHeader}>
                  <View
                    style={[
                      styles.iconBadgeLarge,
                      {
                        backgroundColor: settings.enabled ? '#ECFDF5' : '#FEF2F2',
                        borderColor: settings.enabled ? '#A7F3D0' : '#FECACA',
                      },
                    ]}
                  >
                    {settings.enabled ? (
                      <Bell size={24} color="#059669" />
                    ) : (
                      <VolumeX size={24} color="#DC2626" />
                    )}
                  </View>

                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={styles.masterTitle}>Master Sound Alerts</Text>
                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor: settings.enabled ? '#D1FAE5' : '#FEE2E2',
                            borderColor: settings.enabled ? '#6EE7B7' : '#FCA5A5',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: settings.enabled ? '#059669' : '#DC2626' },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: settings.enabled ? '#065F46' : '#991B1B' },
                          ]}
                        >
                          {settings.enabled ? 'ACTIVE & MONITORING' : 'ALL ALERTS MUTED'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.masterSub}>
                      {settings.enabled
                        ? 'Sound and vibration on incoming orders'
                        : 'Audio alerts are turned off. Kitchen staff will not hear incoming orders!'}
                    </Text>
                  </View>

                  <Switch
                    value={settings.enabled}
                    onValueChange={(val) => updateSetting('enabled', val)}
                    trackColor={{ true: '#A7F3D0', false: '#CBD5E1' }}
                    thumbColor={settings.enabled ? '#059669' : '#94A3B8'}
                  />
                </View>

                {/* Inline Test Trigger Unit */}
                <View style={styles.testUnitRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Volume2 size={16} color={settings.enabled ? '#065F46' : Colors.textMuted} />
                      <Text style={styles.testLabel}>Speaker & Buzzer Check</Text>
                    </View>
                    <Text style={styles.testSub}>
                      {isTestingSound
                        ? `Playing alarm chime (${settings.durationSeconds}s @ ${volumePercent}% vol)...`
                        : settings.enabled
                          ? 'Tap to verify volume & buzzer sound'
                          : 'Enable Master Sound above to test buzzer tone'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.testButton,
                      isTestingSound && styles.testButtonActive,
                      !settings.enabled && styles.testButtonDisabled,
                    ]}
                    onPress={handleTestOrderBuzz}
                    disabled={!settings.enabled}
                    activeOpacity={0.8}
                  >
                    {isTestingSound ? (
                      <>
                        <VolumeX size={15} color="#FFFFFF" />
                        <Text style={styles.testButtonText}>Stop Test</Text>
                      </>
                    ) : (
                      <>
                        <Volume2 size={15} color="#FFFFFF" />
                        <Text style={styles.testButtonText}>Test Buzz</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* ========================================================================= */}
              {/* 2. ALERT VOLUME LEVEL (SLIDER & PRESETS)                                  */}
              {/* ========================================================================= */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.iconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <Volume2 size={18} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Alert Volume</Text>
                    <Text style={styles.sectionSub}>Slide to adjust loudness </Text>
                  </View>

                  {/* Live Value Indicator Badge */}
                  <View style={[styles.sliderValueBadge, { backgroundColor: volBadge.bg }]}>
                    <Text style={[styles.sliderValueBadgeText, { color: volBadge.color }]}>
                      {volumePercent}% • {volBadge.label}
                    </Text>
                  </View>
                </View>

                {/* Volume Interactive Slider */}
                <InteractiveSlider
                  value={settings.volume}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  onChange={(val) => updateSetting('volume', val)}
                  activeColor="#2563EB"
                  leftLabel="10% (Whisper)"
                  rightLabel="100% (Max Loud)"
                />


              </View>

              {/* ========================================================================= */}
              {/* 3. BUZZER DURATION CONTROLLER (SLIDER & PRESETS)                          */}
              {/* ========================================================================= */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.iconBadge, { backgroundColor: '#FDF4FF', borderColor: '#F5D0FE' }]}>
                    <Clock size={18} color="#9333EA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Ring Duration</Text>
                    <Text style={styles.sectionSub}>Slide to set how long alarm loops until noticed</Text>
                  </View>

                  {/* Live Duration Indicator Badge */}
                  {/* <View style={[styles.sliderValueBadge, { backgroundColor: durBadge.bg }]}>
                  <Text style={[styles.sliderValueBadgeText, { color: durBadge.color }]}>
                    {settings.durationSeconds}s • {durBadge.label}
                  </Text>
                </View> */}
                </View>

                {/* Duration Interactive Slider */}
                <InteractiveSlider
                  value={settings.durationSeconds}
                  min={2}
                  max={20}
                  step={1}
                  onChange={(val) => updateSetting('durationSeconds', val)}
                  activeColor="#9333EA"
                  leftLabel="2 Seconds"
                  rightLabel="20 Seconds"
                />

                {/* Quick Preset Buttons */}
                <View style={styles.presetRow}>
                  {durationPresets.map((opt) => {
                    const isSelected = settings.durationSeconds === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.presetChip, isSelected && styles.presetChipSelectedPurple]}
                        onPress={() => updateSetting('durationSeconds', opt.value)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            isSelected && styles.presetChipTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {opt.badge && (
                          <View style={[styles.tinyBadge, isSelected && styles.tinyBadgeSelected]}>
                            <Text style={[styles.tinyBadgeText, isSelected && styles.tinyBadgeTextSelected]}>
                              {opt.badge}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ========================================================================= */}
              {/* 4. PHYSICAL VIBRATION & HAPTICS                                           */}
              {/* ========================================================================= */}
              <View style={styles.sectionCard}>
                <View style={styles.toggleRow}>
                  <View style={[styles.iconBadge, { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' }]}>
                    <Smartphone size={18} color="#EA580C" />
                  </View>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.sectionTitle}>Physical Vibration Motor</Text>
                    <Text style={styles.sectionSub}>
                      Pulse device hardware vibration motor alongside audio during alarms
                    </Text>
                  </View>
                  <Switch
                    value={settings.vibrationEnabled}
                    onValueChange={(val) => updateSetting('vibrationEnabled', val)}
                    trackColor={{ true: '#FED7AA', false: '#CBD5E1' }}
                    thumbColor={settings.vibrationEnabled ? '#EA580C' : '#94A3B8'}
                  />
                </View>
              </View>

              {/* ========================================================================= */}
              {/* 5. EVENT TRIGGERS                                                         */}
              {/* ========================================================================= */}
              <Text style={styles.groupTitle}>EVENT TRIGGERS & NOTIFICATIONS</Text>

              <View style={styles.sectionCard}>
                {/* Trigger 1: Delivery & Takeaway Orders */}
                <View style={styles.toggleRow}>
                  <View style={[styles.iconBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Receipt size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.toggleTitle}>Delivery & Takeaway Orders</Text>
                      <View style={[styles.triggerPill, { backgroundColor: settings.notifyOrders ? '#DCFCE7' : '#F1F5F9' }]}>
                        <Text style={[styles.triggerPillText, { color: settings.notifyOrders ? '#166534' : '#64748B' }]}>
                          {settings.notifyOrders ? 'ACTIVE' : 'OFF'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.toggleSub}>Loud chime & alert popup when customer places an order</Text>
                  </View>
                  <Switch
                    value={settings.notifyOrders}
                    onValueChange={(val) => updateSetting('notifyOrders', val)}
                    trackColor={{ true: '#A7F3D0', false: '#CBD5E1' }}
                    thumbColor={settings.notifyOrders ? '#059669' : '#94A3B8'}
                  />
                </View>

                <View style={styles.divider} />

                {/* Trigger 2: Table Reservations */}
                <View style={styles.toggleRow}>
                  <View style={[styles.iconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <Calendar size={18} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.toggleTitle}>Table Reservations</Text>
                      <View style={[styles.triggerPill, { backgroundColor: settings.notifyBookings ? '#DBEAFE' : '#F1F5F9' }]}>
                        <Text style={[styles.triggerPillText, { color: settings.notifyBookings ? '#1E40AF' : '#64748B' }]}>
                          {settings.notifyBookings ? 'ACTIVE' : 'OFF'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.toggleSub}>Sound alarm when customer books a dine-in table</Text>
                  </View>
                  <Switch
                    value={settings.notifyBookings}
                    onValueChange={(val) => updateSetting('notifyBookings', val)}
                    trackColor={{ true: '#BFDBFE', false: '#CBD5E1' }}
                    thumbColor={settings.notifyBookings ? '#2563EB' : '#94A3B8'}
                  />
                </View>

                <View style={styles.divider} />

                {/* Trigger 3: Cancellations & Emergency Actions */}
                <View style={styles.toggleRow}>
                  <View style={[styles.iconBadge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                    <AlertTriangle size={18} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.toggleTitle}>Cancellations & Urgent Alerts</Text>
                      <View style={[styles.triggerPill, { backgroundColor: settings.notifyCancellations ? '#FEE2E2' : '#F1F5F9' }]}>
                        <Text style={[styles.triggerPillText, { color: settings.notifyCancellations ? '#991B1B' : '#64748B' }]}>
                          {settings.notifyCancellations ? 'ACTIVE' : 'OFF'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.toggleSub}>Urgent alarm if order is cancelled or requires immediate action</Text>
                  </View>
                  <Switch
                    value={settings.notifyCancellations}
                    onValueChange={(val) => updateSetting('notifyCancellations', val)}
                    trackColor={{ true: '#FECACA', false: '#CBD5E1' }}
                    thumbColor={settings.notifyCancellations ? '#DC2626' : '#94A3B8'}
                  />
                </View>
              </View>

              {/* ========================================================================= */}
              {/* 6. KITCHEN BEST-PRACTICE ADVICE CARD                                      */}
              {/* ========================================================================= */}

            </ScrollView>

            {/* ========================================================================= */}
            {/* STICKY BOTTOM SAVE ACTION BAR                                             */}
            {/* ========================================================================= */}
            <View style={[styles.bottomBarContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={[styles.bottomBarInner, { maxWidth: isTablet ? 840 : '100%' }]}>
                {hasChanges && (
                  <TouchableOpacity
                    style={styles.discardButton}
                    onPress={handleDiscard}
                    disabled={isSaving}
                    activeOpacity={0.7}
                  >
                    <RotateCcw size={16} color={Colors.textMuted} />
                    <Text style={styles.discardButtonText}>Discard</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    !hasChanges && !saveSuccess && styles.saveButtonMuted,
                    saveSuccess && styles.saveButtonSuccess,
                    isSaving && styles.saveButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={isSaving || (!hasChanges && !saveSuccess)}
                  activeOpacity={0.85}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                  ) : saveSuccess ? (
                    <CheckCircle2 size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  ) : (
                    <Save size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  )}
                  <Text style={styles.saveButtonText}>
                    {isSaving
                      ? 'Saving Changes...'
                      : saveSuccess
                        ? 'Settings Saved Successfully!'
                        : hasChanges
                          ? 'Save Settings'
                          : 'Saved Settings'}
                  </Text>
                </TouchableOpacity>
              </View>
          </View>
        </View>
      )}
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  trackTouchArea: {
    flex: 1,
    height: 36,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBackground: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    width: '100%',
  },
  trackActive: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 4,
  },
  thumb: {
    position: 'absolute',
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    marginLeft: -12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  thumbInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 48,
  },
  rangeLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Crisp Slate-50 background
  },
  contentWrapper: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  resetHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resetHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  scrollContent: {
    paddingTop: 16,
    gap: 14,
  },
  unsavedAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  unsavedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D97706',
  },
  unsavedAlertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    lineHeight: 16,
  },
  masterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1.5,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  masterCardActive: {
    borderColor: '#A7F3D0', // Mint border
  },
  masterCardMuted: {
    borderColor: '#FECACA', // Light red border
  },
  masterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadgeLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
  },
  masterTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  masterSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  testUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  testLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  testSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderRadius: 11,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  testButtonActive: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  testButtonDisabled: {
    opacity: 0.45,
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  testButtonText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  sliderValueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
  },
  sliderValueBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  presetChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipSelectedBlue: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  presetChipSelectedPurple: {
    backgroundColor: '#9333EA',
    borderColor: '#9333EA',
    shadowColor: '#9333EA',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  presetChipTextSelected: {
    color: '#FFFFFF',
  },
  tinyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  tinyBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  tinyBadgeText: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#92400E',
  },
  tinyBadgeTextSelected: {
    color: '#FFFFFF',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  toggleSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
    lineHeight: 16,
  },
  triggerPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  triggerPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
    marginLeft: 4,
    marginTop: 6,
  },
  infoBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  infoBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  infoBoxTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
  infoText: {
    fontSize: 11.5,
    color: '#78350F',
    lineHeight: 17,
  },

  // Bottom Save Dock Bar
  bottomBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomBarInner: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  discardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  discardButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  saveButtonMuted: {
    backgroundColor: '#059669', // Emerald when in sync / ready
    shadowColor: '#059669',
    opacity: 0.85,
  },
  saveButtonSuccess: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
