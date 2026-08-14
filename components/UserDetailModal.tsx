import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
} from 'react-native';
import { UserAccount } from '../types';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';
import { X, User, Mail, Phone, Calendar, Shield, Trash2, Bike, MapPin } from 'lucide-react-native';

interface UserDetailModalProps {
  visible: boolean;
  user: UserAccount | null;
  onClose: () => void;
  onToggleActive: (user: UserAccount, active: boolean) => Promise<void>;
  onDelete: (user: UserAccount) => void;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  visible,
  user,
  onClose,
  onToggleActive,
  onDelete,
}) => {
  if (!user) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>User Account Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* User Profile Summary */}
            <View style={styles.profileRow}>
              <View style={styles.avatarCircle}>
                {user.userType === 'delivery_partner' ? (
                  <Bike size={28} color={Colors.primary} />
                ) : (
                  <User size={28} color={Colors.info} />
                )}
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user.fullName}</Text>
                <Text style={styles.profileRole}>
                  {user.userType === 'delivery_partner' ? 'Delivery Partner' : 'Customer'}
                </Text>
                <View style={styles.badgeWrap}>
                  <StatusBadge status={user.isActive ? 'active' : 'inactive'} type="user" />
                </View>
              </View>
            </View>

            {/* Profile Grid */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Account Profile</Text>
              
              <View style={styles.infoRow}>
                <Mail size={16} color={Colors.textSubtle} style={styles.icon} />
                <View style={styles.infoBody}>
                  <Text style={styles.label}>Email Address</Text>
                  <Text style={styles.value}>{user.email || 'N/A'}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Phone size={16} color={Colors.textSubtle} style={styles.icon} />
                <View style={styles.infoBody}>
                  <Text style={styles.label}>Phone Number</Text>
                  <Text style={styles.value}>{user.phoneNumber || 'N/A'}</Text>
                </View>
              </View>

              {user.createdAt ? (
                <View style={styles.infoRow}>
                  <Calendar size={16} color={Colors.textSubtle} style={styles.icon} />
                  <View style={styles.infoBody}>
                    <Text style={styles.label}>Member Since</Text>
                    <Text style={styles.value}>
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Delivery Partner Details Section */}
            {user.userType === 'delivery_partner' && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Vehicle & Availability</Text>
                
                <View style={styles.infoRow}>
                  <Shield size={16} color={Colors.textSubtle} style={styles.icon} />
                  <View style={styles.infoBody}>
                    <Text style={styles.label}>Vehicle Type</Text>
                    <Text style={styles.value}>{user.vehicleType || 'Not specified'}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <MapPin size={16} color={Colors.textSubtle} style={styles.icon} />
                  <View style={styles.infoBody}>
                    <Text style={styles.label}>Vehicle Number / Registration</Text>
                    <Text style={styles.value}>{user.vehicleNumber || 'Not specified'}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Bike size={16} color={Colors.textSubtle} style={styles.icon} />
                  <View style={styles.infoBody}>
                    <Text style={styles.label}>Availability Status</Text>
                    <Text style={styles.value}>{user.isAvailable ? 'Available / Active' : 'Offline'}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Account Controls Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Account Status Controls</Text>
              <View style={styles.controlRow}>
                <View style={styles.controlHeader}>
                  <Text style={styles.controlTitle}>Account Active Switch</Text>
                  <Text style={styles.controlSubtitle}>Enable or disable user access to Krifoo platform</Text>
                </View>
                <Switch
                  value={user.isActive}
                  onValueChange={(val) => onToggleActive(user, val)}
                  trackColor={{ false: '#334155', true: '#10B981' }}
                  thumbColor={user.isActive ? '#FFFFFF' : '#94A3B8'}
                />
              </View>
            </View>

            {/* Destruction Option Button */}
            <TouchableOpacity 
              style={styles.deleteBtn}
              onPress={() => {
                onClose();
                onDelete(user);
              }}
            >
              <Trash2 size={16} color="#FFFFFF" />
              <Text style={styles.deleteBtnText}>Delete User Account</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  scrollBody: {
    padding: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 16,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: Colors.cardBorder,
    borderWidth: 1,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  profileRole: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 6,
  },
  badgeWrap: {
    flexDirection: 'row',
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  icon: {
    marginRight: 14,
  },
  infoBody: {
    flex: 1,
  },
  label: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  value: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlHeader: {
    flex: 1,
    marginRight: 16,
  },
  controlTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  controlSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  deleteBtn: {
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 20,
  },
  deleteBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
