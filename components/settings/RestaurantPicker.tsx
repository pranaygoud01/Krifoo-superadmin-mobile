/**
 * Super-admin restaurant selector used by settings screens that edit one restaurant at a time
 * (website delivery, opening hours). Shows the current restaurant and opens a searchable list.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, FlatList, Platform } from 'react-native';
import { Store, ChevronDown, Search, X, Check } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { Restaurant } from '../../types';

export function RestaurantPicker({
  restaurants,
  selectedId,
  selectedName,
  onSelect,
}: {
  restaurants: Restaurant[];
  selectedId?: string;
  selectedName?: string;
  onSelect: (r: Restaurant) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = restaurants.filter((r) => (r.restaurantName || '').toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Choose restaurant">
        <View style={styles.icon}>
          <Store size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Restaurant</Text>
          <Text style={styles.value} numberOfLines={1}>
            {selectedName || 'Choose a restaurant'}
          </Text>
        </View>
        <ChevronDown size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={styles.sheet}>
            <View style={styles.head}>
              <Text style={styles.title}>Choose restaurant</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn} accessibilityLabel="Close">
                <X size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.search}>
              <Search size={16} color={Colors.textSubtle} />
              <TextInput
                style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                placeholder="Search restaurants"
                placeholderTextColor={Colors.textSubtle}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(r) => r._id}
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>No restaurants match.</Text>}
              renderItem={({ item }) => {
                const active = item._id === selectedId;
                return (
                  <TouchableOpacity
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => {
                      setOpen(false);
                      onSelect(item);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.rowText, active && styles.rowTextActive]} numberOfLines={1}>
                      {item.restaurantName}
                    </Text>
                    {active && <Check size={16} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, color: Colors.textMuted },
  value: { fontSize: 15, fontWeight: '800', color: Colors.text },
  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 28, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 460, backgroundColor: Colors.background, borderRadius: 20, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: Colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: 0 },
  empty: { fontSize: 13, color: Colors.textSubtle, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: 10 },
  rowActive: { backgroundColor: Colors.primaryLight },
  rowText: { flex: 1, fontSize: 15, color: Colors.text },
  rowTextActive: { color: Colors.primaryDark, fontWeight: '800' },
});
