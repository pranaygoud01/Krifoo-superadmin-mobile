import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Mail, Phone, Lock, User, Store } from 'lucide-react-native';

export default function RegisterScreen() {
  const router = useRouter();
  const { registerOwner } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    ownerFullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phoneNumber: '',

    restaurantName: '',
    restaurantType: 'food_delivery_and_dining',
    handlingChargesPercentage: '5.00',

    shopNo: '',
    floor: '',
    area: '', // Postcode
    city: '',
    landmark: '',
    freeDeliveryRadius: '2',
    chargePerMile: '1',
    maxDeliveryRadius: '10',

    businessLicenseNumber: '',
    foodHygieneCertificateNumber: '',
    vatNumber: 'N/A',
    beneficiaryName: '',
    sortCode: '',
    accountNumber: '',
    bankAddress: '',

    termsAccepted: false,
    privacyAccepted: false,
  });

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Step Validations
  const validateStep = () => {
    if (step === 1) {
      if (!formData.ownerFullName.trim()) return 'Owner name is required.';
      if (!formData.email.trim() || !formData.email.includes('@')) return 'Please enter a valid email.';
      if (formData.password.length < 8) return 'Password must be at least 8 characters.';
      if (formData.password !== formData.confirmPassword) return 'Passwords do not match.';
      if (!formData.phoneNumber.trim()) return 'Phone number is required.';
    } else if (step === 2) {
      if (!formData.restaurantName.trim()) return 'Restaurant name is required.';
      if (!formData.handlingChargesPercentage.trim()) return 'Handling charges percentage is required.';
    } else if (step === 3) {
      if (!formData.area.trim()) return 'Postcode/Area is required.';
      // Simple UK Postcode regex check
      const ukPostcodeRegex = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;
      if (!ukPostcodeRegex.test(formData.area.replace(/\s+/g, ''))) {
        return 'Please enter a valid UK postcode.';
      }
      if (!formData.city.trim()) return 'City is required.';
      if (Number(formData.freeDeliveryRadius) > Number(formData.maxDeliveryRadius)) {
        return 'Free delivery radius cannot be greater than max radius.';
      }
    } else if (step === 4) {
      if (!formData.businessLicenseNumber.trim()) return 'Business License Number is required.';
      if (!formData.foodHygieneCertificateNumber.trim()) return 'Food Hygiene Certificate Number is required.';
      if (!formData.beneficiaryName.trim()) return 'Beneficiary name is required.';
      if (!formData.sortCode.trim()) return 'Sort code is required.';
      if (!formData.accountNumber.trim()) return 'Account number is required.';
      if (!formData.bankAddress.trim()) return 'Bank address is required.';
      if (!formData.termsAccepted || !formData.privacyAccepted) {
        return 'You must accept the Terms of Service and Privacy Policy to continue.';
      }
    }
    return null;
  };

  const handleNext = () => {
    const error = validateStep();
    if (error) {
      Alert.alert('Validation Error', error);
      return;
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    const error = validateStep();
    if (error) {
      Alert.alert('Validation Error', error);
      return;
    }

    setLoading(true);
    try {
      const uploadData = new FormData();

      // Flat fields
      uploadData.append('restaurantName', formData.restaurantName);
      uploadData.append('ownerFullName', formData.ownerFullName);
      uploadData.append('email', formData.email.trim().toLowerCase());
      uploadData.append('password', formData.password);
      uploadData.append('restaurantType', formData.restaurantType);
      uploadData.append('phoneNumber', formData.phoneNumber);
      uploadData.append('handlingChargesPercentage', formData.handlingChargesPercentage);

      // Embedded JSONs
      const addressJson = JSON.stringify({
        shopNo: formData.shopNo,
        floor: formData.floor,
        area: formData.area.toUpperCase(),
        city: formData.city,
        landmark: formData.landmark,
        coordinates: {
          type: 'Point',
          coordinates: [-0.1276, 51.5074], // Default to Central London coordinates
        },
      });
      uploadData.append('address', addressJson);

      const deliverySettingsJson = JSON.stringify({
        freeDeliveryRadius: formData.freeDeliveryRadius,
        chargePerMile: formData.chargePerMile,
        maxDeliveryRadius: formData.maxDeliveryRadius,
      });
      uploadData.append('deliverySettings', deliverySettingsJson);

      const gdprConsentJson = JSON.stringify({
        termsAccepted: formData.termsAccepted,
        privacyAccepted: formData.privacyAccepted,
        marketingConsent: false,
      });
      uploadData.append('gdprConsent', gdprConsentJson);

      // Legal & Banking Fields
      uploadData.append('businessLicenseNumber', formData.businessLicenseNumber);
      uploadData.append('foodHygieneCertificateNumber', formData.foodHygieneCertificateNumber);
      uploadData.append('vatNumber', formData.vatNumber);
      uploadData.append('beneficiaryName', formData.beneficiaryName);
      uploadData.append('sortCode', formData.sortCode);
      uploadData.append('accountNumber', formData.accountNumber);
      uploadData.append('bankAddress', formData.bankAddress);

      const res = await registerOwner(uploadData);
      if (res.success) {
        Alert.alert(
          'Success',
          'Your business registration has been submitted successfully! Please await Super Admin verification and approval before logging in.',
          [{ text: 'OK', onPress: () => router.replace('/login') }]
        );
      } else {
        Alert.alert('Registration Failed', res.message || 'Check your fields and try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Owner Credentials</Text>
            <Text style={styles.stepDesc}>Enter your login and contact details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Owner Full Name</Text>
              <View style={styles.inputWrapper}>
                <User size={16} color={Colors.textSubtle} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="John Doe"
                  value={formData.ownerFullName}
                  onChangeText={(val) => handleChange('ownerFullName', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Mail size={16} color={Colors.textSubtle} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="owner@krifoo.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={formData.email}
                  onChangeText={(val) => handleChange('email', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputWrapper}>
                <Phone size={16} color={Colors.textSubtle} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="+44 7123 456789"
                  keyboardType="phone-pad"
                  value={formData.phoneNumber}
                  onChangeText={(val) => handleChange('phoneNumber', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Lock size={16} color={Colors.textSubtle} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Min 8 characters"
                  secureTextEntry
                  value={formData.password}
                  onChangeText={(val) => handleChange('password', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Lock size={16} color={Colors.textSubtle} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Verify password"
                  secureTextEntry
                  value={formData.confirmPassword}
                  onChangeText={(val) => handleChange('confirmPassword', val)}
                />
              </View>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Store Profile</Text>
            <Text style={styles.stepDesc}>Details about your business store</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business / Restaurant Name</Text>
              <View style={styles.inputWrapper}>
                <Store size={16} color={Colors.textSubtle} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Krifoo Grill"
                  value={formData.restaurantName}
                  onChangeText={(val) => handleChange('restaurantName', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Type</Text>
              <View style={styles.selectorRow}>
                {[
                  { label: 'Food & Dining', value: 'food_delivery_and_dining' },
                  { label: 'Groceries Store', value: 'groceries' },
                  { label: 'Food Delivery Only', value: 'food_delivery' },
                  { label: 'Meat & Poultry', value: 'meat_poultry' },
                ].map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.selectorItem,
                      formData.restaurantType === type.value && styles.selectorItemActive,
                    ]}
                    onPress={() => handleChange('restaurantType', type.value)}
                  >
                    <Text
                      style={[
                        styles.selectorLabel,
                        formData.restaurantType === type.value && styles.selectorLabelActive,
                      ]}
                    >
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Handling Charge Percentage (%)</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 5.00"
                  keyboardType="numeric"
                  value={formData.handlingChargesPercentage}
                  onChangeText={(val) => handleChange('handlingChargesPercentage', val)}
                />
              </View>
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Address & Deliveries</Text>
            <Text style={styles.stepDesc}>Setup store location and delivery terms</Text>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Shop No</Text>
                <TextInput
                  style={styles.inputBordered}
                  placeholder="Unit 1"
                  value={formData.shopNo}
                  onChangeText={(val) => handleChange('shopNo', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Floor</Text>
                <TextInput
                  style={styles.inputBordered}
                  placeholder="G Floor"
                  value={formData.floor}
                  onChangeText={(val) => handleChange('floor', val)}
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>UK Postcode (Area)</Text>
                <TextInput
                  style={styles.inputBordered}
                  placeholder="EC1A 1BB"
                  autoCapitalize="characters"
                  value={formData.area}
                  onChangeText={(val) => handleChange('area', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.inputBordered}
                  placeholder="London"
                  value={formData.city}
                  onChangeText={(val) => handleChange('city', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Landmark / Street Address</Text>
              <TextInput
                style={styles.inputBordered}
                placeholder="Opposite Central Park"
                value={formData.landmark}
                onChangeText={(val) => handleChange('landmark', val)}
              />
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 6 }]}>
                <Text style={styles.label}>Free Radius (Miles)</Text>
                <TextInput
                  style={styles.inputBordered}
                  keyboardType="numeric"
                  value={formData.freeDeliveryRadius}
                  onChangeText={(val) => handleChange('freeDeliveryRadius', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 6 }]}>
                <Text style={styles.label}>£ / Mile Charge</Text>
                <TextInput
                  style={styles.inputBordered}
                  keyboardType="numeric"
                  value={formData.chargePerMile}
                  onChangeText={(val) => handleChange('chargePerMile', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Max Radius (Miles)</Text>
                <TextInput
                  style={styles.inputBordered}
                  keyboardType="numeric"
                  value={formData.maxDeliveryRadius}
                  onChangeText={(val) => handleChange('maxDeliveryRadius', val)}
                />
              </View>
            </View>
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Compliance & Bank</Text>
            <Text style={styles.stepDesc}>Enter operational and payout details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business License Number</Text>
              <TextInput
                style={styles.inputBordered}
                placeholder="LIC-123456"
                value={formData.businessLicenseNumber}
                onChangeText={(val) => handleChange('businessLicenseNumber', val)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Food Hygiene Certificate Number</Text>
              <TextInput
                style={styles.inputBordered}
                placeholder="HYG-789012"
                value={formData.foodHygieneCertificateNumber}
                onChangeText={(val) => handleChange('foodHygieneCertificateNumber', val)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>UK VAT Number</Text>
              <TextInput
                style={styles.inputBordered}
                placeholder="GB123456789 or N/A"
                autoCapitalize="characters"
                value={formData.vatNumber}
                onChangeText={(val) => handleChange('vatNumber', val)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank Beneficiary Name</Text>
              <TextInput
                style={styles.inputBordered}
                placeholder="John Doe Enterprises"
                value={formData.beneficiaryName}
                onChangeText={(val) => handleChange('beneficiaryName', val)}
              />
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Sort Code</Text>
                <TextInput
                  style={styles.inputBordered}
                  placeholder="20-00-00"
                  keyboardType="numeric"
                  value={formData.sortCode}
                  onChangeText={(val) => handleChange('sortCode', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Account Number</Text>
                <TextInput
                  style={styles.inputBordered}
                  placeholder="12345678"
                  keyboardType="numeric"
                  value={formData.accountNumber}
                  onChangeText={(val) => handleChange('accountNumber', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bank Address</Text>
              <TextInput
                style={styles.inputBordered}
                placeholder="1 High Street, London"
                value={formData.bankAddress}
                onChangeText={(val) => handleChange('bankAddress', val)}
              />
            </View>

            {/* GDPR Checkboxes */}
            <View style={styles.gdprContainer}>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => handleChange('termsAccepted', !formData.termsAccepted)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, formData.termsAccepted && styles.checkboxChecked]}>
                  {formData.termsAccepted && <Check size={12} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkboxText}>I accept the Terms of Service.</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => handleChange('privacyAccepted', !formData.privacyAccepted)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, formData.privacyAccepted && styles.checkboxChecked]}>
                  {formData.privacyAccepted && <Check size={12} color="#FFFFFF" />}
                </View>
                <Text style={styles.checkboxText}>I accept the Privacy Policy.</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Register Partner</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress Line */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${(step / 4) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>Step {step} of 4</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {renderStep()}

        <View style={styles.actionRow}>
          {step > 1 && (
            <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}

          {step < 4 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>Next Step</Text>
              <ArrowRight size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              disabled={loading}
              onPress={handleSubmit}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Submit Registration</Text>
                  <ShieldCheck size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    height: Platform.OS === 'ios' ? 95 : 70,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  progressContainer: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: Colors.backgroundSecondary,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.cardBorder,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 6,
    textAlign: 'right',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  stepContainer: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  stepDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: -8,
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  inputBordered: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: Colors.text,
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectorItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  selectorLabelActive: {
    color: Colors.primary,
  },
  gdprContainer: {
    marginTop: 12,
    gap: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    backgroundColor: Colors.cardSurface,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    gap: 12,
  },
  backBtn: {
    flex: 1,
    height: 48,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  nextBtn: {
    flex: 2,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  submitBtn: {
    flex: 2,
    height: 48,
    backgroundColor: Colors.success,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
