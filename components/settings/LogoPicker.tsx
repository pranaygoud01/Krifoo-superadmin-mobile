import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Trash2 } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { useToast } from '../../context/ToastContext';
import { ConfirmModal } from '../ConfirmModal';
import { restaurantOwnerService } from '../../services/restaurant-owner.service';

const MAX_BYTES = 5 * 1024 * 1024; // server limit for this upload

/**
 * Restaurant logo: square preview + upload / change / remove. Saves immediately (separate from
 * the profile form's Save button). Also used as the ordering website's logo unless that has its own.
 */
export function LogoPicker({
  logoUrl,
  restaurantName,
  onChange,
}: {
  logoUrl?: string;
  restaurantName?: string;
  onChange: (url: string) => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const initials =
    (restaurantName || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ title: 'Photo access needed', message: 'Allow photo access in Settings to choose a logo.', type: 'info' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_BYTES) {
      showToast({ title: 'Image too large', message: 'Choose an image under 5 MB.', type: 'error' });
      return;
    }

    setBusy('upload');
    try {
      const res = await restaurantOwnerService.uploadLogo(asset.uri);
      if (!res.success || !res.data?.logoUrl) throw new Error(res.message || 'Could not upload the logo.');
      onChange(res.data.logoUrl);
      showToast({ title: 'Logo updated', message: 'Your new logo is live.', type: 'success' });
    } catch (err: any) {
      showToast({ title: 'Logo not uploaded', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setConfirmRemove(false);
    setBusy('remove');
    try {
      const res = await restaurantOwnerService.removeLogo();
      if (!res.success) throw new Error(res.message || 'Could not remove the logo.');
      onChange('');
      showToast({ title: 'Logo removed', message: '', type: 'success' });
    } catch (err: any) {
      showToast({ title: 'Logo not removed', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={pick}
        disabled={busy !== null}
        activeOpacity={0.8}
        style={styles.preview}
        accessibilityRole="button"
        accessibilityLabel={logoUrl ? 'Change logo' : 'Upload logo'}
      >
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.image} contentFit="cover" transition={150} />
        ) : (
          <Text style={styles.initials}>{initials}</Text>
        )}
        {busy ? (
          <View style={styles.overlay}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </TouchableOpacity>

      <View style={styles.side}>
        <Text style={styles.title}>Logo</Text>
        <Text style={styles.hint}>Square image, JPG, PNG or WEBP, up to 5 MB.</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={pick} disabled={busy !== null} style={styles.primaryBtn} activeOpacity={0.8}>
            <ImagePlus size={16} color="#FFFFFF" />
            <Text style={styles.primaryText}>{busy === 'upload' ? 'Uploading…' : logoUrl ? 'Change' : 'Upload logo'}</Text>
          </TouchableOpacity>
          {logoUrl ? (
            <TouchableOpacity
              onPress={() => setConfirmRemove(true)}
              disabled={busy !== null}
              style={styles.removeBtn}
              activeOpacity={0.8}
              accessibilityLabel="Remove logo"
            >
              <Trash2 size={16} color="#DC2626" />
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ConfirmModal
        visible={confirmRemove}
        title="Remove logo?"
        message="Your store will show your initials instead until you upload a new logo."
        confirmText="Remove"
        isDestructive
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  preview: {
    width: 88,
    height: 88,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  initials: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center' },
  side: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  primaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  removeText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
});
