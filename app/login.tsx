import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LocalImages } from '@/constants/local-assets';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Lock, Mail, Eye, EyeOff, WifiOff, ServerOff, AlertCircle } from 'lucide-react-native';
import Constants from 'expo-constants';
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';

interface LoginErrorDetails {
  type: 'network' | 'server' | 'auth' | 'generic';
  message: string;
  statusCode?: number;
}

/**
 * Layouts:
 *  - stack: phone portrait — cover on top, form below
 *  - card:  tablet portrait — centred card
 *  - split: landscape tablets / POS screens and short landscape phones — cover left, form right
 */
type LayoutMode = 'stack' | 'card' | 'split';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export default function LoginScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const mode: LayoutMode =
    isLandscape && (width >= 900 || height < 560) ? 'split' : width >= 768 ? 'card' : 'stack';
  const coverHeight = mode === 'card' ? clamp(height * 0.26, 200, 300) : clamp(height * 0.34, 180, 300);
  const compactCover = mode !== 'split' && coverHeight < 230;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<LoginErrorDetails | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const { login } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const appVersion =
    Constants.expoConfig?.version ?? (Constants as any).manifest2?.extra?.expoClient?.version ?? '1.0.7';

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorDetails({ type: 'auth', message: 'Please enter both email and password.' });
      return;
    }

    setLoading(true);
    setErrorDetails(null);
    try {
      const res = await login(email.trim().toLowerCase(), password.trim());
      if (res.success) {
        showToast({ title: 'Welcome', message: 'Logged in successfully.', type: 'success' });
        router.replace('/(tabs)');
      } else {
        const isNet = res.errorType === 'network';
        const isSrv = res.errorType === 'server' || (res.statusCode && res.statusCode >= 500);
        setErrorDetails({
          type: isNet ? 'network' : isSrv ? 'server' : 'auth',
          message: res.message || (isNet ? 'Cannot connect to backend server' : 'Invalid email or password.'),
          statusCode: res.statusCode,
        });
      }
    } catch (e: any) {
      setErrorDetails({ type: 'generic', message: e?.message || 'An unexpected error occurred during login.' });
    } finally {
      setLoading(false);
    }
  };

  /* ── Pieces ───────────────────────────────────────────────────────────── */

  const brandTitle = (big: boolean) => (
    <>
      <Text style={[styles.coverTitle, big && styles.coverTitleBig, compactCover && styles.coverTitleCompact]}>Krifoo Admin</Text>
      <Text style={[styles.coverSubtitle, big && styles.coverSubtitleBig]}>Management Application</Text>
    </>
  );

  const logo = (
    <View style={styles.logoCircle}>
      <Image source={LocalImages.logo} style={styles.logoImage} contentFit="contain" />
    </View>
  );

  const form = (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Welcome back</Text>
      <Text style={styles.formSubtitle}>Sign in to manage your operations</Text>

      {errorDetails ? (
        <View
          style={[styles.errorCard, errorDetails.type === 'network' ? styles.errorCardNetwork : styles.errorCardGeneral]}
          accessibilityRole="alert"
        >
          <View style={styles.errorIconWrap}>
            {errorDetails.type === 'network' ? (
              <WifiOff size={20} color="#D97706" />
            ) : errorDetails.type === 'server' ? (
              <ServerOff size={20} color="#DC2626" />
            ) : (
              <AlertCircle size={20} color="#DC2626" />
            )}
          </View>
          <View style={styles.flex}>
            <Text style={[styles.errorCardTitle, { color: errorDetails.type === 'network' ? '#92400E' : '#991B1B' }]}>
              {errorDetails.type === 'network'
                ? 'Server unreachable'
                : errorDetails.type === 'server'
                ? `Server error (${errorDetails.statusCode || 500})`
                : 'Sign-in failed'}
            </Text>
            <Text style={[styles.errorCardDesc, { color: errorDetails.type === 'network' ? '#B45309' : '#B91C1C' }]}>
              {errorDetails.message}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.formFields}>
        <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
          <Mail size={18} color={emailFocused ? '#0F172A' : Colors.textSubtle} />
          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor={Colors.textSubtle}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            accessibilityLabel="Email address"
          />
        </View>

        <View style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}>
          <Lock size={18} color={passwordFocused ? '#0F172A' : Colors.textSubtle} />
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textSubtle}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            accessibilityLabel="Password"
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} color={Colors.textSubtle} /> : <Eye size={18} color={Colors.textSubtle} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.loginBtn, loading && styles.loginBtnBusy]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Sign in</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.registerBtn} onPress={() => router.push('/register')} activeOpacity={0.7} accessibilityRole="link">
          <Text style={styles.registerBtnText}>
            New business? <Text style={styles.registerBtnStrong}>Register your store</Text>
          </Text>
        </TouchableOpacity>

        <Text style={styles.disclaimerText}>
          By signing in, you agree to our{' '}
          <Text style={styles.disclaimerLink} onPress={() => router.push('/terms-conditions')}>
            Terms & Conditions
          </Text>{' '}
          and{' '}
          <Text style={styles.disclaimerLink} onPress={() => router.push('/privacy-policy')}>
            Privacy Policy
          </Text>
          .
        </Text>

        <Text style={styles.versionText}>Version {appVersion}</Text>
      </View>
    </View>
  );

  /* ── Layouts ──────────────────────────────────────────────────────────── */

  if (mode === 'split') {
    return (
      <View style={styles.splitRoot}>
        <StatusBar style="dark" />
        <View style={styles.splitCover}>
          <Image source={LocalImages.loginCover} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[styles.coverOverlay, styles.splitCoverOverlay]}>
            {logo}
            <View style={styles.splitBrandText}>{brandTitle(height >= 560)}</View>
          </View>
        </View>

        <KeyboardAvoidingView style={styles.splitFormPane} behavior={KEYBOARD_BEHAVIOR}>
          <ScrollView
            contentContainerStyle={[
              styles.splitScroll,
              { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingRight: insets.right + 24 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formMaxWidth}>{form}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  const isCard = mode === 'card';

  return (
    <KeyboardAvoidingView style={[styles.root, isCard && styles.rootCard]} behavior={KEYBOARD_BEHAVIOR}>
      <StatusBar style={isCard ? 'dark' : 'light'} />
      <Image source={LocalImages.logo} style={styles.watermark} contentFit="contain" />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isCard && [styles.scrollCard, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }],
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, isCard && styles.cardTablet]}>
          <View style={[styles.cover, { height: coverHeight }]}>
            <Image source={LocalImages.loginCover} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={[styles.coverOverlay, !isCard && { paddingTop: insets.top }]}>{brandTitle(false)}</View>
          </View>

          {/* Logo overlaps the cover edge (in normal flow, so it follows any cover height) */}
          <View style={styles.logoOverlap}>{logo}</View>

          <View style={[styles.formPad, !isCard && { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.formMaxWidth}>{form}</View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },

  /* Stack / card */
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  rootCard: { backgroundColor: '#F1F5F9' },
  watermark: {
    position: 'absolute',
    bottom: -100,
    left: -100,
    width: 400,
    height: 400,
    opacity: 0.035,
    transform: [{ rotate: '-15deg' }],
  },
  scroll: { flexGrow: 1 },
  scrollCard: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  card: { flex: 1, backgroundColor: '#FFFFFF', width: '100%' },
  cardTablet: {
    flex: 0,
    maxWidth: 520,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  cover: { width: '100%', overflow: 'hidden' },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23, 23, 23, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  coverTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center' },
  coverTitleCompact: { fontSize: 26 },
  coverTitleBig: { fontSize: 44, letterSpacing: -1.2 },
  coverSubtitle: {
    color: '#FFECE8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  coverSubtitleBig: { fontSize: 15, marginTop: 10 },
  logoOverlap: { alignItems: 'center', marginTop: -40, zIndex: 2 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoImage: { width: 56, height: 56 },
  formPad: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, flexGrow: 1, alignItems: 'center' },
  formMaxWidth: { width: '100%', maxWidth: 440, alignSelf: 'center' },

  /* Split */
  splitRoot: { flex: 1, flexDirection: 'row', backgroundColor: '#FFFFFF' },
  splitCover: { flex: 1, overflow: 'hidden' },
  splitCoverOverlay: { gap: 18 },
  splitBrandText: { alignItems: 'center' },
  splitFormPane: { flex: 1 },
  splitScroll: { flexGrow: 1, justifyContent: 'center', paddingLeft: 24 },

  /* Form */
  form: { width: '100%' },
  formTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, textAlign: 'center', letterSpacing: -0.5 },
  formSubtitle: { fontSize: 14.5, color: Colors.textMuted, textAlign: 'center', marginTop: 4, fontWeight: '500', marginBottom: 24 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  errorCardNetwork: { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' },
  errorCardGeneral: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  errorIconWrap: { marginTop: 1 },
  errorCardTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  errorCardDesc: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  formFields: { gap: 14 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    gap: 12,
  },
  inputWrapFocused: { borderColor: '#0F172A', backgroundColor: '#FFFFFF' },
  input: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '600', paddingVertical: 0 },
  loginBtn: {
    backgroundColor: '#0F172A',
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  loginBtnBusy: { opacity: 0.7 },
  loginBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: 0.2 },
  registerBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  registerBtnText: { color: '#4B5563', fontWeight: '600', fontSize: 14.5 },
  registerBtnStrong: { color: Colors.primary, fontWeight: '800' },
  disclaimerText: {
    fontSize: 12,
    color: Colors.textSubtle,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
    paddingHorizontal: 8,
  },
  disclaimerLink: { color: Colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  versionText: { fontSize: 12, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.3, textAlign: 'center', marginTop: 4 },
});
