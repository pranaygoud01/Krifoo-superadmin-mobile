import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Clock, Minus, Plus, X } from 'lucide-react-native';
import type { Order } from '../../types';
import { orderService } from '../../services/order.service';
import { useToast } from '../../context/ToastContext';
import { getOrderFulfillmentType } from '../../utils/order-fulfillment';
import { KEYBOARD_BEHAVIOR } from '../../utils/keyboard';

const MIN = 5;
const MAX = 300;
const STEP = 5;
const PRESETS = [15, 20, 30, 45, 60];

type Props = {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  /** Called after the server saved the new time, with the fields to merge into the order. */
  onSaved: (orderId: string, patch: Partial<Order>) => void;
};

/** One "Expected time" editor, shared by the Orders board and the order details screen/sheet. */
export function EditExpectedTimeModal({ visible, order, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const [value, setValue] = useState('30');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && order) setValue(String(order.expectedDeliveryTime || order.deliveryTime || 30));
  }, [visible, order]);

  if (!order) return null;

  const isDelivery = getOrderFulfillmentType(order) === 'delivery';
  const customerName =
    (typeof order.customerId === 'object' && order.customerId?.fullName) || order.customerDetails?.name || 'Customer';
  const current = parseInt(value, 10);
  const valid = !isNaN(current) && current >= MIN && current <= MAX;

  const close = () => {
    if (!saving) onClose();
  };

  const step = (delta: number) => {
    const base = isNaN(current) ? 30 : current;
    setValue(String(Math.min(MAX, Math.max(MIN, base + delta))));
  };

  const save = async () => {
    if (!valid) {
      showToast({ title: 'Invalid time', message: `Expected time must be between ${MIN} and ${MAX} minutes.`, type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await orderService.updateOrderDeliveryTime(order._id, current);
      if (res.success) {
        showToast({ title: 'Updated', message: `Expected time set to ${current} minutes.`, type: 'success' });
        onSaved(order._id, { deliveryTime: current, expectedDeliveryTime: current, ...(res.data || {}) });
        onClose();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to update expected time.', type: 'error' });
      }
    } catch (err: any) {
      showToast({ title: 'Error', message: err?.message || 'Error updating expected time.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} accessibilityLabel="Close" />
        <View style={styles.box}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Clock size={18} color="#1D4ED8" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{isDelivery ? 'Expected delivery time' : 'Expected ready time'}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                #{order.orderNumber || order._id.substring(0, 7).toUpperCase()} · {customerName}
              </Text>
            </View>
            <TouchableOpacity onPress={close} disabled={saving} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
              <X size={18} color="#687076" />
            </TouchableOpacity>
          </View>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => step(-STEP)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Decrease by ${STEP} minutes`}
            >
              <Minus size={22} color="#11181C" />
            </TouchableOpacity>
            <View style={[styles.inputBox, !valid && styles.inputBoxError]}>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={value}
                onChangeText={(t) => setValue(t.replace(/[^0-9]/g, '').slice(0, 3))}
                editable={!saving}
                selectTextOnFocus
                accessibilityLabel="Minutes"
              />
              <Text style={styles.inputSuffix}>min</Text>
            </View>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => step(STEP)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Increase by ${STEP} minutes`}
            >
              <Plus size={22} color="#11181C" />
            </TouchableOpacity>
          </View>
          {!valid && <Text style={styles.error}>Enter {MIN}–{MAX} minutes</Text>}

          <View style={styles.presets}>
            {PRESETS.map((mins) => {
              const active = current === mins;
              return (
                <TouchableOpacity
                  key={mins}
                  style={[styles.preset, active && styles.presetActive]}
                  onPress={() => setValue(String(mins))}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{mins}m</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={close} disabled={saving} activeOpacity={0.75}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (!valid || saving) && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving || !valid}
              activeOpacity={0.85}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 28, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  box: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#11181C' },
  subtitle: { fontSize: 13, color: '#687076', marginTop: 2, fontWeight: '500' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F5F7' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBox: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inputBoxError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  input: { fontSize: 26, fontWeight: '800', color: '#11181C', minWidth: 50, textAlign: 'center', padding: 0, fontVariant: ['tabular-nums'] },
  inputSuffix: { fontSize: 15, fontWeight: '600', color: '#687076' },
  error: { color: '#B91C1C', fontSize: 12.5, fontWeight: '600', textAlign: 'center', marginTop: 6 },
  presets: { flexDirection: 'row', gap: 8, marginTop: 16 },
  preset: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: { backgroundColor: '#11181C', borderColor: '#11181C' },
  presetText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  presetTextActive: { color: '#FFFFFF' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#D0D5DB', alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  saveBtn: { flex: 1, minHeight: 48, borderRadius: 10, backgroundColor: '#FF5C39', alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
