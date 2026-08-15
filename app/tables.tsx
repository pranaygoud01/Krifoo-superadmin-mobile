import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Plus, Edit2, Trash2, X, Check, Users } from 'lucide-react-native';

interface Table {
  _id: string;
  tableNumber: string;
  capacity: number;
  isActive: boolean;
}

export default function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);

  // Form State
  const [formState, setFormState] = useState({
    tableNumber: '',
    capacity: '',
  });

  const loadTables = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getTables();
      if (res.success && res.data) {
        setTables(res.data);
      }
    } catch (e) {
      console.error('Failed loading tables:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  const openAddModal = () => {
    setEditingTable(null);
    setFormState({ tableNumber: '', capacity: '' });
    setModalVisible(true);
  };

  const openEditModal = (table: Table) => {
    setEditingTable(table);
    setFormState({
      tableNumber: table.tableNumber,
      capacity: table.capacity.toString(),
    });
    setModalVisible(true);
  };

  const handleToggleStatus = async (table: Table) => {
    try {
      const res = await restaurantOwnerService.toggleTableStatus(table._id);
      if (res.success) {
        setTables((prev) =>
          prev.map((t) => (t._id === table._id ? { ...t, isActive: !t.isActive } : t))
        );
      } else {
        Alert.alert('Error', res.message || 'Failed to update table status.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete this table?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await restaurantOwnerService.deleteTable(tableId);
          if (res.success) {
            Alert.alert('Success', 'Table deleted successfully.');
            loadTables();
          } else {
            Alert.alert('Error', res.message || 'Failed to delete table.');
          }
        },
      },
    ]);
  };

  const handleSaveTable = async () => {
    if (!formState.tableNumber.trim()) return Alert.alert('Error', 'Table number/name is required.');
    if (!formState.capacity.trim() || isNaN(Number(formState.capacity)) || Number(formState.capacity) <= 0) {
      return Alert.alert('Error', 'Please enter a valid guest capacity.');
    }

    setSubmitting(true);
    try {
      const payload = {
        tableNumber: formState.tableNumber.trim(),
        capacity: Number(formState.capacity),
      };

      let res;
      if (editingTable) {
        res = await restaurantOwnerService.updateTable(editingTable._id, payload);
      } else {
        res = await restaurantOwnerService.addTable(payload);
      }

      if (res.success) {
        setModalVisible(false);
        loadTables();
      } else {
        Alert.alert('Error', res.message || 'Failed to save table details.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Dining Tables" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading tables...</Text>
        </View>
      ) : tables.length === 0 ? (
        <View style={styles.centerBox}>
          <Users size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Tables Configured</Text>
          <Text style={styles.emptySub}>
            Create your dining layout by adding tables with capacities.
          </Text>
          <TouchableOpacity style={styles.createBtn} onPress={openAddModal}>
            <Text style={styles.createBtnText}>Add First Table</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.tableCard}>
              <View style={styles.tableInfo}>
                <Text style={styles.tableNum}>Table {item.tableNumber}</Text>
                <Text style={styles.tableCap}>Capacity: {item.capacity} Guests</Text>
              </View>

              <View style={styles.cardActions}>
                <View style={styles.switchRow}>
                  <Text style={[styles.statusText, item.isActive && { color: Colors.success }]}>
                    {item.isActive ? 'Active' : 'Inactive'}
                  </Text>
                  <Switch
                    value={item.isActive}
                    onValueChange={() => handleToggleStatus(item)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={item.isActive ? Colors.primary : Colors.textSubtle}
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                  />
                </View>

                <View style={styles.buttons}>
                  <TouchableOpacity style={styles.btnEdit} onPress={() => openEditModal(item)}>
                    <Edit2 size={13} color={Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnDelete} onPress={() => handleDeleteTable(item._id)}>
                    <Trash2 size={13} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Floating Add FAB */}
      {tables.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.85}>
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Add / Edit Table Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTable ? 'Edit Dining Table' : 'Add New Table'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Table Number / Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 10 or Bar-A"
                  value={formState.tableNumber}
                  onChangeText={(val) => setFormState((prev) => ({ ...prev, tableNumber: val }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Max Seating Capacity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 4"
                  keyboardType="numeric"
                  value={formState.capacity}
                  onChangeText={(val) => setFormState((prev) => ({ ...prev, capacity: val }))}
                />
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
                disabled={submitting}
                onPress={handleSaveTable}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.saveBtnText}>Save Table</Text>
                    <Check size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
    lineHeight: 18,
    marginBottom: 20,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  tableCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableInfo: {
    flex: 1,
  },
  tableNum: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  tableCap: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  cardActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  btnEdit: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  btnDelete: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: Colors.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  closeBtn: {
    padding: 6,
  },
  modalBody: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: Colors.text,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
