/**
 * Bottom sheet that finds a real address (Google geocoding via GET /api/location/search) and
 * returns it with coordinates. Used by Store profile so the store's map location is exact —
 * delivery distances and fees are calculated from it.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Search, X, SearchX } from 'lucide-react-native';

import { Colors } from '../../constants/colors';
import { locationService, AddressMatch } from '../../services/location.service';
import { KEYBOARD_BEHAVIOR } from '../../utils/keyboard';

export function AddressFinderSheet({
  visible,
  onClose,
  onPick,
  initialQuery = '',
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (match: AddressMatch) => void;
  /** Pre-fills the search, e.g. with the store's current postcode */
  initialQuery?: string;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<AddressMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setResults([]);
      setError(null);
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search; ignores responses that arrive after a newer query
  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await locationService.searchAddress(q);
        if (id !== requestId.current) return;
        if (res.success) {
          setResults(res.data);
          setError(null);
        } else {
          setResults([]);
          setError(res.message || 'Address search is unavailable right now.');
        }
      } catch (e: any) {
        if (id === requestId.current) setError(e?.message || 'Could not reach the server.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={KEYBOARD_BEHAVIOR}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Find your store’s address</Text>
              <Text style={styles.subtitle}>Search by postcode or street. We’ll pin the exact map location.</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <X size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.search}>
            <Search size={18} color={Colors.textSubtle} />
            <TextInput
              style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
              placeholder="e.g. CB1 2AD or 12 Mill Road"
              placeholderTextColor={Colors.textSubtle}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              autoCapitalize="characters"
              returnKeyType="search"
              accessibilityLabel="Search address"
            />
            {loading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn} accessibilityLabel="Clear">
                <X size={12} color="#FFFFFF" strokeWidth={3} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            {error ? (
              <Text style={styles.message}>{error}</Text>
            ) : query.trim().length < 3 ? (
              <Text style={styles.message}>Type at least 3 characters.</Text>
            ) : !loading && results.length === 0 ? (
              <View style={styles.empty}>
                <SearchX size={24} color={Colors.textSubtle} />
                <Text style={styles.message}>No matching addresses. Try the full postcode.</Text>
              </View>
            ) : (
              results.map((m, i) => (
                <TouchableOpacity
                  key={m.placeId}
                  style={[styles.row, i > 0 && styles.rowBorder]}
                  onPress={() => {
                    onPick(m);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={m.label}
                >
                  <View style={styles.rowIcon}>
                    <MapPin size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {m.line1}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={2}>
                      {m.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 24, 28, 0.45)' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    flexShrink: 1,
    paddingTop: 18,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, color: Colors.text, paddingVertical: 0 },
  clearBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.textSubtle, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, minHeight: 160 },
  message: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingVertical: 20 },
  empty: { alignItems: 'center', paddingTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
});
