import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Switch } from 'react-native';
import { Restaurant } from '../types';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';
import { MapPin, Phone, Mail, CheckCircle, XCircle, Trash2, Eye } from 'lucide-react-native';

interface RestaurantCardProps {
  restaurant: Restaurant;
  onViewDetails: (restaurant: Restaurant) => void;
  onVerifyStatusChange: (restaurant: Restaurant, status: 'approved' | 'rejected') => void;
  onToggleActive: (restaurant: Restaurant, currentActive: boolean) => void;
}

export const RestaurantCard: React.FC<RestaurantCardProps> = ({
  restaurant,
  onViewDetails,
  onVerifyStatusChange,
  onToggleActive,
}) => {
  const addr = typeof restaurant.address === 'object' && restaurant.address !== null ? restaurant.address : null;
  const addressText = addr
    ? addr.formattedAddress ||
      [addr.shopNo, addr.floor, addr.street, addr.area, addr.city, addr.pincode]
        .filter(Boolean)
        .join(', ')
    : typeof restaurant.address === 'string'
    ? restaurant.address
    : 'Address not specified';

  // Backend aggregation nests verificationStatus inside documents
  const verificationStatus: string =
    (restaurant as any).documents?.verificationStatus ??
    restaurant.verificationStatus ??
    'pending';

  const isActive: boolean = restaurant.isActive ?? false;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {restaurant.imageUrl ? (
          <Image source={{ uri: restaurant.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.placeholderText}>{restaurant.restaurantName?.charAt(0) || 'R'}</Text>
          </View>
        )}

        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>
            {restaurant.restaurantName}
          </Text>
          {restaurant.ownerFullName ?? restaurant.ownerName ? (
            <Text style={styles.ownerText} numberOfLines={1}>
              Owner: {restaurant.ownerFullName ?? restaurant.ownerName}
            </Text>
          ) : null}

          <View style={styles.badgeRow}>
            <StatusBadge status={verificationStatus} type="restaurant" />
            <StatusBadge status={isActive ? 'active' : 'inactive'} type="restaurant" />
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailsContainer}>
        <View style={styles.infoRow}>
          <MapPin size={14} color={Colors.textSubtle} style={styles.icon} />
          <Text style={styles.infoText}>
            {addressText}
          </Text>
        </View>

        {restaurant.phoneNumber ? (
          <View style={styles.infoRow}>
            <Phone size={14} color={Colors.textSubtle} style={styles.icon} />
            <Text style={styles.infoText}>{restaurant.phoneNumber}</Text>
          </View>
        ) : null}

        {restaurant.email ? (
          <View style={styles.infoRow}>
            <Mail size={14} color={Colors.textSubtle} style={styles.icon} />
            <Text style={styles.infoText}>{restaurant.email}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      <View style={styles.footer}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Active:</Text>
          <Switch
            value={isActive}
            onValueChange={(val) => onToggleActive(restaurant, val)}
            trackColor={{ false: '#334155', true: '#10B981' }}
            thumbColor={isActive ? '#FFFFFF' : '#94A3B8'}
          />
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => onViewDetails(restaurant)}
          >
            <Eye size={15} color={Colors.info} />
            <Text style={styles.viewDetailsText} numberOfLines={1}>View</Text>
          </TouchableOpacity>

          {verificationStatus === 'pending' && (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => onVerifyStatusChange(restaurant, 'approved')}
              >
                <CheckCircle size={14} color="#FFFFFF" />
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => onVerifyStatusChange(restaurant, 'rejected')}
              >
                <XCircle size={14} color="#FFFFFF" />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  imagePlaceholder: {
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  ownerText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 10,
  },
  detailsContainer: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  infoText: {
    color: Colors.textMuted,
    fontSize: 13,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    marginRight: 6,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.cardSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    minWidth: 90,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 90,
  },
  approveBtn: {
    backgroundColor: Colors.primary,
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  viewDetailsText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  rejectBtn: {
    backgroundColor: Colors.danger,
  },
  rejectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
