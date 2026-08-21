import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.container}>
      <Header title="Privacy Policy" showBackButton={true} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>Last Updated: August 20, 2026</Text>

        <Text style={styles.paragraph}>
          Welcome to Krifoo Admin. We value your privacy and are committed to protecting your personal data. This Privacy Policy describes how we collect, use, and share your information when you use our Krifoo Admin mobile application.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Information We Collect</Text>
          <Text style={styles.paragraph}>
            We collect information you provide directly to us when setting up or managing your store account, such as:
          </Text>
          <Text style={styles.bulletItem}>• Account credentials (email address, password)</Text>
          <Text style={styles.bulletItem}>• Business details (restaurant name, business address, contact details)</Text>
          <Text style={styles.bulletItem}>• Operational settings (delivery tiers, timings, payouts information)</Text>
          <Text style={styles.bulletItem}>• Device information (IP address, operating system, and unique identifiers)</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
          <Text style={styles.paragraph}>
            We use the information we collect to operate, maintain, and improve the Krifoo management console, including:
          </Text>
          <Text style={styles.bulletItem}>• Verifying store applications and enabling operational dashboards</Text>
          <Text style={styles.bulletItem}>• Processing payouts and managing delivery service tiers</Text>
          <Text style={styles.bulletItem}>• Sending notifications, security updates, and transaction alerts</Text>
          <Text style={styles.bulletItem}>• Diagnosing technical issues and analyzing system health</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Payouts and Financial Data</Text>
          <Text style={styles.paragraph}>
            Financial integrations are handled securely via third-party processors such as Stripe. Krifoo does not store raw credit card or bank login details on our servers. All payout setups comply with PCI-DSS security standards.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Sharing of Information</Text>
          <Text style={styles.paragraph}>
            We do not sell your personal data. We only share information to fulfill transactions, comply with legal requirements, or provide cloud infrastructure support (e.g., database hosting, notification delivery systems).
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Security of Your Data</Text>
          <Text style={styles.paragraph}>
            We implement administrative, technical, and physical security measures to safeguard your credentials and store profiles. However, no transmission over the internet or mobile network is 100% secure.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions about this Privacy Policy or wishes to request deletion of your store operator account, please contact us at admin@krifoo.co.uk.
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
