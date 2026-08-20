import React, { useState } from 'react';
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
import { Lock, Mail, Eye, EyeOff } from 'lucide-react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { login } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await login(email.trim().toLowerCase(), password.trim());
      if (res.success) {
        showToast({ title: 'Welcome', message: 'Logged in successfully.', type: 'success' });
        router.replace('/(tabs)');
      } else {
        setErrorMsg(res.message || 'Login failed. Invalid credentials.');
      }
    } catch (e) {
      setErrorMsg('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

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

            {/* Error Message */}
            {errorMsg ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
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
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 20,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
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
});
