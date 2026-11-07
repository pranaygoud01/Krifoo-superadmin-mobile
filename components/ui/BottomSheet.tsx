/**
 * Form sheet: slides up on phones, centred card on tablets.
 * Keyboard-aware, closes with the Android back button, sticky footer for actions.
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Colors } from '../../constants/colors';

export function BottomSheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;

  return (
    <Modal visible={visible} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={[styles.backdrop, isTablet && styles.backdropTablet]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, isTablet && styles.sheetTablet, { maxHeight: height * (isTablet ? 0.88 : 0.92) }]}>
          {!isTablet && <View style={styles.handle} />}
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
              <X size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, { paddingBottom: isTablet ? 16 : Math.max(insets.bottom, 12) }]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  backdropTablet: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  sheetTablet: { width: 560, maxWidth: '100%', borderRadius: 20 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.cardBorder, marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 0 },
  bodyContent: { padding: 20 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
});
