/**
 * Shared top bar for detail screens opened from Settings (and elsewhere):
 *   [ ← Back ] [ 🏠 Home ]  Title / subtitle  ………  [ optional action ]
 * Matches the Home-button + white-bar pattern used on the Orders, Stores, Users, Menu and Settings tabs.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, House } from 'lucide-react-native';
import { Colors } from '../constants/colors';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Defaults to showing Back whenever there is a screen to go back to. */
  showBackButton?: boolean;
  /** Right-side action (Save, Add, Reset…). `rightAction` is accepted for compatibility with the old Header. */
  rightElement?: React.ReactNode;
  rightAction?: React.ReactNode;
  /** Custom back behaviour (e.g. leave an in-screen editor). Always shows the back button. */
  onBack?: () => void;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  showBackButton,
  rightElement,
  rightAction,
  onBack,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const canGoBack = router.canGoBack();
  const showBack = onBack ? true : (showBackButton ?? true) && canGoBack;
  const right = rightElement ?? rightAction;

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      <View style={[styles.row, { paddingHorizontal: isTablet ? 24 : 16 }]}>
        {showBack && (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (onBack ? onBack() : router.back())}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
        )}
        {/* <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => router.navigate('/(tabs)')}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
        >
          <House size={20} color={Colors.primary} />
        </TouchableOpacity> */}

        <View style={styles.titleBlock}>
          <Text style={[styles.title, isTablet && styles.titleTablet]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingBottom: 10,
  },
  row: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  homeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryLight,
  },
  titleBlock: { flex: 1, minWidth: 0, marginLeft: 4 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  titleTablet: { fontSize: 20 },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  right: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
