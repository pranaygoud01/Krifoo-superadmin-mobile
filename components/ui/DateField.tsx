import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, TextInput } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { Colors } from '../../constants/colors';

const fmt = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Date-only field. iOS: native compact picker. Android: system date dialog. Web: YYYY-MM-DD input.
 */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  error,
  hint,
  containerStyle,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  error?: string;
  hint?: string;
  containerStyle?: any;
}) {
  const [webText, setWebText] = useState(ymd(value));
  useEffect(() => setWebText(ymd(value)), [value]);

  const openAndroid = () =>
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (event, date) => {
        if (event.type === 'set' && date) onChange(date);
      },
    });

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={[styles.box, styles.iosBox, error && styles.boxError]}>
          <CalendarDays size={18} color={Colors.textMuted} />
          <DateTimePicker
            value={value}
            mode="date"
            display="compact"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(_, date) => date && onChange(date)}
            accentColor={Colors.primary}
            style={styles.iosPicker}
          />
        </View>
      ) : Platform.OS === 'android' ? (
        <TouchableOpacity
          style={[styles.box, error && styles.boxError]}
          onPress={openAndroid}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${fmt(value)}. Change date`}
        >
          <CalendarDays size={18} color={Colors.textMuted} />
          <Text style={styles.value}>{fmt(value)}</Text>
        </TouchableOpacity>
      ) : (
        <View style={[styles.box, error && styles.boxError]}>
          <CalendarDays size={18} color={Colors.textMuted} />
          <TextInput
            value={webText}
            onChangeText={(t) => {
              setWebText(t);
              const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
              if (m) {
                const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
                if (!isNaN(d.getTime())) onChange(d);
              }
            }}
            placeholder="YYYY-MM-DD"
            style={styles.webInput}
            {...({ type: 'date' } as any)}
          />
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  iosBox: { justifyContent: 'flex-start' },
  iosPicker: { marginLeft: -8 },
  boxError: { borderColor: '#DC2626' },
  value: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  webInput: { flex: 1, fontSize: 15, color: Colors.text, paddingVertical: 10 },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 5 },
  error: { fontSize: 12, color: '#DC2626', marginTop: 5, fontWeight: '600' },
});
