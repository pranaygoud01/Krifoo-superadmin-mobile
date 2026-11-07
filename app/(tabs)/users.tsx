import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserDetailModal } from '../../components/UserDetailModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Colors } from '../../constants/colors';
import { userService } from '../../services/user.service';
import { useToast } from '../../context/ToastContext';
import { UserAccount } from '../../types';
import { Search, Users, User, Bike, Mail, Phone, X, ChevronRight, SearchX, Car, House } from 'lucide-react-native';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { ApiErrorType } from '../../services/api';

/* ────────────────────────────────────────────────────────────────────────────
 * Config & helpers
 * ──────────────────────────────────────────────────────────────────────────── */

type RoleFilter = 'all' | 'customer' | 'delivery_partner';
type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const ROLE_FILTERS: { label: string; short: string; value: RoleFilter; icon: IconType }[] = [
  { label: 'All users', short: 'All', value: 'all', icon: Users },
  { label: 'Customers', short: 'Customers', value: 'customer', icon: User },
  { label: 'Delivery partners', short: 'Riders', value: 'delivery_partner', icon: Bike },
];

const PAGE_SIZE = 15;
const SEARCH_DEBOUNCE_MS = 400;
const TAB_BAR_CLEARANCE = 110;

const isRoleFilter = (v?: string): v is RoleFilter => v === 'all' || v === 'customer' || v === 'delivery_partner';

export const getInitials = (name?: string) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

export const roleMeta = (userType?: string) =>
  userType === 'delivery_partner'
    ? { label: 'Delivery partner', color: Colors.primary, bg: Colors.primaryLight, icon: Bike }
    : { label: 'Customer', color: Colors.info, bg: Colors.statusActive.bg, icon: User };

const formatJoined = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ────────────────────────────────────────────────────────────────────────────
 * Small presentational pieces
 * ──────────────────────────────────────────────────────────────────────────── */

function Avatar({ user, size = 44 }: { user: UserAccount; size?: number }) {
  const meta = roleMeta(user.userType);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: meta.bg },
        ]}
      >
        <Text style={[styles.avatarText, { color: meta.color, fontSize: size * 0.36 }]}>{getInitials(user.fullName)}</Text>
      </View>
      <View
        style={[
          styles.avatarStatus,
          { backgroundColor: user.isActive ? Colors.success : Colors.textSubtle },
        ]}
      />
    </View>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: active ? Colors.statusApproved.bg : Colors.cardSurface }]}>
      <View style={[styles.pillDot, { backgroundColor: active ? Colors.success : Colors.textSubtle }]} />
      <Text style={[styles.pillText, { color: active ? Colors.statusApproved.text : Colors.textMuted }]}>
        {active ? 'Active' : 'Disabled'}
      </Text>
    </View>
  );
}

