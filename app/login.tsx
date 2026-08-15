import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';
import { Server, Lock, Mail, Eye, EyeOff } from 'lucide-react-native';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Custom API Base URL Config States
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState('');

  const { login } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    async function loadUrl() {
      const url = await getApiBaseUrl();
      setApiUrlInput(url);
    }
    loadUrl();
  }, []);

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

  const handleSaveApiUrl = async () => {
    if (!apiUrlInput.trim()) return;
    await setApiBaseUrl(apiUrlInput.trim());
    setShowConfigModal(false);
    showToast({ title: 'Saved', message: `Backend URL updated to:\n${apiUrlInput.trim()}`, type: 'success' });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.headerBox}>
          <View style={styles.logoCircle}>
            <Image
              source={require('../assets/logo.png')}
              style={{ width: 68, height: 68 }}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.title}>Krifoo Admin</Text>
          <Text style={styles.subtitle}>Super Admin Management Portal</Text>
        </View>

        {/* Error */}
        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Form */}
        <View style={styles.form}>
          {/* Email */}
          <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
            <Mail size={16} color={emailFocused ? Colors.primary : Colors.textSubtle} />
            <TextInput
              style={styles.input}
              placeholder="Super Admin Email"
              placeholderTextColor={Colors.textSubtle}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />
          </View>

          {/* Password */}
          <View style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}>
            <Lock size={16} color={passwordFocused ? Colors.primary : Colors.textSubtle} />
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

          {/* Sign In */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loginBtnText}>Sign In to Admin Portal</Text>}
          </TouchableOpacity>
        </View>

        {/* Configure Backend URL */}
        {/* <TouchableOpacity style={styles.configBtn} onPress={() => setShowConfigModal(true)}>
          <Server size={13} color={Colors.textSubtle} />
          <Text style={styles.configBtnText}>Configure Backend URL</Text>
        </TouchableOpacity> */}
      </View>

      {/* API URL Config Modal */}
      <Modal visible={showConfigModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Backend Configuration</Text>
            <Text style={styles.modalSub}>
              Set your backend server URL. Use your PC's local IP when testing on a device.
            </Text>
            <TextInput
              style={styles.configInput}
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder="https://api.krifoo.co.uk"
              placeholderTextColor={Colors.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowConfigModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveApiUrl}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  headerBox: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: Colors.danger,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  form: {
    gap: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  inputWrapFocused: {
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  configBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  configBtnText: {
    color: Colors.textSubtle,
    fontSize: 13,
    fontWeight: '500',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 18,
  },
  configInput: {
    backgroundColor: Colors.cardSurface,
    color: Colors.text,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
