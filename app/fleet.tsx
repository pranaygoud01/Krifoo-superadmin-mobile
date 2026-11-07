/**
 * Drivers — your own delivery riders.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Alert, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Phone, Star, Bike, Car, Truck, UserMinus, Eye, EyeOff, UserPlus, Link2 } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Field, FieldRow, Segmented, Notice, PrimaryButton } from '../components/settings/FormKit';
import { SearchBar, FilterChips, Card, Badge, IconAction, EmptyState, LoadError, Fab, FAB_SPACE, initials, listStyles } from '../components/ui/ListKit';
import { restaurantOwnerService } from '../services/restaurant-owner.service';

interface Driver {
  _id: string;
  fullName: string;
  username: string;
  phoneNumber: string;
  isActive: boolean;
  deliveryPartnerProfile?: {
    vehicleType?: string;
    vehicleNumber?: string;
    licenseNumber?: string;
    isAvailable?: boolean;
    rating?: number;
    completedOrdersCount?: number;
  };
}

type Filter = 'all' | 'online' | 'offline';
type Vehicle = 'bicycle' | 'motorcycle' | 'car';

const VEHICLES: { value: Vehicle; label: string }[] = [
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'motorcycle', label: 'Motorbike' },
  { value: 'car', label: 'Car' },
];
const vehicleLabel = (v?: string) => VEHICLES.find((x) => x.value === v)?.label || (v ? v[0].toUpperCase() + v.slice(1) : 'Vehicle not set');
const VehicleIcon = ({ type }: { type?: string }) =>
  type === 'car' ? <Car size={14} color={Colors.textSubtle} /> : type === 'bicycle' || type === 'motorcycle' ? <Bike size={14} color={Colors.textSubtle} /> : <Truck size={14} color={Colors.textSubtle} />;

/** UK mobile → +447…; returns null when it isn't a valid UK mobile number. */
function normaliseUkMobile(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+44')) digits = digits.slice(3);
  else if (digits.startsWith('0044')) digits = digits.slice(4);
  else if (digits.startsWith('44') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^7\d{9}$/.test(digits) ? `+44${digits}` : null;
}

const emptyNew = { fullName: '', username: '', password: '', phone: '', vehicle: 'bicycle' as Vehicle, plate: '', licence: '' };

export default function FleetScreen() {
  const { showToast } = useToast();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [linkUsername, setLinkUsername] = useState('');
  const [form, setForm] = useState(emptyNew);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await restaurantOwnerService.getFleet();
      if (res.success) {
        setDrivers(res.data || []);
        setLoadError(null);
      } else {
        setLoadError(res.message || 'Please check your connection and try again.');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isOnline = (d: Driver) => d.isActive !== false && !!d.deliveryPartnerProfile?.isAvailable;
  const counts = useMemo(
    () => ({ all: drivers.length, online: drivers.filter(isOnline).length, offline: drivers.filter((d) => !isOnline(d)).length }),
    [drivers]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers
      .filter((d) => (filter === 'online' ? isOnline(d) : filter === 'offline' ? !isOnline(d) : true))
      .filter((d) => !q || `${d.fullName || ''} ${d.username || ''} ${d.phoneNumber || ''}`.toLowerCase().includes(q))
      .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || (a.fullName || '').localeCompare(b.fullName || ''));
  }, [drivers, query, filter]);

  /* ── Add driver ────────────────────────────────────────────────────── */

  const openAdd = () => {
    setMode('existing');
    setLinkUsername('');
    setForm(emptyNew);
    setErrors({});
    setShowPassword(false);
    setSheetOpen(true);
  };

  const setField = (key: keyof typeof emptyNew, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const linkExisting = async () => {
    const username = linkUsername.trim().toLowerCase();
    if (!username) return setErrors({ linkUsername: 'Enter the driver’s Krifoo username.' });
    if (drivers.some((d) => d.username?.toLowerCase() === username)) return setErrors({ linkUsername: 'This driver is already in your team.' });
    setSaving(true);
    try {
      const res = await restaurantOwnerService.linkDriver(username);
      if (!res.success) throw new Error(res.message || 'No driver found with that username.');
      showToast({ title: 'Driver added', message: `@${username} is now in your team.`, type: 'success' });
      setSheetOpen(false);
      load();
    } catch (e: any) {
      setErrors({ linkUsername: e?.message || 'Couldn’t add this driver.' });
    } finally {
      setSaving(false);
    }
  };

  const registerNew = async () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Enter the driver’s name.';
    const username = form.username.trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(username)) e.username = '3–30 characters: letters, numbers, . or _';
    if (form.password.length < 8) e.password = 'At least 8 characters.';
    const phone = normaliseUkMobile(form.phone);
    if (!phone) e.phone = 'Enter a UK mobile number, e.g. 07123 456789.';
    if (form.vehicle !== 'bicycle' && !form.plate.trim()) e.plate = 'Required for motorbikes and cars.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const res = await restaurantOwnerService.createDriver({
        fullName: form.fullName.trim(),
        username,
        password: form.password,
        phoneNumber: phone,
        deliveryPartnerProfile: {
          vehicleType: form.vehicle,
          vehicleNumber: form.plate.trim().toUpperCase() || undefined,
          licenseNumber: form.licence.trim().toUpperCase() || undefined,
        },
      });
      if (!res.success) throw new Error(res.message || 'Couldn’t create the driver.');
      showToast({ title: 'Driver created', message: `${form.fullName.trim()} can now sign in to the driver app as @${username}.`, type: 'success' });
      setSheetOpen(false);
      load();
    } catch (err: any) {
      showToast({ title: 'Couldn’t create driver', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = (d: Driver) => {
    Alert.alert(`Remove ${d.fullName}?`, 'They will no longer receive your delivery orders. Their Krifoo account is not deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(d._id);
          try {
            const res = await restaurantOwnerService.unlinkDriver(d._id);
            if (!res.success) throw new Error(res.message);
            setDrivers((prev) => prev.filter((x) => x._id !== d._id));
            showToast({ title: 'Driver removed', message: `${d.fullName} was removed from your team.`, type: 'info' });
          } catch (e: any) {
            showToast({ title: 'Couldn’t remove driver', message: e?.message || 'Please try again.', type: 'error' });
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  const renderDriver = ({ item: d }: { item: Driver }) => {
    const p = d.deliveryPartnerProfile || {};
    const online = isOnline(d);
    return (
      <Card>
        <View style={listStyles.row}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(d.fullName)}</Text>
            </View>
            <View style={[styles.dot, { backgroundColor: online ? Colors.success : Colors.textSubtle }]} />
          </View>
          <View style={listStyles.flex}>
            <Text style={listStyles.title} numberOfLines={1}>
              {d.fullName || 'Unnamed driver'}
            </Text>
            <Text style={listStyles.sub}>@{d.username}</Text>
          </View>
          <Badge label={d.isActive === false ? 'Account disabled' : online ? 'Online' : 'Offline'} tone={d.isActive === false ? 'danger' : online ? 'success' : 'neutral'} />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <VehicleIcon type={p.vehicleType} />
            <Text style={listStyles.meta}>
              {vehicleLabel(p.vehicleType)}
              {p.vehicleNumber ? ` · ${p.vehicleNumber}` : ''}
            </Text>
          </View>
          <Text style={listStyles.meta}>
            {p.completedOrdersCount || 0} deliver{(p.completedOrdersCount || 0) === 1 ? 'y' : 'ies'}
          </Text>
          {typeof p.rating === 'number' && (p.completedOrdersCount || 0) > 0 ? (
            <View style={styles.meta}>
              <Star size={14} color="#F59E0B" fill="#F59E0B" />
              <Text style={listStyles.meta}>{p.rating.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          {d.phoneNumber ? (
            <TouchableOpacity style={styles.phone} onPress={() => Linking.openURL(`tel:${d.phoneNumber.replace(/\s/g, '')}`)} accessibilityRole="button" accessibilityLabel={`Call ${d.fullName}`}>
              <Phone size={14} color={Colors.primary} />
              <Text style={styles.phoneText}>{d.phoneNumber}</Text>
            </TouchableOpacity>
          ) : (
            <View style={listStyles.flex} />
          )}
          <IconAction icon={UserMinus} label={`Remove ${d.fullName}`} tone="danger" onPress={() => remove(d)} busy={busyId === d._id} />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Drivers" subtitle={`${counts.online} online · ${counts.all} in your team`} />

      <View style={listStyles.toolbar}>
        <View style={[listStyles.frame, styles.toolbarInner]}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search name, username or phone" />
          <FilterChips<Filter>
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'online', label: 'Online', count: counts.online },
              { value: 'offline', label: 'Offline', count: counts.offline },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>
      </View>

      {loading ? (
        <EmptyState icon={Truck} title="Loading drivers…" />
      ) : loadError && drivers.length === 0 ? (
        <LoadError message={loadError} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(d) => d._id}
          renderItem={renderDriver}
          contentContainerStyle={[styles.list, listStyles.frame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
          ListEmptyComponent={
            drivers.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="No drivers yet"
                message="Add your own riders to deliver your orders. They sign in to the Krifoo driver app with the username you give them."
                actionLabel="Add a driver"
                onAction={openAdd}
              />
            ) : (
              <EmptyState icon={Truck} title="No drivers match" message="Try a different search or filter." />
            )
          }
        />
      )}

      {drivers.length > 0 && <Fab label="Add driver" icon={Plus} onPress={openAdd} />}

      <BottomSheet
        visible={sheetOpen}
        title="Add a driver"
        subtitle="Drivers deliver your orders using the Krifoo driver app"
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <PrimaryButton label="Cancel" tone="secondary" onPress={() => setSheetOpen(false)} style={styles.flex} />
            <PrimaryButton
              label={mode === 'existing' ? 'Add to my team' : 'Create driver'}
              icon={mode === 'existing' ? Link2 : UserPlus}
              onPress={mode === 'existing' ? linkExisting : registerNew}
              loading={saving}
              style={styles.flex}
            />
          </>
        }
      >
        <Segmented
          options={[
            { value: 'existing', label: 'Has a Krifoo account' },
            { value: 'new', label: 'New driver' },
          ]}
          value={mode}
          onChange={(v) => {
            setMode(v as 'existing' | 'new');
            setErrors({});
          }}
        />

        {mode === 'existing' ? (
          <>
            <Notice tone="info">Ask the driver for the username they use to sign in to the Krifoo driver app.</Notice>
            <Field
              label="Driver username"
              value={linkUsername}
              onChangeText={(v) => {
                setLinkUsername(v);
                setErrors({});
              }}
              placeholder="e.g. david.rider"
              autoCapitalize="none"
              autoCorrect={false}
              prefix="@"
              error={errors.linkUsername}
              onSubmitEditing={linkExisting}
              returnKeyType="done"
            />
          </>
        ) : (
          <>
            <Field label="Full name" required value={form.fullName} onChangeText={(v) => setField('fullName', v)} placeholder="e.g. David Smith" autoCapitalize="words" error={errors.fullName} />
            <Field
              label="Mobile number"
              required
              value={form.phone}
              onChangeText={(v) => setField('phone', v)}
              placeholder="07123 456789"
              keyboardType="phone-pad"
              error={errors.phone}
            />
            <FieldRow>
              <Field
                label="Username"
                required
                value={form.username}
                onChangeText={(v) => setField('username', v.toLowerCase().replace(/\s/g, ''))}
                placeholder="david.rider"
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.username}
              />
              <Field
                label="Password"
                required
                value={form.password}
                onChangeText={(v) => setField('password', v)}
                placeholder="8+ characters"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.password}
                trailing={
                  <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={18} color={Colors.textSubtle} /> : <Eye size={18} color={Colors.textSubtle} />}
                  </TouchableOpacity>
                }
              />
            </FieldRow>
            <Text style={styles.label}>Vehicle</Text>
            <Segmented options={VEHICLES} value={form.vehicle} onChange={(v) => setField('vehicle', v)} />
            <FieldRow>
              <Field
                label={form.vehicle === 'bicycle' ? 'Number plate (optional)' : 'Number plate'}
                required={form.vehicle !== 'bicycle'}
                value={form.plate}
                onChangeText={(v) => setField('plate', v)}
                placeholder="AB12 CDE"
                autoCapitalize="characters"
                error={errors.plate}
              />
              <Field label="Licence no. (optional)" value={form.licence} onChangeText={(v) => setField('licence', v)} placeholder="SMITH987654" autoCapitalize="characters" />
            </FieldRow>
            <Notice tone="info">Share the username and password with the driver so they can sign in to the Krifoo driver app.</Notice>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  flex: { flex: 1 },
  toolbarInner: { paddingHorizontal: 16 },
  list: { padding: 16, paddingBottom: FAB_SPACE },
  avatarWrap: { width: 44, height: 44 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900', color: Colors.primaryDark },
  dot: { position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: Colors.background },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  phone: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },
});
