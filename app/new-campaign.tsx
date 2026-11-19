/**
 * New email campaign (Super Admin): Audience → Content → Review & send.
 * The preview mirrors the email layout; "Send test" delivers the exact email to you.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Send, Users, Store, Mail, Globe, MapPin, RefreshCw } from 'lucide-react-native';
import { Image } from 'expo-image';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { Field, Notice, PrimaryButton, FormFrame } from '../components/settings/FormKit';
import { SearchBar, listStyles } from '../components/ui/ListKit';
import { restaurantService } from '../services/restaurant.service';
import { marketingService, type AudienceInfo, type CampaignAudience, type CampaignContent } from '../services/marketing.service';
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';

type Step = 'audience' | 'content' | 'review';
const STEPS: { value: Step; label: string }[] = [
  { value: 'audience', label: '1. Audience' },
  { value: 'content', label: '2. Message' },
  { value: 'review', label: '3. Review' },
];

interface RestaurantOption {
  _id: string;
  restaurantName: string;
  area?: string;
  logoUrl?: string;
}

const RESTAURANT_LIST_LIMIT = 30;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

function RestaurantAvatar({ r, size = 40 }: { r: RestaurantOption; size?: number }) {
  return r.logoUrl ? (
    <Image source={{ uri: r.logoUrl }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 4 }]} contentFit="cover" />
  ) : (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 4 }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{initialsOf(r.restaurantName)}</Text>
    </View>
  );
}

export default function NewCampaignScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('audience');

  // Audience
  const [audience, setAudience] = useState<CampaignAudience>('all');
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [restaurantsState, setRestaurantsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [restaurant, setRestaurant] = useState<RestaurantOption | null>(null);
  const [audienceInfo, setAudienceInfo] = useState<AudienceInfo | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Content
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [offerTitle, setOfferTitle] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [bodyContent, setBodyContent] = useState('');
  const [ctaText, setCtaText] = useState('Order Now');
  const [ctaUrl, setCtaUrl] = useState('https://krifoo.co.uk');
  const [showErrors, setShowErrors] = useState(false);

  // Review
  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [sendingTest, setSendingTest] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [sending, setSending] = useState(false);

  // Restaurants for the audience picker
  const loadRestaurants = () => {
    setRestaurantsState('loading');
    restaurantService
      .getRestaurants({ limit: 200 })
      .then((res) => {
        if (!res.success || !res.data) throw new Error(res.message);
        setRestaurants(
          res.data
            .map((r: any) => ({
              _id: r._id,
              restaurantName: r.restaurantName || r.name || 'Restaurant',
              area: [r.address?.area, r.address?.city].filter(Boolean).join(', ') || undefined,
              logoUrl: r.logoUrl || undefined,
            }))
            .sort((a: RestaurantOption, b: RestaurantOption) => a.restaurantName.localeCompare(b.restaurantName))
        );
        setRestaurantsState('ready');
      })
      .catch(() => setRestaurantsState('error'));
  };
  useEffect(loadRestaurants, []);

  // Live recipient count + daily allowance
  useEffect(() => {
    if (audience === 'restaurant_specific' && !restaurant) {
      setAudienceInfo(null);
      return;
    }
    let cancelled = false;
    setAudienceLoading(true);
    marketingService
      .getAudience(audience, restaurant?._id)
      .then((res) => !cancelled && setAudienceInfo(res.success && res.data ? res.data : null))
      .catch(() => !cancelled && setAudienceInfo(null))
      .finally(() => !cancelled && setAudienceLoading(false));
    return () => {
      cancelled = true;
    };
  }, [audience, restaurant]);

  const content: CampaignContent = useMemo(
    () => ({
      subject: subject.trim(),
      offerTitle: offerTitle.trim(),
      discountValue: discountValue.trim(),
      promoCode: promoCode.trim().toUpperCase(),
      bodyContent: bodyContent.trim(),
      callToActionText: ctaText.trim() || 'Order Now',
      callToActionUrl: ctaUrl.trim() || 'https://krifoo.co.uk',
    }),
    [subject, offerTitle, discountValue, promoCode, bodyContent, ctaText, ctaUrl]
  );

  const recipients = audienceInfo?.count ?? 0;
  const overLimit = !!audienceInfo && recipients > audienceInfo.remainingToday;
  const audienceReady = (audience === 'all' || !!restaurant) && !!audienceInfo && recipients > 0 && !overLimit;

  const errors = {
    title: !title.trim() ? 'Give the campaign a name (only you see this).' : undefined,
    subject: !subject.trim() ? 'Subject is required.' : undefined,
    body: !bodyContent.trim() ? 'Write the message customers will read.' : undefined,
    ctaUrl: ctaUrl.trim() && !/^https?:\/\//i.test(ctaUrl.trim()) ? 'Link must start with https://' : undefined,
  };
  const contentReady = !errors.title && !errors.subject && !errors.body && !errors.ctaUrl;

  const goToContent = () => setStep('content');
  const goToReview = () => {
    if (!contentReady) {
      setShowErrors(true);
      return;
    }
    setStep('review');
  };

  const sendTest = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
      showToast({ title: 'Check the email', message: 'Enter a valid email address for the test.', type: 'error' });
      return;
    }
    setSendingTest(true);
    try {
      const res = await marketingService.sendTest(testEmail.trim(), content, restaurant?.restaurantName);
      if (!res.success) throw new Error(res.message || 'Test email failed.');
      showToast({ title: 'Test sent', message: res.message || `Check ${testEmail.trim()}.`, type: 'success' });
    } catch (err: any) {
      showToast({ title: 'Test not sent', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setSendingTest(false);
    }
  };

  const send = async () => {
    setConfirmVisible(false);
    setSending(true);
    try {
      const res = await marketingService.send(title.trim(), audience, restaurant?._id, content);
      if (!res.success) throw new Error(res.message || 'Campaign not sent.');
      showToast({ title: 'Campaign sending', message: res.message || '', type: 'success' });
      router.back();
    } catch (err: any) {
      showToast({ title: 'Campaign not sent', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const q = restaurantQuery.trim().toLowerCase();
  const visibleRestaurants = restaurants.filter(
    (r) => r.restaurantName.toLowerCase().includes(q) || (r.area || '').toLowerCase().includes(q)
  );

  /* ── Steps ───────────────────────────────────────────────────────────── */

  const AUDIENCE_OPTIONS: { value: CampaignAudience; title: string; sub: string; icon: typeof Globe }[] = [
    { value: 'all', title: 'All customers', sub: 'Everyone subscribed to Krifoo emails', icon: Globe },
    { value: 'restaurant_specific', title: 'One restaurant', sub: 'Customers who ordered from one restaurant', icon: Store },
  ];

  const restaurantPicker = restaurant ? (
    // Chosen: compact card, so the audience size below stays in view
    <View style={styles.chosenCard}>
      <RestaurantAvatar r={restaurant} size={48} />
      <View style={listStyles.flex}>
        <Text style={styles.chosenLabel}>Sending to customers of</Text>
        <Text style={styles.chosenName} numberOfLines={1}>{restaurant.restaurantName}</Text>
        {restaurant.area ? (
          <View style={styles.areaRow}>
            <MapPin size={12} color={Colors.textMuted} />
            <Text style={styles.areaText} numberOfLines={1}>{restaurant.area}</Text>
          </View>
        ) : null}
      </View>
      <TouchableOpacity style={styles.changeBtn} onPress={() => setRestaurant(null)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Choose a different restaurant">
        <Text style={styles.changeText}>Change</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.pickerCard}>
      <View style={styles.pickerHead}>
        <Text style={styles.pickerTitle}>Choose a restaurant</Text>
        {restaurantsState === 'ready' ? <Text style={listStyles.meta}>{restaurants.length} total</Text> : null}
      </View>
      <SearchBar value={restaurantQuery} onChangeText={setRestaurantQuery} placeholder="Search by name or area" />

      {restaurantsState === 'loading' ? (
        <View style={styles.pickerState}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={listStyles.meta}>Loading restaurants…</Text>
        </View>
      ) : restaurantsState === 'error' ? (
        <TouchableOpacity style={styles.pickerState} onPress={loadRestaurants} activeOpacity={0.7}>
          <RefreshCw size={18} color={Colors.primary} />
          <Text style={styles.retryText}>Couldn’t load restaurants. Tap to retry.</Text>
        </TouchableOpacity>
      ) : visibleRestaurants.length === 0 ? (
        <View style={styles.pickerState}>
          <Text style={listStyles.meta}>{q ? `No restaurants match “${restaurantQuery.trim()}”.` : 'No restaurants yet.'}</Text>
        </View>
      ) : (
        <View style={styles.restaurantList}>
          {visibleRestaurants.slice(0, RESTAURANT_LIST_LIMIT).map((r, i) => (
            <TouchableOpacity
              key={r._id}
              style={[styles.restaurantRow, i > 0 && styles.restaurantRowBorder]}
              onPress={() => {
                setRestaurant(r);
                setRestaurantQuery('');
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Send to customers of ${r.restaurantName}`}
            >
              <RestaurantAvatar r={r} />
              <View style={listStyles.flex}>
                <Text style={styles.restaurantName} numberOfLines={1}>{r.restaurantName}</Text>
                {r.area ? <Text style={styles.areaText} numberOfLines={1}>{r.area}</Text> : null}
              </View>
              <View style={styles.radio} />
            </TouchableOpacity>
          ))}
          {visibleRestaurants.length > RESTAURANT_LIST_LIMIT ? (
            <Text style={styles.moreText}>
              Showing {RESTAURANT_LIST_LIMIT} of {visibleRestaurants.length}. Search to find others.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );

  const audienceStep = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Who should receive it?</Text>
      <View style={styles.audienceOptions}>
        {AUDIENCE_OPTIONS.map((opt) => {
          const active = audience === opt.value;
          const Icon = opt.icon;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.audienceOption, active && styles.audienceOptionActive]}
              onPress={() => {
                setAudience(opt.value);
                if (opt.value === 'all') setRestaurant(null);
              }}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <View style={[styles.audienceIcon, active && styles.audienceIconActive]}>
                <Icon size={18} color={active ? '#FFFFFF' : Colors.primary} />
              </View>
              <View style={listStyles.flex}>
                <Text style={[styles.audienceTitle, active && styles.audienceTitleActive]}>{opt.title}</Text>
                <Text style={styles.audienceOptionSub}>{opt.sub}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioOn]}>{active ? <View style={styles.radioDot} /> : null}</View>
            </TouchableOpacity>
          );
        })}
      </View>

      {audience === 'restaurant_specific' ? restaurantPicker : null}

      {audience === 'all' || restaurant ? (
        <View style={[styles.audienceCard, overLimit && styles.audienceCardWarn]}>
          <View style={[styles.countIcon, overLimit && styles.countIconWarn]}>
            <Users size={20} color={overLimit ? '#DC2626' : Colors.primary} />
          </View>
          <View style={listStyles.flex}>
            {audienceLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ alignSelf: 'flex-start' }} />
            ) : audienceInfo ? (
              <>
                <Text style={styles.audienceValue}>
                  {recipients} subscribed {recipients === 1 ? 'customer' : 'customers'}
                </Text>
                <Text style={styles.audienceSub}>
                  {audienceInfo.remainingToday} of {audienceInfo.dailyLimit} marketing emails left today
                </Text>
              </>
            ) : (
              <Text style={styles.audienceSub}>Could not load the audience size.</Text>
            )}
          </View>
        </View>
      ) : null}

      {overLimit ? (
        <Notice tone="danger" title="Too many recipients for today">
          {`This audience has ${recipients} customers but only ${audienceInfo?.remainingToday ?? 0} more marketing emails can be sent in the next 24 hours. ${
            audience === 'all' ? 'Choose one restaurant instead, or try again tomorrow.' : 'Try again tomorrow, or raise the daily limit on the server.'
          }`}
        </Notice>
      ) : null}
      {audienceInfo && recipients === 0 && (audience === 'all' || restaurant) ? (
        <Notice tone="warning">
          {audience === 'all'
            ? 'No subscribed customers yet. Use “Sync from orders” on the Contacts tab first.'
            : 'No subscribed customers for this restaurant yet. Choose another, or sync contacts from orders.'}
        </Notice>
      ) : null}
    </View>
  );

  const contentStep = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Write the message</Text>
      <Field
        label="Campaign name"
        required
        placeholder="e.g. Weekend 20% off — Nov"
        value={title}
        onChangeText={setTitle}
        maxLength={150}
        hint="Only shown in your campaign history."
        error={showErrors ? errors.title : undefined}
      />
      <Field
        label="Email subject"
        required
        placeholder="e.g. 20% off your next order this weekend"
        value={subject}
        onChangeText={setSubject}
        maxLength={150}
        error={showErrors ? errors.subject : undefined}
      />
      <Field label="Headline" placeholder="e.g. Your weekend treat is here" value={offerTitle} onChangeText={setOfferTitle} maxLength={150} />
      <View style={styles.twoCol}>
        <Field label="Offer label" placeholder="20% OFF" value={discountValue} onChangeText={setDiscountValue} maxLength={60} containerStyle={styles.col} />
        <Field label="Promo code" placeholder="SAVE20" value={promoCode} onChangeText={(v) => setPromoCode(v.toUpperCase())} autoCapitalize="characters" maxLength={40} containerStyle={styles.col} />
      </View>
      <Field
        label="Message"
        required
        placeholder={'Hi there!\n\nEnjoy 20% off everything this weekend…'}
        value={bodyContent}
        onChangeText={setBodyContent}
        multiline
        maxLength={10000}
        style={styles.multiline}
        hint="Each new line becomes a paragraph."
        error={showErrors ? errors.body : undefined}
      />
      <View style={styles.twoCol}>
        <Field label="Button text" value={ctaText} onChangeText={setCtaText} maxLength={40} containerStyle={styles.col} />
        <Field
          label="Button link"
          value={ctaUrl}
          onChangeText={setCtaUrl}
          autoCapitalize="none"
          keyboardType="url"
          maxLength={500}
          containerStyle={styles.col}
          error={showErrors ? errors.ctaUrl : undefined}
        />
      </View>
      {promoCode ? (
        <Notice tone="info">Make sure the promo code “{promoCode.toUpperCase()}” exists and is active, or customers can’t use it.</Notice>
      ) : null}
    </View>
  );

  const reviewStep = (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Preview</Text>
      <EmailPreview content={content} restaurantName={audience === 'restaurant_specific' ? restaurant?.restaurantName : undefined} />

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Send a test first</Text>
      <View style={styles.testRow}>
        <Field
          label="Test email"
          value={testEmail}
          onChangeText={setTestEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          containerStyle={styles.col}
        />
        <PrimaryButton label="Send test" icon={Mail} tone="secondary" loading={sendingTest} onPress={sendTest} style={styles.testBtn} />
      </View>

      <View style={styles.summaryBox}>
        <SummaryLine label="To" value={`${recipients} ${audience === 'restaurant_specific' ? `customers of ${restaurant?.restaurantName}` : 'subscribed customers'}`} />
        <SummaryLine label="Subject" value={content.subject} />
        <SummaryLine label="Campaign" value={title.trim()} />
      </View>
      <Notice tone="info">Every email includes an unsubscribe link. People who unsubscribe are never emailed again.</Notice>
    </View>
  );

  /* ── Footer per step ─────────────────────────────────────────────────── */

  const footer =
    step === 'audience' ? (
      <PrimaryButton label="Next: write the message" onPress={goToContent} disabled={!audienceReady} />
    ) : step === 'content' ? (
      <View style={styles.footerRow}>
        <PrimaryButton label="Back" tone="secondary" onPress={() => setStep('audience')} style={styles.backBtn} />
        <PrimaryButton label="Next: review" onPress={goToReview} style={styles.flex1} />
      </View>
    ) : (
      <View style={styles.footerRow}>
        <PrimaryButton label="Back" tone="secondary" onPress={() => setStep('content')} style={styles.backBtn} />
        <PrimaryButton
          label={`Send to ${recipients}`}
          icon={Send}
          loading={sending}
          disabled={!audienceReady || !contentReady}
          onPress={() => setConfirmVisible(true)}
          style={styles.flex1}
        />
      </View>
    );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="New campaign" subtitle="Email offer to customers" />
      <KeyboardAvoidingView style={styles.flex1} behavior={KEYBOARD_BEHAVIOR}>
        <View style={styles.stepsBar}>
          <View style={[listStyles.frame, styles.stepsInner]}>
            {STEPS.map((s, i) => {
              const active = s.value === step;
              const done = STEPS.findIndex((x) => x.value === step) > i;
              return (
                <View key={s.value} style={[styles.stepPill, active && styles.stepPillActive, done && styles.stepPillDone]}>
                  {done ? <Check size={13} color="#047857" strokeWidth={3} /> : null}
                  <Text style={[styles.stepText, active && styles.stepTextActive, done && styles.stepTextDone]} numberOfLines={1}>{s.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <FormFrame>{step === 'audience' ? audienceStep : step === 'content' ? contentStep : reviewStep}</FormFrame>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={listStyles.frame}>{footer}</View>
        </View>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={confirmVisible}
        title={`Send to ${recipients} customers?`}
        message={`“${content.subject}” will be emailed now. This can’t be undone.`}
        confirmText="Send campaign"
        onConfirm={send}
        onClose={() => setConfirmVisible(false)}
      />
    </View>
  );
}

/** Native approximation of the email template (the test email shows the exact one). */
function EmailPreview({ content, restaurantName }: { content: CampaignContent; restaurantName?: string }) {
  const paragraphs = content.bodyContent.split('\n').filter((l) => l.trim());
  return (
    <View style={styles.preview}>
      <View style={styles.previewHeader}>
        <Text style={styles.previewBrand}>Krifoo</Text>
        <Text style={styles.previewBrandSub}>{restaurantName ? `From ${restaurantName}` : 'Deals & offers'}</Text>
      </View>
      <View style={styles.previewBody}>
        {content.discountValue ? (
          <View style={styles.previewBadge}><Text style={styles.previewBadgeText}>{content.discountValue}</Text></View>
        ) : null}
        {content.offerTitle ? <Text style={styles.previewHeadline}>{content.offerTitle}</Text> : null}
        {paragraphs.length ? (
          paragraphs.map((p, i) => <Text key={i} style={styles.previewPara}>{p}</Text>)
        ) : (
          <Text style={[styles.previewPara, { color: '#94A3B8' }]}>Your message will appear here.</Text>
        )}
        {content.promoCode ? (
          <View style={styles.previewCode}>
            <Text style={styles.previewCodeLabel}>PROMO CODE</Text>
            <Text style={styles.previewCodeValue}>{content.promoCode}</Text>
          </View>
        ) : null}
        <View style={styles.previewCta}><Text style={styles.previewCtaText}>{content.callToActionText || 'Order Now'}</Text></View>
      </View>
      <Text style={styles.previewFooter}>Unsubscribe from marketing emails</Text>
    </View>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex1: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },

  stepsBar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, paddingVertical: 10, paddingHorizontal: 16 },
  stepsInner: { flexDirection: 'row', gap: 6 },
  stepPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 34, borderRadius: 8, backgroundColor: '#F1F3F5' },
  stepPillActive: { backgroundColor: Colors.text },
  stepPillDone: { backgroundColor: '#ECFDF5' },
  stepText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  stepTextActive: { color: '#FFFFFF' },
  stepTextDone: { color: '#047857' },

  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  hint: { fontSize: 12.5, color: Colors.textMuted },

  audienceOptions: { gap: 10 },
  audienceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF',
  },
  audienceOptionActive: { borderColor: Colors.primary, borderWidth: 2, padding: 13, backgroundColor: '#FFF7ED' },
  audienceIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight },
  audienceIconActive: { backgroundColor: Colors.primary },
  audienceTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.text },
  audienceTitleActive: { color: Colors.primary },
  audienceOptionSub: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  pickerCard: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, padding: 14 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  pickerTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  pickerState: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  retryText: { fontSize: 13.5, fontWeight: '700', color: Colors.primary },
  restaurantList: { marginTop: 4 },
  restaurantRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  restaurantRowBorder: { borderTopWidth: 1, borderTopColor: '#F1F3F5' },
  restaurantName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  moreText: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', paddingTop: 10 },
  avatar: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontWeight: '800', color: Colors.primary },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  areaText: { fontSize: 12.5, color: Colors.textMuted, marginTop: 1, flexShrink: 1 },

  chosenCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF',
  },
  chosenLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chosenName: { fontSize: 16, fontWeight: '800', color: Colors.text, marginTop: 1 },
  changeBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder, justifyContent: 'center' },
  changeText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  audienceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  audienceValue: { fontSize: 17, fontWeight: '800', color: Colors.text },
  audienceSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  audienceCardWarn: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  countIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight },
  countIconWarn: { backgroundColor: '#FEE2E2' },

  twoCol: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  col: { flex: 1, minWidth: 140 },
  multiline: { minHeight: 140, textAlignVertical: 'top' },

  testRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },
  testBtn: { minWidth: 130 },

  summaryBox: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: 14, paddingVertical: 4 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  summaryLabel: { fontSize: 14, color: Colors.textMuted },
  summaryValue: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: Colors.text, textAlign: 'right' },

  footer: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: 12, paddingHorizontal: 16 },
  footerRow: { flexDirection: 'row', gap: 10 },
  backBtn: { minWidth: 96 },

  preview: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  previewHeader: { backgroundColor: '#F97316', paddingVertical: 20, alignItems: 'center' },
  previewBrand: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  previewBrandSub: { color: '#FFFFFF', opacity: 0.9, fontSize: 13, marginTop: 4 },
  previewBody: { padding: 20 },
  previewBadge: { alignSelf: 'center', backgroundColor: '#FFEDD5', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 12 },
  previewBadgeText: { color: '#C2410C', fontWeight: '700', fontSize: 13 },
  previewHeadline: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 12 },
  previewPara: { fontSize: 15, lineHeight: 23, color: '#334155', marginBottom: 10 },
  previewCode: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#F97316', borderRadius: 10, padding: 12, alignItems: 'center', marginVertical: 12, backgroundColor: '#FFF7ED' },
  previewCodeLabel: { fontSize: 11, fontWeight: '700', color: '#9A3412', letterSpacing: 1 },
  previewCodeValue: { fontSize: 22, fontWeight: '800', color: '#EA580C', letterSpacing: 3 },
  previewCta: { alignSelf: 'center', backgroundColor: '#F97316', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  previewCtaText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  previewFooter: { textAlign: 'center', fontSize: 12, color: '#F97316', textDecorationLine: 'underline', paddingVertical: 14, backgroundColor: '#F8FAFC' },
});
