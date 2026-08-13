import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';

interface StatusBadgeProps {
  status?: string;
  type?: 'restaurant' | 'order' | 'user';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'restaurant' }) => {
  const normalized = (status ?? '').toLowerCase();

  let bg = Colors.cardSurface;
  let textColor = Colors.textMuted;
  let label = status ?? '—';

  if (type === 'restaurant') {
    if (normalized === 'approved') {
      bg = Colors.statusApproved.bg;
      textColor = Colors.statusApproved.text;
      label = 'Approved';
    } else if (normalized === 'pending') {
      bg = Colors.statusPending.bg;
      textColor = Colors.statusPending.text;
      label = 'Pending';
    } else if (normalized === 'rejected') {
      bg = Colors.statusRejected.bg;
      textColor = Colors.statusRejected.text;
      label = 'Rejected';
    } else if (normalized === 'active' || normalized === 'true') {
      bg = Colors.statusActive.bg;
      textColor = Colors.statusActive.text;
      label = 'Active';
    } else if (normalized === 'inactive' || normalized === 'false') {
      bg = Colors.cardSurface;
      textColor = Colors.textSubtle;
      label = 'Inactive';
    }
  } else if (type === 'order') {
    switch (normalized) {
      case 'placed':
        bg = Colors.statusActive.bg;
        textColor = Colors.statusActive.text;
        label = 'Placed';
        break;
      case 'confirmed':
        bg = Colors.statusApproved.bg;
        textColor = Colors.statusApproved.text;
        label = 'Confirmed';
        break;
      case 'preparing':
        bg = Colors.statusPending.bg;
        textColor = Colors.statusPending.text;
        label = 'Preparing';
        break;
      case 'out_for_delivery':
        bg = '#F3E8FF';
        textColor = '#7C3AED';
        label = 'Out for Delivery';
        break;
      case 'delivered':
        bg = Colors.statusApproved.bg;
        textColor = Colors.statusApproved.text;
        label = 'Delivered';
        break;
      case 'cancelled':
        bg = Colors.statusRejected.bg;
        textColor = Colors.statusRejected.text;
        label = 'Cancelled';
        break;
      default:
        label = status ?? '—';
    }
  } else if (type === 'user') {
    if (normalized === 'active' || status === 'true') {
      bg = Colors.statusApproved.bg;
      textColor = Colors.statusApproved.text;
      label = 'Active';
    } else {
      bg = Colors.statusRejected.bg;
      textColor = Colors.statusRejected.text;
      label = 'Inactive';
    }
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: textColor }]}>{(label ?? '—').toUpperCase()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
