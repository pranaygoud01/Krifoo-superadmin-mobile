import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Header } from '../../components/Header';
import { FilterChip } from '../../components/FilterChip';
import { StatusBadge } from '../../components/StatusBadge';
import { UserDetailModal } from '../../components/UserDetailModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Colors } from '../../constants/colors';
import { userService } from '../../services/user.service';
import { useToast } from '../../context/ToastContext';
import { UserAccount } from '../../types';
import { Search, Users, User, Bike, Trash2, Mail, Phone } from 'lucide-react-native';
import { UserListSkeleton } from '../../components/Skeleton';

export default function UsersScreen() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  // Detail Modal States
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // User Deletion States
  const [deleteUserModalVisible, setDeleteUserModalVisible] = useState(false);
  const [selectedUserToDelete, setSelectedUserToDelete] = useState<UserAccount | null>(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchUsers = async (pageNum = 1, isRefresh = false) => {
    try {
      if (pageNum === 1) {
        if (!isRefresh) setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Backend supports: userType, search, page, limit
      const res = await userService.getAllUsers({
        userType: selectedRole !== 'all' ? selectedRole : undefined,
        search: searchQuery.trim() || undefined,
        page: pageNum,
        limit: 15,
      });

      const userList = res.data || res.users;
      if (res.success && userList) {
        if (pageNum === 1) {
          setUsers(userList);
        } else {
          setUsers((prev) => [...prev, ...userList]);
        }
        setPage(pageNum);
        setTotalPages(res.totalPages || 1);
      }
    } catch (e) {
      console.error('Failed fetching users:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  // Debounced effect for search/filter fetches
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchUsers(1);
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [selectedRole, searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers(1, true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && page < totalPages) {
      fetchUsers(page + 1);
    }
  };

  const filterOptions = [
    { label: 'All Users', value: 'all', count: users.length },
    {
      label: 'Customers',
      value: 'customer',
      count: users.filter((u) => u.userType === 'customer').length,
    },
    {
      label: 'Delivery Partners',
      value: 'delivery_partner',
      count: users.filter((u) => u.userType === 'delivery_partner').length,
    },
  ];

  const handleToggleActive = async (user: UserAccount, currentActive: boolean) => {
    const res = await userService.toggleUserActive(user._id, currentActive);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, isActive: currentActive } : u))
      );
      setSelectedUser((prev) => (prev && prev._id === user._id ? { ...prev, isActive: currentActive } : prev));
      showToast({
        title: 'Status Updated',
        message: `Account status set to ${currentActive ? 'active' : 'inactive'}.`,
        type: 'success',
      });
    } else {
      showToast({ title: 'Error', message: res.message || 'Failed to update user status.', type: 'error' });
    }
  };

  const handleDeleteUser = (user: UserAccount) => {
    setSelectedUserToDelete(user);
    setDeleteUserModalVisible(true);
  };

  const handleDeleteUserConfirm = async () => {
    if (!selectedUserToDelete) return;
    const { _id: userId } = selectedUserToDelete;
    const res = await userService.deleteUser(userId);
    if (res.success) {
      setUsers((prev) => prev.filter((u) => u._id !== userId));
      showToast({ title: 'Deleted', message: 'User removed successfully.', type: 'success' });
    } else {
      showToast({ title: 'Error', message: res.message || 'Failed to delete user.', type: 'error' });
    }
    setDeleteUserModalVisible(false);
    setSelectedUserToDelete(null);
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Krifoo Admin"
      />

      {/* Search Container */}
      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textSubtle} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, or phone..."
          placeholderTextColor={Colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Row */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal={true}
          data={filterOptions}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <FilterChip
              label={item.label}
              count={item.count}
              isSelected={selectedRole === item.value}
              onPress={() => setSelectedRole(item.value)}
            />
          )}
        />
      </View>

      {/* User Cards List */}
      {loading ? (
        <UserListSkeleton />
      ) : users.length === 0 ? (
        <View style={styles.centerBox}>
          <Users size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Users Found</Text>
          <Text style={styles.emptySub}>
            No users match the selected role or search query.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.userCard}
              onPress={() => {
                setSelectedUser(item);
                setDetailModalVisible(true);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.userHeader}>
                <View style={styles.avatarCircle}>
                  {item.userType === 'delivery_partner' ? (
                    <Bike size={20} color={Colors.primary} />
                  ) : (
                    <User size={20} color={Colors.info} />
                  )}
                </View>

                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.fullName}</Text>
                  <Text style={styles.userRole}>
                    {item.userType === 'delivery_partner' ? 'Delivery Partner' : 'Customer'}
                  </Text>
                </View>

                <StatusBadge status={item.isActive ? 'active' : 'inactive'} type="user" />
              </View>

              <View style={styles.divider} />

              <View style={styles.detailsRow}>
                {item.email ? (
                  <View style={styles.infoRow}>
                    <Mail size={14} color={Colors.textSubtle} />
                    <Text style={styles.infoText}>{item.email}</Text>
                  </View>
                ) : null}

                {item.phoneNumber ? (
                  <View style={styles.infoRow}>
                    <Phone size={14} color={Colors.textSubtle} />
                    <Text style={styles.infoText}>{item.phoneNumber}</Text>
                  </View>
                ) : null}

                {item.vehicleNumber ? (
                  <Text style={styles.vehicleText}>
                    Vehicle: {item.vehicleType || ''} ({item.vehicleNumber})
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* User details overlay sheet */}
      <UserDetailModal
        visible={detailModalVisible}
        user={selectedUser}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedUser(null);
        }}
        onToggleActive={handleToggleActive}
        onDelete={handleDeleteUser}
      />

      {/* Delete User Account Confirm Modal */}
      <ConfirmModal
        visible={deleteUserModalVisible}
        title="Delete User Account"
        message={`Are you sure you want to permanently delete user '${selectedUserToDelete?.fullName || ''}' (${selectedUserToDelete?.email || ''})? This will remove all their account access and credentials.`}
        confirmText="Delete"
        isDestructive={true}
        onConfirm={handleDeleteUserConfirm}
        onClose={() => {
          setDeleteUserModalVisible(false);
          setSelectedUserToDelete(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    height: 44,
    fontSize: 13,
  },
  filterRow: {
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    color: Colors.textSubtle,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  userCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  userRole: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 10,
  },
  detailsRow: {
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  vehicleText: {
    color: Colors.primary,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    marginRight: 8,
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
