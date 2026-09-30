import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { Lock, Mail, Eye, EyeOff, WifiOff, ServerOff, AlertCircle } from 'lucide-react-native';
import Constants from 'expo-constants';

interface LoginErrorDetails {
  type: 'network' | 'server' | 'auth' | 'generic';
  message: string;
  statusCode?: number;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorDetails, setErrorDetails] = useState<LoginErrorDetails | null>(null);

  const { login } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const appVersion =
    Constants.expoConfig?.version ??
    (Constants as any).manifest2?.extra?.expoClient?.version ??
    '1.0.7';

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorDetails({
        type: 'auth',
        message: 'Please enter both email and password.',
      });
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
      setErrorDetails({
        type: 'generic',
        message: e?.message || 'An unexpected error occurred during login.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />

      {/* Background Watermark Logo */}
      <Image
        source={require('../assets/logo.png')}
        style={styles.watermark}
        resizeMode="contain"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {/* Cover Header Image */}
          <View style={styles.coverContainer}>
            <Image
              source={require('../assets/login-cover.jpg')}
              style={styles.coverImage}
            />
            {/* Dark tint overlay */}
            <View style={styles.coverOverlay}>
              <Text style={styles.coverTitle}>Krifoo Admin</Text>
              <Text style={styles.coverSubtitle}>Management Application</Text>
            </View>
          </View>

          {/* Overlapping Brand Logo Avatar */}
          <View style={styles.logoBadgeContainer}>
            <View style={styles.logoCircle}>
              <Image
                source={require('../assets/logo.png')}
                style={{ width: 56, height: 56 }}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Form Section */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Welcome Back</Text>
            <Text style={styles.formSubtitle}>Sign in to manage your operations</Text>

            {/* Error Message Section */}
            {errorDetails ? (
              <View
                style={[
                  styles.errorCard,
                  errorDetails.type === 'network'
                    ? styles.errorCardNetwork
                    : styles.errorCardGeneral,
                ]}
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

                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.errorCardTitle,
                      { color: errorDetails.type === 'network' ? '#92400E' : '#991B1B' },
                    ]}
                  >
                    {errorDetails.type === 'network'
                      ? 'Server Unreachable'
                      : errorDetails.type === 'server'
                      ? `Server Error (${errorDetails.statusCode || 500})`
                      : 'Authentication Failed'}
                  </Text>
                  <Text
                    style={[
                      styles.errorCardDesc,
                      { color: errorDetails.type === 'network' ? '#B45309' : '#B91C1C' },
                    ]}
                  >
                    {errorDetails.message}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.formFields}>
              {/* Email Input */}
              <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
                <Mail size={16} color={emailFocused ? '#0F172A' : Colors.textSubtle} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor={Colors.textSubtle}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>

              {/* Password Input */}
              <View style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}>
                <Lock size={16} color={passwordFocused ? '#0F172A' : Colors.textSubtle} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={Colors.textSubtle}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  {showPassword
                    ? <EyeOff size={16} color={Colors.textSubtle} />
                    : <Eye size={16} color={Colors.textSubtle} />}
                </TouchableOpacity>
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={[styles.loginBtn, loading && { opacity: 0.7 }]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginBtnText}>Sign In</Text>
                )}
              </TouchableOpacity>

              {/* Registration Link */}
              <TouchableOpacity
                style={styles.registerBtn}
                onPress={() => router.push('/register')}
                activeOpacity={0.7}
              >
                <Text style={styles.registerBtnText}>New Business? Register Store</Text>
              </TouchableOpacity>

              {/* Disclaimer */}
              <View style={styles.disclaimerContainer}>
                <Text style={styles.disclaimerText}>
                  By logging in, you agree to our{' '}
                  <Text
                    style={styles.disclaimerLink}
                    onPress={() => router.push('/terms-conditions')}
                  >
                    Terms & Conditions
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={styles.disclaimerLink}
                    onPress={() => router.push('/privacy-policy')}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>

              {/* Dynamic App Version */}
              <View style={styles.versionContainer}>
                <Text style={styles.versionText}>Version {appVersion}</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  watermark: {
    position: 'absolute',
    bottom: -100,
    left: -100,
    width: 400,
    height: 400,
    opacity: 0.035,
    transform: [{ rotate: '-15deg' }],
    zIndex: -1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    width: '100%',
  },
  coverContainer: {
    height: 330,
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23, 23, 23, 0.39)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 40 : 20,
  },
  coverTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  coverSubtitle: {
    color: '#FFECE8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  logoBadgeContainer: {
    position: 'absolute',
    top: 290,
    alignSelf: 'center',
    zIndex: 10,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  formContainer: {
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 40,
    flex: 1,
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  formSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '500',
    marginBottom: 32,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 20,
    gap: 12,
  },
  errorCardNetwork: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FCD34D',
  },
  errorCardGeneral: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  errorIconWrap: {
    marginTop: 1,
  },
  errorCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  errorCardDesc: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  errorConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  errorConfigBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  serverStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
    alignSelf: 'center',
  },
  serverStatusText: {
    fontSize: 11,
    color: '#64748B',
    maxWidth: 220,
  },
  serverChangeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    marginLeft: 2,
  },
  formFields: {
    gap: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#EEEEEE',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 54,
    gap: 12,
  },
  inputWrapFocused: {
    borderColor: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 0,
  },
  loginBtn: {
    backgroundColor: '#0F172A',
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  registerBtn: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerBtnText: {
    color: '#4B5563',
    fontWeight: '700',
    fontSize: 14,
  },
  disclaimerContainer: {
    marginTop: 20,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.textSubtle,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
  },
  disclaimerLink: {
    color: Colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  versionContainer: {
    marginTop: 18,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
