import React, { useCallback, useEffect, useState } from 'react';
import { Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { Colors } from '../constants/colors';
import { globalSettingsService } from '../services/global-settings.service';
import { useToast } from '../context/ToastContext';
import { Mail, Info } from 'lucide-react-native';
import {
  EmailListEditor,
  ErrorView,
  FormFrame,
  FormSection,
  LoadingState,
  Notice,
  SAVE_BAR_SPACE,
  SaveBar,
  formStyles,
  isEqualJSON,
  useFormLayout,
  useUnsavedChangesGuard,
} from '../components/settings/FormKit';

/**
 * Platform settings (super admin).
 * Backend: GET/PUT /api/admin/settings — the Settings model stores `orderNotificationEmails` only.
 * These addresses receive an email for every order placed on the platform (see MailUtils).
 */
export default function GlobalSettingsScreen() {
  const { showToast } = useToast();
  const { gutter } = useFormLayout();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);

  const dirty = !isEqualJSON(emails, savedEmails);
  useUnsavedChangesGuard(dirty);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await globalSettingsService.getSettings();
      if (res.success && res.data) {
        const list = Array.isArray(res.data.orderNotificationEmails) ? res.data.orderNotificationEmails : [];
        setEmails(list);
        setSavedEmails(list);
      } else {
        setLoadError(res.message || 'Platform settings could not be loaded.');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await globalSettingsService.updateSettings({ orderNotificationEmails: emails });
      if (res.success) {
        // Trust what the server stored (it lower-cases and trims addresses).
        const stored = Array.isArray(res.data?.orderNotificationEmails) ? res.data.orderNotificationEmails : emails;
        setEmails(stored);
        setSavedEmails(stored);
        showToast({ title: 'Saved', message: 'Order notification emails updated.', type: 'success' });
      } else {
        showToast({ title: 'Save failed', message: res.message || 'Could not save settings.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Save failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={formStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Platform settings" subtitle="Applies to the whole Krifoo platform" />

      {loading ? (
        <LoadingState label="Loading platform settings…" />
      ) : loadError ? (
        <ErrorView message={loadError} onRetry={fetchSettings} />
      ) : (
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: SAVE_BAR_SPACE }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>
            <FormSection
              icon={Mail}
              title="Order notification emails"
              description="These addresses get an email for every order placed anywhere on Krifoo."
            >
              {emails.length === 0 && (
                <Notice tone="warning" icon={Info}>
                  No addresses yet — nobody will be emailed about new orders.
                </Notice>
              )}
              <EmailListEditor emails={emails} onChange={setEmails} placeholder="orders@krifoo.co.uk" emptyText="" />
              <Text style={styles.count}>
                {emails.length} {emails.length === 1 ? 'recipient' : 'recipients'}
              </Text>
            </FormSection>
          </FormFrame>
        </ScrollView>
      )}

      <SaveBar visible={dirty && !loading} saving={saving} onSave={save} onDiscard={() => setEmails(savedEmails)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 12, color: Colors.textSubtle, marginTop: 10 },
});
