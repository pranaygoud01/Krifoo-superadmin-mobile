import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  Modal,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RestaurantCard,
  CardBusyAction,
  RestaurantStatus,
  getAddressText,
  getVerificationStatus,
  withVerificationStatus,
} from '../../components/RestaurantCard';
import { Colors } from '../../constants/colors';
import { restaurantService } from '../../services/restaurant.service';
import { useToast } from '../../context/ToastContext';
import { Restaurant } from '../../types';
import {
  Search,
  Store,
  X,
  Clock,
  CircleCheck,
  CircleX,
  Power,
  PowerOff,
  LayoutGrid,
  ChevronRight,
  SearchX,
  ShieldCheck,
  ShieldX,
  House,
} from 'lucide-react-native';
import { RestaurantCardSkeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { ApiErrorType } from '../../services/api';

/* ────────────────────────────────────────────────────────────────────────────
 * Config
 * ──────────────────────────────────────────────────────────────────────────── */

type FilterValue = 'all' | RestaurantStatus | 'active' | 'inactive';
type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const STATUS_FILTERS: { label: string; value: FilterValue; icon: IconType }[] = [
  { label: 'All', value: 'all', icon: LayoutGrid },
  { label: 'Pending', value: 'pending', icon: Clock },
  { label: 'Approved', value: 'approved', icon: CircleCheck },
  { label: 'Rejected', value: 'rejected', icon: CircleX },
];
const AVAILABILITY_FILTERS: { label: string; value: FilterValue; icon: IconType }[] = [
  { label: 'Live', value: 'active', icon: Power },
  { label: 'Offline', value: 'inactive', icon: PowerOff },
];
const SERVER_FILTERS: FilterValue[] = ['pending', 'approved', 'rejected'];

const FILTER_EMPTY_COPY: Record<FilterValue, { title: string; message: string }> = {
  all: { title: 'No restaurants yet', message: 'New partner registrations will appear here for review.' },
  pending: { title: 'All caught up', message: 'There are no restaurants waiting for review.' },
  approved: { title: 'No approved restaurants', message: 'Restaurants you approve will be listed here.' },
  rejected: { title: 'No rejected restaurants', message: 'Restaurants you reject will be listed here.' },
  active: { title: 'No live restaurants', message: 'None of the loaded restaurants are currently live.' },
  inactive: { title: 'No offline restaurants', message: 'Every loaded restaurant is currently live.' },
};

const REJECTION_REASONS = [
  'Incomplete documents',
  'Invalid licence or certificate',
  'Bank details could not be verified',
  'Outside our service area',
  'Duplicate account',
];

const PAGE_SIZE = 10;
const TAB_BAR_CLEARANCE = 110; // floating tab bar overlays the bottom of the screen

type PendingAction = { kind: 'approve' | 'reject' | 'deactivate'; restaurant: Restaurant };
type FetchMode = 'initial' | 'refresh' | 'silent' | 'more';

/* ────────────────────────────────────────────────────────────────────────────
 * Screen
 * ──────────────────────────────────────────────────────────────────────────── */

export default function RestaurantsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  // Responsive breakpoints
  const isTablet = width >= 768;
  const columns = width >= 1400 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1;
  const gutter = isTablet ? 24 : 16;

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<{ type: ApiErrorType; message: string; statusCode?: number } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');

  const [busy, setBusy] = useState<Record<string, CardBusyAction>>({});
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionInFlight, setActionInFlight] = useState(false);

  const requestId = useRef(0);
  const lastFetchedFilter = useRef<FilterValue | null>(null);

  const hasMore = page < totalPages;

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const fetchRestaurants = useCallback(async (activeFilter: FilterValue, pageNum: number, mode: FetchMode) => {
    const id = ++requestId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'more') setLoadingMore(true);

    try {
      const res: any = await restaurantService.getRestaurants({
        page: pageNum,
        limit: PAGE_SIZE,
        status: SERVER_FILTERS.includes(activeFilter) ? activeFilter : undefined,
      });
      if (id !== requestId.current) return; // a newer request superseded this one

      const list: Restaurant[] | undefined = res.data || res.restaurants;
      if (res.success && list) {
        setRestaurants((prev) => (pageNum === 1 ? list : [...prev, ...list.filter((r) => !prev.some((p) => p._id === r._id))]));
        setPage(pageNum);
        setTotalPages(res.totalPages || 1);
        setError(null);
        lastFetchedFilter.current = activeFilter;
      } else {
        setError({
          type: res.errorType || 'unknown',
          message: res.message || 'Failed to load restaurants from server.',
          statusCode: res.statusCode,
        });
      }
    } catch (e: any) {
      if (id !== requestId.current) return;
      console.error('Failed fetching restaurants:', e);
      setError({ type: 'network', message: e?.message || 'Cannot reach server.' });
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Refetch on focus (silently if we already have this filter's data) and whenever the filter changes.
  useFocusEffect(
    useCallback(() => {
      const mode: FetchMode = lastFetchedFilter.current === filter ? 'silent' : 'initial';
      fetchRestaurants(filter, 1, mode);
    }, [filter, fetchRestaurants])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRestaurants(filter, 1, 'refresh');
  };

  const loadMore = () => {
    if (!loadingMore && !loading && hasMore) fetchRestaurants(filter, page + 1, 'more');
  };

  const changeFilter = (next: FilterValue) => {
    if (next === filter) return;
    setFilter(next);
  };

  const visibleRestaurants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return restaurants.filter((r) => {
      if (filter === 'active' && !r.isActive) return false;
      if (filter === 'inactive' && r.isActive) return false;
      if (SERVER_FILTERS.includes(filter) && getVerificationStatus(r) !== filter) return false;
      if (!q) return true;
      return [r.restaurantName, r.ownerFullName ?? r.ownerName, r.email, r.phoneNumber, getAddressText(r)]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q));
    });
  }, [restaurants, filter, searchQuery]);

  const pendingCount = useMemo(
    () => restaurants.filter((r) => getVerificationStatus(r) === 'pending').length,
    [restaurants]
  );

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const setCardBusy = (id: string, action: CardBusyAction) =>
    setBusy((prev) => {
      const next = { ...prev };
      if (action) next[id] = action;
      else delete next[id];
      return next;
    });

  const applyVerification = async (restaurant: Restaurant, status: RestaurantStatus, remarks?: string) => {
    setCardBusy(restaurant._id, status === 'approved' ? 'approve' : 'reject');
    try {
      const res = await restaurantService.verifyRestaurant(restaurant._id, status, remarks);
      if (res.success) {
        setRestaurants((prev) => prev.map((r) => (r._id === restaurant._id ? withVerificationStatus(r, status, remarks) : r)));
        showToast({
          title: status === 'approved' ? 'Restaurant approved' : 'Restaurant rejected',
          message:
            status === 'approved'
              ? `${restaurant.restaurantName} can now sign in and start trading.`
              : `${restaurant.restaurantName} has been notified that their application was rejected.`,
          type: 'success',
        });
      } else {
        showToast({ title: 'Update failed', message: res.message || 'Could not update verification status.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Update failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setCardBusy(restaurant._id, null);
    }
  };

  const applyActive = async (restaurant: Restaurant, nextActive: boolean) => {
    setCardBusy(restaurant._id, 'active');
    try {
      const res = await restaurantService.toggleActiveStatus(restaurant._id, nextActive);
      if (res.success) {
        setRestaurants((prev) => prev.map((r) => (r._id === restaurant._id ? { ...r, isActive: nextActive } : r)));
        showToast({
          title: nextActive ? 'Restaurant is live' : 'Restaurant is offline',
          message: nextActive
            ? `${restaurant.restaurantName} is visible to customers again.`
            : `${restaurant.restaurantName} is hidden and can’t receive orders.`,
          type: 'success',
        });
      } else {
        showToast({ title: 'Update failed', message: res.message || 'Could not change active status.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Update failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setCardBusy(restaurant._id, null);
    }
  };

  const openDetails = useCallback(
    (r: Restaurant) => router.push({ pathname: '/restaurant-details', params: { restaurantId: r._id } }),
    [router]
  );
  const askApprove = useCallback((r: Restaurant) => setPendingAction({ kind: 'approve', restaurant: r }), []);
  const askReject = useCallback((r: Restaurant) => {
    setRejectReason('');
    setPendingAction({ kind: 'reject', restaurant: r });
  }, []);
  const toggleActiveRef = useRef(applyActive);
  toggleActiveRef.current = applyActive;
  const onToggleActive = useCallback((r: Restaurant, nextActive: boolean) => {
    if (nextActive) toggleActiveRef.current(r, true);
    else setPendingAction({ kind: 'deactivate', restaurant: r }); // confirm before taking a store offline
  }, []);

  const closeModal = () => {
    if (actionInFlight) return;
    setPendingAction(null);
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    const { kind, restaurant } = pendingAction;
    setActionInFlight(true);
    if (kind === 'approve') await applyVerification(restaurant, 'approved');
    else if (kind === 'reject') await applyVerification(restaurant, 'rejected', rejectReason.trim() || undefined);
    else await applyActive(restaurant, false);
    setActionInFlight(false);
    setPendingAction(null);
  };

  /* ── Rendering helpers ────────────────────────────────────────────────── */

  const itemWidth = `${100 / columns}%` as const;

  const renderItem = useCallback(
    ({ item }: { item: Restaurant }) => (
      <View style={[styles.gridItem, { width: itemWidth, paddingHorizontal: columns > 1 ? 7 : 0 }]}>
        <RestaurantCard
          restaurant={item}
          busy={busy[item._id] ?? null}
          onPress={openDetails}
          onApprove={askApprove}
          onReject={askReject}
          onToggleActive={onToggleActive}
        />
      </View>
    ),
    [busy, columns, itemWidth, openDetails, askApprove, askReject, onToggleActive]
  );

  const renderChip = (opt: { label: string; value: FilterValue; icon: IconType }) => {
    const selected = filter === opt.value;
    const Icon = opt.icon;
    const showPendingCount = opt.value === 'pending' && pendingCount > 0 && filter === 'all';
    return (
      <TouchableOpacity
        key={opt.value}
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={() => changeFilter(opt.value)}
        activeOpacity={0.75}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
      >
        <Icon size={14} color={selected ? '#FFFFFF' : Colors.textMuted} />
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
        {showPendingCount && (
          <View style={styles.chipCount}>
            <Text style={styles.chipCountText}>
              {pendingCount}
              {hasMore ? '+' : ''}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const chips = (
    <>
      {STATUS_FILTERS.map(renderChip)}
      <View style={styles.chipDivider} />
      {AVAILABILITY_FILTERS.map(renderChip)}
    </>
  );

  const searchBar = (
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
        placeholder={isTablet ? 'Search name, owner, email, phone or postcode' : 'Search restaurants'}
        placeholderTextColor={Colors.textSubtle}
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search restaurants"
      />
      {searchQuery.length > 0 && (
        <TouchableOpacity
          onPress={() => setSearchQuery('')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.clearBtn}
          accessibilityLabel="Clear search"
        >
          <X size={14} color="#FFFFFF" strokeWidth={3} />
        </TouchableOpacity>
      )}
    </View>
    </View>
  );

  const resultSummary = () => {
    const n = visibleRestaurants.length;
    const noun = n === 1 ? 'restaurant' : 'restaurants';
    if (searchQuery.trim()) return `${n} ${n === 1 ? 'match' : 'matches'}${hasMore ? ' in loaded results' : ''}`;
    return `${n} ${noun}${hasMore ? ' shown · more available' : ''}`;
  };

  const listHeader = (
    <View>
      {filter === 'all' && pendingCount > 0 && !searchQuery && (
        <TouchableOpacity style={styles.pendingBanner} onPress={() => changeFilter('pending')} activeOpacity={0.85}>
          <View style={styles.pendingIcon}>
            <Clock size={18} color={Colors.statusPending.text} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.pendingTitle}>
              {pendingCount}
              {hasMore ? '+' : ''} {pendingCount === 1 ? 'restaurant is' : 'restaurants are'} waiting for review
            </Text>
            <Text style={styles.pendingSub}>Approve or reject new partner applications.</Text>
          </View>
          <View style={styles.pendingCta}>
            <Text style={styles.pendingCtaText}>Review</Text>
            <ChevronRight size={16} color={Colors.statusPending.text} />
          </View>
        </TouchableOpacity>
      )}
      <Text style={styles.summary}>{resultSummary()}</Text>
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
          <Text style={styles.loadMoreText}>Load more restaurants</Text>
        </TouchableOpacity>
      );
    }
    if (visibleRestaurants.length > PAGE_SIZE) {
      return <Text style={styles.endText}>You’ve reached the end of the list</Text>;
    }
    return null;
  };

  const renderEmpty = () => {
    const searching = searchQuery.trim().length > 0;
    const copy = searching
      ? { title: 'No matches found', message: `Nothing matches “${searchQuery.trim()}”${hasMore ? ' in the loaded results' : ''}.` }
      : FILTER_EMPTY_COPY[filter];
    const EmptyIcon = searching ? SearchX : filter === 'pending' ? CircleCheck : Store;

    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <EmptyIcon size={30} color={filter === 'pending' && !searching ? Colors.success : Colors.textSubtle} />
        </View>
        <Text style={styles.emptyTitle}>{copy.title}</Text>
        <Text style={styles.emptyText}>{copy.message}</Text>
        <View style={styles.emptyActions}>
          {searching && (
            <TouchableOpacity style={styles.emptyBtnSecondary} onPress={() => setSearchQuery('')}>
              <Text style={styles.emptyBtnSecondaryText}>Clear search</Text>
            </TouchableOpacity>
          )}
          {!searching && filter !== 'all' && (
            <TouchableOpacity style={styles.emptyBtnSecondary} onPress={() => changeFilter('all')}>
              <Text style={styles.emptyBtnSecondaryText}>Show all restaurants</Text>
            </TouchableOpacity>
          )}
          {hasMore && (
            <TouchableOpacity style={styles.emptyBtnPrimary} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.emptyBtnPrimaryText}>Load more</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  /* ── Layout ───────────────────────────────────────────────────────────── */

  const contentFrame = { maxWidth: 1440, width: '100%' as const, alignSelf: 'center' as const };

  return (
    <View style={styles.container}>
      {/* Toolbar (same pattern as Orders) — extends under the status bar */}
      <View style={[styles.toolbar, { paddingTop: insets.top + 16 }]}>
        <View style={[contentFrame, { paddingHorizontal: gutter }]}>
          <View style={styles.titleRow}>
            {/* <View style={isTablet ? styles.flex : undefined}>
              <Text style={[styles.pageTitle, isTablet && { fontSize: 26 }]}>Restaurants</Text>
              <Text style={styles.pageSubtitle}>Review partner applications and manage store visibility</Text>
            </View> */}
            {/* Search is full width on every device */}
            {searchBar}
          </View>
        </View>

        {isTablet ? (
          <View style={[contentFrame, styles.chipsWrap, { paddingHorizontal: gutter }]}>{chips}</View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.chipsScroll, { paddingHorizontal: gutter }]}
          >
            {chips}
          </ScrollView>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <ScrollView contentContainerStyle={[contentFrame, styles.skeletonGrid, { paddingHorizontal: gutter - (columns > 1 ? 7 : 0) }]}>
          {Array.from({ length: columns * 2 }).map((_, i) => (
            <View key={i} style={{ width: itemWidth, paddingHorizontal: columns > 1 ? 7 : 0 }}>
              <RestaurantCardSkeleton />
            </View>
          ))}
        </ScrollView>
      ) : error && restaurants.length === 0 ? (
        <ErrorState
          errorType={error.type}
          message={error.message}
          statusCode={error.statusCode}
          onRetry={() => fetchRestaurants(filter, 1, 'initial')}
          isRetrying={loading || refreshing}
        />
      ) : (
        <FlatList
          key={`restaurants-${columns}`}
          numColumns={columns}
          data={visibleRestaurants}
          extraData={busy}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          ListHeaderComponent={visibleRestaurants.length ? listHeader : null}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={visibleRestaurants.length ? listFooter : null}
          contentContainerStyle={[
            contentFrame,
            styles.listContent,
            { paddingHorizontal: gutter - (columns > 1 ? 7 : 0) },
            !visibleRestaurants.length && styles.flexGrow,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Confirmation sheet for approve / reject / deactivate */}
      <ActionModal
        action={pendingAction}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        loading={actionInFlight}
        onConfirm={confirmAction}
        onClose={closeModal}
      />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Confirmation modal
 * ──────────────────────────────────────────────────────────────────────────── */

const ACTION_COPY = {
  approve: {
    title: 'Approve restaurant?',
    message: (name: string) =>
      `${name} will be able to sign in, set up their menu and start accepting orders.`,
    confirm: 'Approve',
    color: Colors.success,
    tint: Colors.statusApproved.bg,
    icon: ShieldCheck,
  },
  reject: {
    title: 'Reject application?',
    message: (name: string) => `${name} won’t be able to sign in. Let them know why so they can fix it and reapply.`,
    confirm: 'Reject',
    color: Colors.danger,
    tint: Colors.statusRejected.bg,
    icon: ShieldX,
  },
  deactivate: {
    title: 'Take restaurant offline?',
    message: (name: string) =>
      `${name} will be hidden from customers and can’t receive new orders until you turn it back on.`,
    confirm: 'Take offline',
    color: Colors.danger,
    tint: Colors.statusRejected.bg,
    icon: PowerOff,
  },
} as const;

function ActionModal({
  action,
  reason,
  onReasonChange,
  loading,
  onConfirm,
  onClose,
}: {
  action: PendingAction | null;
  reason: string;
  onReasonChange: (v: string) => void;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // Keep the last action rendered while the modal fades out.
  const lastAction = useRef<PendingAction | null>(null);
  if (action) lastAction.current = action;
  const current = action ?? lastAction.current;
  if (!current) return null;

  const copy = ACTION_COPY[current.kind];
  const Icon = copy.icon;
  const name = current.restaurant.restaurantName || 'This restaurant';

  return (
    <Modal visible={!!action} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.modalCard} accessibilityViewIsModal>
          <View style={[styles.modalIcon, { backgroundColor: copy.tint }]}>
            <Icon size={26} color={copy.color} />
          </View>
          <Text style={styles.modalTitle}>{copy.title}</Text>
          <Text style={styles.modalMessage}>{copy.message(name)}</Text>

          {current.kind === 'reject' && (
            <View style={styles.reasonBlock}>
              <Text style={styles.reasonLabel}>
                Reason <Text style={styles.reasonOptional}>(optional, shared with the owner)</Text>
              </Text>
              <View style={styles.reasonChips}>
                {REJECTION_REASONS.map((r) => {
                  const selected = reason === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.reasonChip, selected && styles.reasonChipSelected]}
                      onPress={() => onReasonChange(selected ? '' : r)}
                    >
                      <Text style={[styles.reasonChipText, selected && styles.reasonChipTextSelected]}>{r}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[styles.reasonInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                placeholder="Or write your own message…"
                placeholderTextColor={Colors.textSubtle}
                value={reason}
                onChangeText={onReasonChange}
                multiline
                maxLength={300}
                textAlignVertical="top"
              />
              <Text style={styles.reasonCount}>{reason.length}/300</Text>
            </View>
          )}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onClose} disabled={loading}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalConfirm, { backgroundColor: copy.color }, loading && { opacity: 0.7 }]}
              onPress={onConfirm}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalConfirmText}>{copy.confirm}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },

  // Toolbar
  toolbar: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingTop: 16,
  },
  titleRow: { marginBottom: 12 },
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
  searchTablet: { width: 380 },
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

  chipsScroll: { paddingVertical: 12, alignItems: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 8, paddingBottom: 14, paddingTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginRight: 8,
  },
  chipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  chipTextSelected: { color: '#FFFFFF' },
  chipCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipCountText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  chipDivider: { width: 1, height: 22, backgroundColor: Colors.cardBorder, marginRight: 8 },

  // List
  listContent: { paddingTop: 16, paddingBottom: TAB_BAR_CLEARANCE },
  gridItem: { marginBottom: 14 },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 16 },
  summary: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
    marginHorizontal: 7,
  },

  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginHorizontal: 7,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: Colors.statusPending.bg,
    borderWidth: 1,
    borderColor: '#FDE7B0',
  },
  pendingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTitle: { fontSize: 14, fontWeight: '800', color: Colors.statusPending.text },
  pendingSub: { fontSize: 12, color: Colors.statusPending.text, opacity: 0.85, marginTop: 2 },
  pendingCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pendingCtaText: { fontSize: 13, fontWeight: '800', color: Colors.statusPending.text },

  footerLoader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 20 },
  footerLoaderText: { fontSize: 13, color: Colors.textMuted },
  loadMoreBtn: {
    alignSelf: 'center',
    marginVertical: 12,
    paddingHorizontal: 20,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  endText: { textAlign: 'center', fontSize: 12, color: Colors.textSubtle, paddingVertical: 16 },

  // Empty
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
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 20 },
  emptyBtnSecondary: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  emptyBtnPrimary: {
    height: 42,
    minWidth: 110,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  emptyBtnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: Colors.background,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  modalMessage: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginTop: 6 },

  reasonBlock: { marginTop: 18 },
  reasonLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 },
  reasonOptional: { fontWeight: '500', color: Colors.textSubtle },
  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  reasonChipSelected: { borderColor: Colors.danger, backgroundColor: Colors.statusRejected.bg },
  reasonChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  reasonChipTextSelected: { color: Colors.statusRejected.text },
  reasonInput: {
    minHeight: 84,
    maxHeight: 140,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
  },
  reasonCount: { alignSelf: 'flex-end', fontSize: 11, color: Colors.textSubtle, marginTop: 4 },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  modalConfirm: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
