/**
 * Top bar for full-screen work modes (Floor; same look as the POS terminal):
 * brand badge + LIVE, title and subtitle, a clock, extra actions, and a press-and-hold Exit
 * so a stray tap can't close the screen in the middle of service.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, type LucideIcon } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useNow } from '../utils/order-timing';

function Clock() {
  const now = new Date(useNow());
  return <Text style={styles.clock}>{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</Text>;
}

interface Props {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  /** Buttons before Exit (Reports, Setup…) */
  actions?: React.ReactNode;
  /** A quick tap on Exit: explain how to leave */
  onExitHint: () => void;
  /** Press and hold Exit */
  onExit: () => void;
  exitLabel?: string;
}

export function ModeTopBar({ title, subtitle, icon: Icon, actions, onExitHint, onExit, exitLabel = 'Exit' }: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const roomy = width >= 900;
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right }]}>
      <View style={styles.brand}>
        <View style={styles.brandIcon}>
          <Icon size={20} color="#FFFFFF" />
        </View>
        <View style={styles.brandText}>
          <View style={styles.brandRow}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.live}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {roomy ? <Clock /> : null}
      </View>

      <View style={styles.actions}>
        {actions}
        <TouchableOpacity
          onPress={onExitHint}
          onLongPress={onExit}
          delayLongPress={700}
          style={styles.exitBtn}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={exitLabel}
          accessibilityHint="Press and hold to exit"
        >
          <LogOut size={18} color={Colors.text} />
          {roomy ? <Text style={styles.exitText}>Hold to exit</Text> : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  brandIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandText: { flexShrink: 1, minWidth: 0 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: 1, flexShrink: 1 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 10.5, fontWeight: '800', color: '#047857', letterSpacing: 0.6 },
  subtitle: { fontSize: 12.5, color: '#64748B', fontWeight: '600', marginTop: 1 },
  clock: { fontSize: 20, fontWeight: '800', color: '#64748B', fontVariant: ['tabular-nums'], marginLeft: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  exitBtn: { height: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  exitText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
});
