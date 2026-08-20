import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';

export default function TermsConditionsScreen() {
  return (
    <View style={styles.container}>
      <Header title="Terms & Conditions" showBackButton={true} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last Updated: August 20, 2026</Text>

        <Text style={styles.paragraph}>
          Welcome to Krifoo Admin. By accessing or using our mobile application, you agree to comply with and be bound by these Terms and Conditions. Please read them carefully.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Store Operator Account</Text>
          <Text style={styles.paragraph}>
            To access the administrative console, you must register a store account. You agree to:
          </Text>
          <Text style={styles.bulletItem}>• Provide accurate, current, and complete information during registration.</Text>
          <Text style={styles.bulletItem}>• Maintain the confidentiality of your login credentials.</Text>
          <Text style={styles.bulletItem}>• Promptly update your store settings, operating hours, and location profiles.</Text>
          <Text style={styles.bulletItem}>• Accept responsibility for all order acceptances, cancellations, and pricing updates performed through your account.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Service Fulfillment and Delivery</Text>
          <Text style={styles.paragraph}>
            Store operators are responsible for cooking, packing, and readying menu items in accordance with health and hygiene guidelines. Delivery charges and radiuses set using the Admin panel must be accurate. Delays or mismatches are the sole responsibility of the operator.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Fees and Stripe Payouts</Text>
          <Text style={styles.paragraph}>
            Krifoo acts as a facilitator and platform. Fees, handling charges, and commissions are calculated based on the configurations established in your profile. Payout transfers are conducted in accordance with Stripe Connect partner guidelines. Ensure your Stripe credentials and tax identification details remain verified.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Prohibited Conduct</Text>
          <Text style={styles.paragraph}>
            You agree not to upload fraudulent items, engage in price manipulation, spam notifications, bypass security configurations, or reverse engineer any part of the mobile application.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            Krifoo is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, Krifoo shall not be liable for any direct, indirect, incidental, or consequential damages resulting from system downtime, payout delays, or order processing errors.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Modifications to Terms</Text>
          <Text style={styles.paragraph}>
            We reserve the right to modify these Terms and Conditions at any time. Updates will be posted inside the application settings, and your continued use of Krifoo Admin constitutes acceptance of the modified Terms.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  lastUpdated: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 16,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 22,
    fontWeight: '400',
  },
  bulletItem: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 22,
    marginLeft: 12,
    marginTop: 4,
    fontWeight: '400',
  },
});
