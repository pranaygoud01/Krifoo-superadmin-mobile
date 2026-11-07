import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { UserAccount } from '../types';
import { Colors } from '../constants/colors';
import { X, User, Mail, Phone, Calendar, Trash2, Bike, Car, Hash, ShieldAlert, Radio } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserDetailModalProps {
  visible: boolean;
  user: UserAccount | null;
  onClose: () => void;
  onToggleActive: (user: UserAccount, active: boolean) => Promise<void>;
  onDelete: (user: UserAccount) => void;
}

type IconType = React.ComponentType<{ size?: number; color?: string }>;

const initials = (name?: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

function InfoRow({ icon: Icon, label, value, last }: { icon: IconType; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIcon}>
        <Icon size={16} color={Colors.textMuted} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({ visible, user, onClose, onToggleActive, onDelete }) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();

  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Reset transient UI whenever a different user is opened.
  useEffect(() => {
    setConfirmingDisable(false);
    setToggling(false);
  }, [user?._id, visible]);

  if (!user) return null;

  const isPartner = user.userType === 'delivery_partner';
  const accent = isPartner ? Colors.primary : Colors.info;
  const accentBg = isPartner ? Colors.primaryLight : Colors.statusActive.bg;
  const RoleIcon = isPartner ? Bike : User;
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const runToggle = async (next: boolean) => {
    setToggling(true);
    try {
      await onToggleActive(user, next);
    } finally {
      setToggling(false);
      setConfirmingDisable(false);
    }
  };

  const onSwitch = (next: boolean) => {
    if (next) runToggle(true);
    else setConfirmingDisable(true);
  };

  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <Modal
      visible={visible}
      animationType={isTablet ? 'fade' : 'slide'}
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />

        <View
          style={[
            styles.sheet,
            isTablet && styles.sheetTablet,
            { paddingBottom: isTablet ? 8 : Math.max(insets.bottom, 12) },
          ]}
          accessibilityViewIsModal
        >
          {!isTablet && <View style={styles.handle} />}

          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>User details</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close"
            >
              <X size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Profile */}
            <View style={styles.profile}>
              <View style={[styles.avatar, { backgroundColor: accentBg }]}>
                <Text style={[styles.avatarText, { color: accent }]}>{initials(user.fullName)}</Text>
              </View>
              <Text style={styles.name}>{user.fullName || 'Unnamed user'}</Text>
              <View style={styles.pillRow}>
                <View style={[styles.pill, { backgroundColor: accentBg }]}>
                  <RoleIcon size={12} color={accent} />
                  <Text style={[styles.pillText, { color: accent }]}>{isPartner ? 'Delivery partner' : 'Customer'}</Text>
                </View>
                <View
                  style={[styles.pill, { backgroundColor: user.isActive ? Colors.statusApproved.bg : Colors.cardSurface }]}
                >
                  <View style={[styles.dot, { backgroundColor: user.isActive ? Colors.success : Colors.textSubtle }]} />
                  <Text style={[styles.pillText, { color: user.isActive ? Colors.statusApproved.text : Colors.textMuted }]}>
                    {user.isActive ? 'Active' : 'Disabled'}
                  </Text>
                </View>
              </View>

              {/* Quick contact actions */}
              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={[styles.quickBtn, !user.phoneNumber && styles.quickBtnDisabled]}
                  disabled={!user.phoneNumber}
                  onPress={() => open(`tel:${user.phoneNumber!.replace(/\s/g, '')}`)}
                >
                  <Phone size={16} color={user.phoneNumber ? Colors.text : Colors.textSubtle} />
                  <Text style={[styles.quickText, !user.phoneNumber && { color: Colors.textSubtle }]}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBtn, !user.email && styles.quickBtnDisabled]}
                  disabled={!user.email}
                  onPress={() => open(`mailto:${user.email}`)}
                >
                  <Mail size={16} color={user.email ? Colors.text : Colors.textSubtle} />
                  <Text style={[styles.quickText, !user.email && { color: Colors.textSubtle }]}>Email</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Contact */}
            <Text style={styles.sectionTitle}>Contact</Text>
            <View style={styles.section}>
              <InfoRow icon={Mail} label="Email" value={user.email || 'Not provided'} />
              <InfoRow icon={Phone} label="Phone" value={user.phoneNumber || 'Not provided'} last={!joined} />
              {joined && <InfoRow icon={Calendar} label="Member since" value={joined} last />}
            </View>

            {/* Delivery partner */}
            {isPartner && (
              <>
                <Text style={styles.sectionTitle}>Vehicle & availability</Text>
                <View style={styles.section}>
                  <InfoRow icon={Car} label="Vehicle type" value={user.vehicleType || 'Not specified'} />
                  <InfoRow icon={Hash} label="Registration" value={user.vehicleNumber || 'Not specified'} />
                  <InfoRow
                    icon={Radio}
                    label="Availability"
                    value={user.isAvailable ? 'Available for deliveries' : 'Offline'}
                    last
                  />
                </View>
              </>
            )}

            {/* Access */}
            <Text style={styles.sectionTitle}>Access</Text>
            <View style={styles.section}>
              <View style={styles.controlRow}>
                <View style={styles.flex}>
                  <Text style={styles.controlTitle}>Allow sign in</Text>
                  <Text style={styles.controlSub}>
                    {user.isActive
                      ? 'This user can sign in and use Krifoo.'
                      : 'This user is blocked from signing in.'}
                  </Text>
                </View>
                {toggling ? (
                  <ActivityIndicator color={Colors.primary} style={{ width: 51 }} />
                ) : (
                  <Switch
                    value={user.isActive}
                    onValueChange={onSwitch}
                    disabled={confirmingDisable}
                    trackColor={{ false: Colors.cardBorder, true: Colors.success }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor={Colors.cardBorder}
                    accessibilityLabel="Allow sign in"
                  />
                )}
              </View>

              {confirmingDisable && (
                <View style={styles.confirmBox}>
                  <View style={styles.confirmHead}>
                    <ShieldAlert size={16} color={Colors.statusRejected.text} />
                    <Text style={styles.confirmTitle}>Disable this account?</Text>
                  </View>
                  <Text style={styles.confirmText}>
                    {user.fullName} will be signed out and won’t be able to sign in until you re-enable them.
                  </Text>
                  <View style={styles.confirmActions}>
                    <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmingDisable(false)}>
                      <Text style={styles.confirmCancelText}>Keep active</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.confirmDanger} onPress={() => runToggle(false)} disabled={toggling}>
                      <Text style={styles.confirmDangerText}>Disable</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Danger zone */}
            <Text style={[styles.sectionTitle, { color: Colors.danger }]}>Danger zone</Text>
            <View style={[styles.section, styles.dangerSection]}>
              <View style={styles.flex}>
                <Text style={styles.controlTitle}>Delete account</Text>
                <Text style={styles.controlSub}>Permanently removes this user. This can’t be undone.</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => {
                  onClose();
                  onDelete(user);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${user.fullName}`}
              >
                <Trash2 size={15} color={Colors.danger} />
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 28, 0.45)', justifyContent: 'flex-end' },
  overlayTablet: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  sheetTablet: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 24,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors.cardBorder, marginTop: 8 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  topBarTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingBottom: 24 },

  profile: { alignItems: 'center', paddingVertical: 12 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.4, marginTop: 12, textAlign: 'center' },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  quickActions: { flexDirection: 'row', gap: 10, marginTop: 18, alignSelf: 'stretch' },
  quickBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  quickBtnDisabled: { opacity: 0.6 },
  quickText: { fontSize: 14, fontWeight: '700', color: Colors.text },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  section: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.cardSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { fontSize: 12, color: Colors.textSubtle, fontWeight: '600' },
  infoValue: { fontSize: 15, color: Colors.text, fontWeight: '500', marginTop: 1 },

  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  controlTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  controlSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },

  confirmBox: {
    marginBottom: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.statusRejected.bg,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmTitle: { fontSize: 14, fontWeight: '800', color: Colors.statusRejected.text },
  confirmText: { fontSize: 13, color: Colors.statusRejected.text, marginTop: 4, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  confirmCancel: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  confirmCancelText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  confirmDanger: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.danger },
  confirmDangerText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  dangerSection: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderColor: '#FECACA' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  deleteText: { fontSize: 14, fontWeight: '800', color: Colors.danger },
});