function RolePill({ userType }: { userType?: string }) {
  const meta = roleMeta(userType);
  const Icon = meta.icon;
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Icon size={11} color={meta.color} />
      <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

/** Phone layout: a card per user. */
const UserCard = React.memo(function UserCard({ user, onPress }: { user: UserAccount; onPress: (u: UserAccount) => void }) {
  const isPartner = user.userType === 'delivery_partner';
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(user)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${user.fullName}, ${roleMeta(user.userType).label}, ${user.isActive ? 'active' : 'disabled'}`}
    >
      <View style={styles.cardTop}>
        <Avatar user={user} />
        <View style={styles.cardIdentity}>
          <Text style={styles.name} numberOfLines={1}>
            {user.fullName || 'Unnamed user'}
          </Text>
          <View style={styles.pillRow}>
            <RolePill userType={user.userType} />
            {!user.isActive && <StatusPill active={false} />}
          </View>
        </View>
        <ChevronRight size={18} color={Colors.textSubtle} />
      </View>

      <View style={styles.cardDetails}>
        {user.email ? (
          <View style={styles.infoRow}>
            <Mail size={14} color={Colors.textSubtle} />
            <Text style={styles.infoText} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        ) : null}
        {user.phoneNumber ? (
          <View style={styles.infoRow}>
            <Phone size={14} color={Colors.textSubtle} />
            <Text style={styles.infoText} numberOfLines={1}>
              {user.phoneNumber}
            </Text>
          </View>
        ) : null}
        {isPartner && (user.vehicleType || user.vehicleNumber) ? (
          <View style={styles.infoRow}>
            <Car size={14} color={Colors.textSubtle} />
            <Text style={styles.infoText} numberOfLines={1}>
              {[user.vehicleType, user.vehicleNumber].filter(Boolean).join(' · ')}
            </Text>
            {user.isAvailable !== undefined && (
              <Text style={[styles.availability, { color: user.isAvailable ? Colors.success : Colors.textSubtle }]}>
                {user.isAvailable ? '● Available' : '○ Offline'}
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

/** Tablet layout: a table row per user. */
const UserRow = React.memo(function UserRow({
  user,
  onPress,
  showJoined,
}: {
  user: UserAccount;
  onPress: (u: UserAccount) => void;
  showJoined: boolean;
}) {
  return (
    <TouchableOpacity style={styles.tableRow} onPress={() => onPress(user)} activeOpacity={0.7} accessibilityRole="button">
      <View style={[styles.colUser, styles.rowUser]}>
        <Avatar user={user} size={38} />
        <View style={styles.flexShrink}>
          <Text style={styles.rowName} numberOfLines={1}>
            {user.fullName || 'Unnamed user'}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {user.email || 'No email'}
          </Text>
        </View>
      </View>
      <Text style={[styles.colPhone, styles.rowCell]} numberOfLines={1}>
        {user.phoneNumber || '—'}
      </Text>
      <View style={styles.colRole}>
        <RolePill userType={user.userType} />
      </View>
      {showJoined && (
        <Text style={[styles.colJoined, styles.rowCell]} numberOfLines={1}>
          {formatJoined(user.createdAt)}
        </Text>
      )}
      <View style={styles.colStatus}>
        <StatusPill active={user.isActive} />
      </View>
      <ChevronRight size={16} color={Colors.textSubtle} />
    </TouchableOpacity>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
 * Screen
 * ──────────────────────────────────────────────────────────────────────────── */

export default function UsersScreen() {
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768; // table layout
  const showJoined = width >= 1024; // extra column on wide screens
  const gutter = isTablet ? 24 : 16;

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ role?: string; userType?: string }>();
  const paramRole = params.role || params.userType;

  const [users, setUsers] = useState<UserAccount[]>([]);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<{ type: ApiErrorType; message: string; statusCode?: number } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [role, setRole] = useState<RoleFilter>(isRoleFilter(paramRole) ? paramRole : 'all');

  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);

  const requestId = useRef(0);
  const hasLoadedOnce = useRef(false);
  const hasMore = page < totalPages;

  // Respond to deep links from the dashboard (e.g. "View delivery partners").
  useEffect(() => {
    if (isRoleFilter(paramRole)) setRole(paramRole);
  }, [paramRole]);

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const fetchUsers = useCallback(
    async (opts: { role: RoleFilter; search: string; page: number; mode: 'initial' | 'search' | 'refresh' | 'more' }) => {
      const id = ++requestId.current;
      if (opts.mode === 'initial') setLoading(true);
      if (opts.mode === 'search') setSearching(true);
      if (opts.mode === 'more') setLoadingMore(true);

      try {
        const res: any = await userService.getAllUsers({
          userType: opts.role !== 'all' ? opts.role : undefined,
          search: opts.search.trim() || undefined,
          page: opts.page,
          limit: PAGE_SIZE,
        });
        if (id !== requestId.current) return;

        const list: UserAccount[] | undefined = res.data || res.users;
        if (res.success && list) {
          setUsers((prev) =>
            opts.page === 1 ? list : [...prev, ...list.filter((u) => !prev.some((p) => p._id === u._id))]
          );
          setPage(opts.page);
          setTotalPages(res.totalPages || 1);
          setTotalUsers(typeof res.totalUsers === 'number' ? res.totalUsers : null);
          setError(null);
          hasLoadedOnce.current = true;
        } else {
          setError({
            type: res.errorType || 'unknown',
            message: res.message || 'Failed to load users from server.',
            statusCode: res.statusCode,
          });
        }
      } catch (e: any) {
        if (id !== requestId.current) return;
        console.error('Failed fetching users:', e);
        setError({ type: 'network', message: e?.message || 'Cannot reach server.' });
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setSearching(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    []
  );

  // Role changes load immediately with a skeleton.
  useEffect(() => {
    fetchUsers({ role, search: searchQuery, page: 1, mode: 'initial' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, fetchUsers]);

  // Search is debounced and keeps the current list visible while it runs.
  const firstSearchRun = useRef(true);
  useEffect(() => {
    if (firstSearchRun.current) {
      firstSearchRun.current = false;
      return;
    }
    const t = setTimeout(() => fetchUsers({ role, search: searchQuery, page: 1, mode: 'search' }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers({ role, search: searchQuery, page: 1, mode: 'refresh' });
  };

  const loadMore = () => {
    if (!loadingMore && !loading && !searching && hasMore) {
      fetchUsers({ role, search: searchQuery, page: page + 1, mode: 'more' });
    }
  };

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const openUser = useCallback((u: UserAccount) => {
    setSelectedUser(u);
    setDetailVisible(true);
  }, []);

  const handleToggleActive = async (user: UserAccount, nextActive: boolean) => {
    try {
      const res = await userService.toggleUserActive(user._id, nextActive);
      if (res.success) {
        setUsers((prev) => prev.map((u) => (u._id === user._id ? { ...u, isActive: nextActive } : u)));
        setSelectedUser((prev) => (prev && prev._id === user._id ? { ...prev, isActive: nextActive } : prev));
        showToast({
          title: nextActive ? 'Account enabled' : 'Account disabled',
          message: nextActive
            ? `${user.fullName} can sign in again.`
            : `${user.fullName} can no longer sign in.`,
          type: 'success',
        });
      } else {
        showToast({ title: 'Update failed', message: res.message || 'Could not update the account.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Update failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    const target = userToDelete;
    try {
      const res = await userService.deleteUser(target._id);
      if (res.success) {
        setUsers((prev) => prev.filter((u) => u._id !== target._id));
        setTotalUsers((n) => (n !== null ? Math.max(0, n - 1) : n));
        showToast({ title: 'User deleted', message: `${target.fullName} has been removed.`, type: 'success' });
      } else {
        showToast({ title: 'Delete failed', message: res.message || 'Could not delete the user.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Delete failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setUserToDelete(null);
    }
  };

  /* ── Rendering ────────────────────────────────────────────────────────── */

  const renderItem = useCallback(
    ({ item }: { item: UserAccount }) =>
      isTablet ? <UserRow user={item} onPress={openUser} showJoined={showJoined} /> : <UserCard user={item} onPress={openUser} />,
    [isTablet, showJoined, openUser]
  );

  const summary = () => {
    const shown = users.length;
    const total = totalUsers ?? shown;
    const noun = role === 'customer' ? 'customer' : role === 'delivery_partner' ? 'delivery partner' : 'user';
    const plural = total === 1 ? noun : `${noun}s`;
    if (searchQuery.trim()) return `${total} ${total === 1 ? 'result' : 'results'} for “${searchQuery.trim()}”`;
    return hasMore ? `Showing ${shown} of ${total} ${plural}` : `${total} ${plural}`;
  };

  const tableHeader = isTablet ? (
    <View style={styles.tableHead}>
      <Text style={[styles.colUser, styles.th]}>User</Text>
      <Text style={[styles.colPhone, styles.th]}>Phone</Text>
      <Text style={[styles.colRole, styles.th]}>Role</Text>
      {showJoined && <Text style={[styles.colJoined, styles.th]}>Joined</Text>}
      <Text style={[styles.colStatus, styles.th]}>Status</Text>
      <View style={{ width: 16 }} />
    </View>
  ) : null;

  const listHeader = (
    <View>
      <Text style={styles.summary}>{summary()}</Text>
      {tableHeader}
    </View>
  );

  const listFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.footerLoaderText}>Loading more…</Text>
        </View>
      );
    }
    if (hasMore) {
      return (
        <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMore}>
          <Text style={styles.loadMoreText}>Load more</Text>
        </TouchableOpacity>
      );
    }
    return null;
  };

  const renderEmpty = () => {
    const q = searchQuery.trim();
    const EmptyIcon = q ? SearchX : Users;
    const title = q ? 'No users found' : role === 'delivery_partner' ? 'No delivery partners yet' : role === 'customer' ? 'No customers yet' : 'No users yet';
    const message = q
      ? `No one matches “${q}”. Try a name, email or phone number.`
      : 'New sign-ups will appear here.';
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <EmptyIcon size={30} color={Colors.textSubtle} />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{message}</Text>
        {(q || role !== 'all') && (
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => {
              setSearchQuery('');
              setRole('all');
            }}
          >
            <Text style={styles.emptyBtnText}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const skeleton = (
    <ScrollView contentContainerStyle={[styles.frame, { paddingHorizontal: gutter, paddingTop: 16 }]}>
      {Array.from({ length: 7 }).map((_, i) =>
        isTablet ? (
          <View key={i} style={[styles.tableRow, { gap: 16 }]}>
            <Skeleton width={38} height={38} borderRadius={19} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="40%" height={13} />
              <Skeleton width="60%" height={11} />
            </View>
            <Skeleton width={90} height={20} borderRadius={10} />
            <Skeleton width={70} height={20} borderRadius={10} />
          </View>
        ) : (
          <View key={i} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Skeleton width={44} height={44} borderRadius={22} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="55%" height={14} />
              <Skeleton width="35%" height={16} borderRadius={8} />
              <Skeleton width="70%" height={11} />
            </View>
          </View>
        )
      )}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Toolbar (same pattern as Orders) — extends under the status bar */}
      <View style={[styles.toolbar, { paddingTop: insets.top + 16 }]}>
        <View style={[styles.frame, { paddingHorizontal: gutter }]}>
          <View style={styles.titleRow}>
            {/* <View style={isTablet ? styles.flex : undefined}>
              <Text style={[styles.pageTitle, isTablet && { fontSize: 26 }]}>Users</Text>
              <Text style={styles.pageSubtitle}>Customers and delivery partners on Krifoo</Text>
            </View> */}

            {/* Search is full width on every device */}
            <View style={styles.searchRow}>
            <TouchableOpacity
              style={styles.homeBtn}
              onPress={() => router.navigate('/(tabs)')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Go to Home"
            >
              <House size={20} color={Colors.primary} />
            </TouchableOpacity>
            <View style={[styles.search, styles.flex]}>
              <Search size={18} color={Colors.textSubtle} />
              <TextInput
                style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                placeholder="Search name, email or phone"
                placeholderTextColor={Colors.textSubtle}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Search users"
              />
              {searching ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.clearBtn}
                  accessibilityLabel="Clear search"
                >
                  <X size={14} color="#FFFFFF" strokeWidth={3} />
                </TouchableOpacity>
              ) : null}
            </View>
            </View>
          </View>

          {/* Role segmented control */}
          <View style={[styles.segment, isTablet && styles.segmentTablet]}>
            {ROLE_FILTERS.map((opt) => {
              const selected = role === opt.value;
              const Icon = opt.icon;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.segmentItem, selected && styles.segmentItemActive]}
                  onPress={() => setRole(opt.value)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                >
                  <Icon size={15} color={selected ? Colors.primary : Colors.textMuted} />
                  <Text style={[styles.segmentText, selected && styles.segmentTextActive]} numberOfLines={1}>
                    {isTablet || width >= 400 ? opt.label : opt.short}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        skeleton
      ) : error && users.length === 0 ? (
        <ErrorState
          errorType={error.type}
          message={error.message}
          statusCode={error.statusCode}
          onRetry={() => fetchUsers({ role, search: searchQuery, page: 1, mode: 'initial' })}
          isRetrying={loading || refreshing}
        />
      ) : (
        <FlatList
          key={isTablet ? 'users-table' : 'users-cards'}
          data={users}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          ListHeaderComponent={users.length ? listHeader : null}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={users.length ? listFooter : null}
          contentContainerStyle={[
            styles.frame,
            styles.listContent,
            { paddingHorizontal: gutter },
            !users.length && styles.flexGrow,
            searching && { opacity: 0.6 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
        />
      )}

      <UserDetailModal
        visible={detailVisible}
        user={selectedUser}
        onClose={() => {
          setDetailVisible(false);
          setSelectedUser(null);
        }}
        onToggleActive={handleToggleActive}
        onDelete={(u) => setUserToDelete(u)}
      />

      <ConfirmModal
        visible={!!userToDelete}
        title="Delete this user?"
        message={`${userToDelete?.fullName || 'This user'}${userToDelete?.email ? ` (${userToDelete.email})` : ''} will be permanently removed and lose access to Krifoo. This can’t be undone.`}
        confirmText="Delete user"
        isDestructive
        onConfirm={confirmDelete}
        onClose={() => setUserToDelete(null)}
      />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  frame: { width: '100%', maxWidth: 1280, alignSelf: 'center' },

  // Toolbar
  toolbar: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingTop: 16,
    paddingBottom: 14,
  },
  titleRow: { gap: 12 },
  titleRowTablet: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchTablet: { width: 360 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchRowTablet: { width: 432 },
  homeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, color: Colors.text, paddingVertical: 0 },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  segment: {
    flexDirection: 'row',
    marginTop: 14,
    padding: 4,
    borderRadius: 12,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  segmentTablet: { alignSelf: 'flex-start', minWidth: 480 },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  segmentItemActive: {
    backgroundColor: Colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  segmentTextActive: { color: Colors.text },

  // List
  listContent: { paddingTop: 16, paddingBottom: TAB_BAR_CLEARANCE },
  summary: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },

  // Avatar & pills
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  avatarStatus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },

  // Phone cards
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIdentity: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  cardDetails: { gap: 7, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { flex: 1, fontSize: 13, color: Colors.textMuted },
  availability: { fontSize: 12, fontWeight: '700' },

  // Tablet table
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  th: { fontSize: 11, fontWeight: '800', color: Colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.6 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.cardBorder,
  },
  colUser: { flex: 3, minWidth: 0 },
  colPhone: { flex: 1.6, minWidth: 0 },
  colRole: { flex: 1.6, minWidth: 0 },
  colJoined: { flex: 1.2, minWidth: 0 },
  colStatus: { flex: 1, minWidth: 0 },
  rowUser: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rowCell: { fontSize: 13, color: Colors.textMuted },

  // Footer / empty
  footerLoader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 20 },
  footerLoaderText: { fontSize: 13, color: Colors.textMuted },
  loadMoreBtn: {
    alignSelf: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, maxWidth: 360, lineHeight: 20 },
  emptyBtn: {
    marginTop: 20,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: Colors.text },
});
