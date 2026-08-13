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
import { Colors } from '../../constants/colors';
import { userService } from '../../services/user.service';
import { UserAccount } from '../../types';
import { Search, Users, User, Bike, Trash2, Mail, Phone } from 'lucide-react-native';

export default function UsersScreen() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const fetchUsers = async () => {
    try {
      const res = await userService.getAllUsers();
      if (res.success && res.data) {
        setUsers(res.data);
      }
    } catch (e) {
      console.error('Failed fetching users:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
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

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (selectedRole !== 'all' && u.userType !== selectedRole) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = u.fullName?.toLowerCase().includes(q);
        const emailMatch = u.email?.toLowerCase().includes(q);
        const phoneMatch = u.phoneNumber?.toLowerCase().includes(q);
        return nameMatch || emailMatch || phoneMatch;
      }

      return true;
    });
  }, [users, selectedRole, searchQuery]);

  const handleToggleActive = async (user: UserAccount, currentActive: boolean) => {
    const res = await userService.toggleUserActive(user._id, currentActive);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) => (u._id === user._id ? { ...u, isActive: currentActive } : u))
      );
    } else {
      Alert.alert('Error', res.message || 'Failed to update user status.');
    }
  };

  const handleDeleteUser = (user: UserAccount) => {
    Alert.alert(
      'Confirm Delete',
      `Permanently delete user '${user.fullName}' (${user.email})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await userService.deleteUser(user._id);
            if (res.success) {
              setUsers((prev) => prev.filter((u) => u._id !== user._id));
              Alert.alert('Deleted', 'User removed successfully.');
            } else {
              Alert.alert('Error', res.message || 'Failed to delete user.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Krifoo Admin"
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textSubtle} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users by name, email, or phone..."
          placeholderTextColor={Colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Role Filter Chips */}
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

      {/* Users List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching platform users...</Text>
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.centerBox}>
          <Users size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Users Found</Text>
          <Text style={styles.emptySub}>No users match the search filter.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.userCard}>
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

              <View style={styles.divider} />

              <View style={styles.cardFooter}>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Active Account:</Text>
                  <Switch
                    value={item.isActive}
                    onValueChange={(val) => handleToggleActive(item, val)}
                    trackColor={{ false: '#334155', true: '#10B981' }}
                    thumbColor={item.isActive ? '#FFFFFF' : '#94A3B8'}
                  />
                </View>

                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteUser(item)}
                >
                  <Trash2 size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
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
    paddingBottom: 20,
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
    backgroundcolor: '#FFFFFF',
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
    backgroundcolor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
});
