import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
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
} from 'lucide-react-native';
import {
  playOrderBuzzSound,
  stopOrderBuzzSound,
  getSoundSettings,
  saveSoundSettings,
  SoundSettings,
  DEFAULT_SOUND_SETTINGS,
} from '../services/sound.service';

export default function SoundSettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [settings, setSettings] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const [isTestingSound, setIsTestingSound] = useState(false);
  const [testTimeout, setTestTimeout] = useState<any>(null);

  useEffect(() => {
    loadSettings();
    return () => {
      stopOrderBuzzSound().catch(() => {});
      if (testTimeout) clearTimeout(testTimeout);
    };
  }, []);

  const loadSettings = async () => {
    const data = await getSoundSettings();
    setSettings(data);
  };

  const updateSetting = async (key: keyof SoundSettings, val: any) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    await saveSoundSettings({ [key]: val });
  };

  const handleTestOrderBuzz = async () => {
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
      'Reset all sound and buzzer alerts to factory defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await stopOrderBuzzSound();
            setIsTestingSound(false);
            setSettings(DEFAULT_SOUND_SETTINGS);
            await saveSoundSettings(DEFAULT_SOUND_SETTINGS);
            Alert.alert('Reset Complete', 'Sound settings have been restored to defaults.');
          },
        },
      ]
    );
  };

  const durationOptions = [
    { label: '3s', sub: 'Short', value: 3 },
    { label: '5s', sub: 'Default', value: 5 },
    { label: '10s', sub: 'Long', value: 10 },
    { label: '15s', sub: 'Max', value: 15 },
  ];

  const volumeOptions = [
    { label: '30%', sub: 'Soft', value: 0.3 },
    { label: '70%', sub: 'Medium', value: 0.7 },
    { label: '100%', sub: 'Loud', value: 1.0 },
  ];

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
            <RotateCcw size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Master Audio Controller Card */}
        <View style={styles.masterCard}>
          <View style={styles.masterHeader}>
            <View
              style={[
                styles.iconBadgeLarge,
                { backgroundColor: settings.enabled ? Colors.primaryLight : '#F1F5F9' },
              ]}
            >
              {settings.enabled ? (
                <Bell size={22} color={Colors.primary} />
              ) : (
                <VolumeX size={22} color={Colors.textMuted} />
              )}
            </View>

            <View style={{ flex: 1, marginRight: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.masterTitle}>Master Sound Alerts</Text>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: settings.enabled ? '#ECFDF5' : '#FEF2F2' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: settings.enabled ? '#065F46' : '#991B1B' },
                    ]}
                  >
                    {settings.enabled ? 'ACTIVE' : 'MUTED'}
                  </Text>
                </View>
              </View>
              <Text style={styles.masterSub}>
                Play loud chime & physical vibration for incoming orders and bookings
              </Text>
            </View>

            <Switch
              value={settings.enabled}
              onValueChange={(val) => updateSetting('enabled', val)}
              trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
              thumbColor={settings.enabled ? Colors.primary : Colors.textSubtle}
            />
          </View>

          {/* Test Chime Trigger */}
          <View style={styles.testRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.testLabel}>Test Alarm Sound</Text>
              <Text style={styles.testSub}>
                {isTestingSound
                  ? `Playing chime (${settings.durationSeconds}s @ ${Math.round(settings.volume * 100)}% vol)...`
                  : 'Verify volume and buzzer speaker output'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.testButton,
                isTestingSound && styles.testButtonActive,
                !settings.enabled && styles.testButtonDisabled,
              ]}
              onPress={handleTestOrderBuzz}
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

        {/* Volume Level Controller */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.iconBadge}>
              <Volume1 size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Alert Volume Level</Text>
              <Text style={styles.sectionSub}>Adjust sound output loudness</Text>
            </View>
          </View>

          <View style={styles.chipRow}>
            {volumeOptions.map((opt) => {
              const isSelected = settings.volume === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => updateSetting('volume', opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipTitle, isSelected && styles.chipTitleSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.chipSub, isSelected && styles.chipSubSelected]}>
                    {opt.sub}
                  </Text>
                  {isSelected && (
                    <View style={styles.chipCheck}>
                      <CheckCircle2 size={12} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Buzzer Duration Controller */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.iconBadge}>
              <Clock size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Buzzer Alert Duration</Text>
              <Text style={styles.sectionSub}>How long the audio alarm rings continuously</Text>
            </View>
          </View>

          <View style={styles.chipRow}>
            {durationOptions.map((opt) => {
              const isSelected = settings.durationSeconds === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => updateSetting('durationSeconds', opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipTitle, isSelected && styles.chipTitleSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.chipSub, isSelected && styles.chipSubSelected]}>
                    {opt.sub}
                  </Text>
                  {isSelected && (
                    <View style={styles.chipCheck}>
                      <CheckCircle2 size={12} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Physical Vibration Controller */}
        <View style={styles.sectionCard}>
          <View style={styles.toggleRow}>
            <View style={styles.iconBadge}>
              <Smartphone size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.sectionTitle}>Vibration & Haptics</Text>
              <Text style={styles.sectionSub}>Vibrate device motor during alarm triggers</Text>
            </View>
            <Switch
              value={settings.vibrationEnabled}
              onValueChange={(val) => updateSetting('vibrationEnabled', val)}
              trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
              thumbColor={settings.vibrationEnabled ? Colors.primary : Colors.textSubtle}
            />
          </View>
        </View>

        {/* Event Triggers Controller Card */}
        <Text style={styles.groupTitle}>ALERT TRIGGERS</Text>

        <View style={styles.sectionCard}>
          {/* New Orders */}
          <View style={styles.toggleRow}>
            <View style={styles.iconBadge}>
              <Receipt size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.toggleTitle}>Delivery & Takeaway Orders</Text>
              <Text style={styles.toggleSub}>Sound alarm when a new order is placed</Text>
            </View>
            <Switch
              value={settings.notifyOrders}
              onValueChange={(val) => updateSetting('notifyOrders', val)}
              trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
              thumbColor={settings.notifyOrders ? Colors.primary : Colors.textSubtle}
            />
          </View>

          <View style={styles.divider} />

          {/* Table Bookings */}
          <View style={styles.toggleRow}>
            <View style={styles.iconBadge}>
              <Calendar size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.toggleTitle}>Table Reservations</Text>
              <Text style={styles.toggleSub}>Sound alarm when a customer reserves a dining table</Text>
            </View>
            <Switch
              value={settings.notifyBookings}
              onValueChange={(val) => updateSetting('notifyBookings', val)}
              trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
              thumbColor={settings.notifyBookings ? Colors.primary : Colors.textSubtle}
            />
          </View>

          <View style={styles.divider} />

          {/* Cancellations */}
          <View style={styles.toggleRow}>
            <View style={styles.iconBadge}>
              <AlertTriangle size={18} color={Colors.danger} />
            </View>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.toggleTitle}>Cancellations & Warnings</Text>
              <Text style={styles.toggleSub}>Alert sound on order cancellations or emergency actions</Text>
            </View>
            <Switch
              value={settings.notifyCancellations}
              onValueChange={(val) => updateSetting('notifyCancellations', val)}
              trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
              thumbColor={settings.notifyCancellations ? Colors.primary : Colors.textSubtle}
            />
          </View>
        </View>

        {/* Info Note */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 <Text style={{ fontWeight: '700' }}>Kitchen Tip:</Text> Keep buzzer duration set to at least 5 seconds and maximum volume so kitchen staff notice orders over cooking equipment noise.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  resetHeaderBtn: {
    padding: 8,
    marginRight: 4,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  masterCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  masterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadgeLarge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  masterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  masterSub: {
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  testRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  testLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  testSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  testButtonActive: {
    backgroundColor: Colors.danger,
    shadowColor: Colors.danger,
  },
  testButtonDisabled: {
    opacity: 0.5,
  },
  testButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    position: 'relative',
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  chipTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  chipTitleSelected: {
    color: '#FFFFFF',
  },
  chipSub: {
    fontSize: 9.5,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 1,
  },
  chipSubSelected: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  chipCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  toggleSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 12,
  },
  groupTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    marginLeft: 4,
    marginTop: 4,
  },
  infoBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  infoText: {
    fontSize: 11.5,
    color: '#92400E',
    lineHeight: 16,
  },
});
