import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Linking,
  useWindowDimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/colors';
import {
  ArrowLeft,
  ShieldCheck,
  FileText,
  Globe,
  ExternalLink,
  Info,
  AlertTriangle,
  Lock,
  Printer,
  Smartphone,
  Bell,
  UtensilsCrossed,
  Building2,
  Mail,
  CheckCircle2,
} from 'lucide-react-native';

export type LegalType = 'privacy' | 'terms';

interface LegalSection {
  title: string;
  body: string;
  bullets?: string[];
  callout?: {
    title: string;
    text: string;
    type?: 'warning' | 'info' | 'success';
  };
}

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: '1. Scope and Applications',
    body: 'This Privacy Policy sets forth the principles under which Krifoo Technologies ("we", "us", or "our") governs the collection, recording, storage, and processing of personal and commercial partner data for the Krifoo Admin application (com.krifoo.admin) and related merchant web services at https://krifoo.co.uk.\n\nThis policy applies to licensed restaurant operators, store managers, shift supervisors, and kitchen personnel utilizing our merchant platform to accept orders, manage catalogs, configure thermal POS printers, and coordinate customer dining seating.',
    callout: {
      title: 'Notice on Data Monetization',
      text: 'Krifoo does not sell, lease, commercialize, or rent merchant commercial data, sales figures, or customer contact information to third-party data brokers, advertising networks, or marketing intermediaries.',
      type: 'success',
    },
  },
  {
    title: '2. Categories of Data Collected',
    body: 'We process commercial operational data and essential technical telemetry to ensure reliable order routing and terminal operation:',
    bullets: [
      'Commercial Identifiers: Registered restaurant name, trading address, store phone number, manager email, and business tax registration details.',
      'Operational Catalog Data: Menu items, pricing matrices, inventory availability, shift schedules, delivery radiuses, and table seating configurations.',
      'Thermal Printer Configurations: Bluetooth MAC addresses (SPP/BLE), local network IP addresses (ports 9100 / 8008), and printer model specifications (Epson TM-m30III, Star Micronics, ESC/POS hardware) stored locally to automate kitchen ticket printing.',
      'Technical Metrics & Diagnostics: Device hardware model, operating system build, network operator, connection status, API response latencies, and crash stack traces.',
    ],
  },
  {
    title: '3. Hardware & System Permissions',
    body: 'In compliance with Apple App Store Review Guideline 5.1.1 and Google Play Developer Policies, permissions are requested strictly on an as-needed functional basis for Krifoo Admin:',
    bullets: [
      'Bluetooth & Local Network (BLUETOOTH_CONNECT, NSLocalNetworkUsage): Enables discovery, pairing, and bidirectional ESC/POS data transmission to wireless Bluetooth and local Wi-Fi/LAN thermal receipt printers for automated kitchen ticket dispatch.',
      'System Wake Lock (WAKE_LOCK): Prevents commercial merchant terminals and kitchen tablets from entering sleep mode during active operating hours, ensuring orders are never missed.',
      'Push Notifications & Buzzers (POST_NOTIFICATIONS): Transmits real-time high-priority alerts, continuous audio buzzers, and vibration pulses for new delivery orders, table reservations, and order cancellations.',
      'Photo Library & Storage (READ_MEDIA_IMAGES): Permits restaurant operators to select and upload store logo graphics, header banners, and menu dish photographs.',
    ],
  },
  {
    title: '4. Processing Purposes & Lawful Grounds',
    body: 'We process merchant data in strict accordance with UK GDPR Article 6 principles:',
    bullets: [
      'Contractual Performance (Art. 6(1)(b)): Relaying incoming customer orders to kitchens, calculating preparation times, and triggering automated receipt printing.',
      'Terminal Security & Protection: Authenticating store accounts via secure OTP and tokenized sessions to prevent unauthorized console access.',
      'Statutory & Tax Accounting (Art. 6(1)(c)): Reconciling settled transactions, commission structures, and statutory tax filings in compliance with HMRC standards.',
      'Platform Integrity: Detecting fraudulent payment patterns, monitoring POS socket connectivity, and optimizing kitchen dispatch latency.',
    ],
  },
  {
    title: '5. Third-Party Sub-Processors',
    body: 'Data is transmitted only to certified technical sub-processors operating under signed Data Processing Agreements:',
    bullets: [
      'Payment Processors (Stripe Connect): Level 1 PCI-DSS certified gateway managing merchant bank payouts and tokenized customer payments.',
      'Push Notification Gateways: Firebase Cloud Messaging (FCM) and Expo Push Service deliver instant order alerts to tablet hardware.',
      'Geographic Information Services: Google Maps API calculates delivery distance matrices and address lookups.',
      'Cloud Infrastructure: Encrypted cloud hosting and high-availability database infrastructure adhering to ISO 27001 standards.',
    ],
  },
  {
    title: '6. Data Retention Schedules',
    body: 'We adhere to strict data minimization principles under UK GDPR and statutory accounting standards:',
    bullets: [
      'Active Merchant Profiles: Maintained for the active duration of the restaurant\'s merchant service agreement.',
      'Fiscal & Accounting Records: Preserved for up to six (6) years in accordance with applicable UK statutory taxation, audit, and HMRC regulations.',
      'Diagnostic & Connection Logs: Purged on a rolling schedule between 90 and 180 days.',
      'Account Erasure (Right to be Forgotten): Store operators may request complete account closure and profile erasure by emailing admin@krifoo.co.uk. Verified requests are executed within thirty (30) days.',
    ],
  },
  {
    title: '7. Security Controls & Infrastructure',
    body: 'We employ rigorous technical and organizational safeguards to ensure data integrity:\n\n• End-to-end TLS 1.2 / TLS 1.3 cryptographic protocols for all data in transit between merchant tablets and API servers.\n• AES-256 encrypted volumes for database storage at rest.\n• Strict role-based access control (RBAC) ensuring only authorized technical staff access production environments under least-privilege access protocols.\n• Regular vulnerability assessments and automated dependency audits.',
  },
  {
    title: '8. Statutory Rights (UK GDPR / DPA 2018)',
    body: 'Under UK data protection legislation, restaurant partners and operators possess statutory rights regarding their personal data:\n\n• Right of Access: Obtain confirmation and copies of records held.\n• Right to Rectification: Correct inaccurate or outdated trading records.\n• Right to Erasure: Request permanent deletion where no statutory fiscal retention basis applies.\n• Right to Restrict Processing: Limit processing during verification procedures.\n\nTo exercise any right, contact admin@krifoo.co.uk.',
  },
  {
    title: '9. Supervisory Authority & Complaints',
    body: 'You maintain the right to lodge an inquiry or complaint with the UK data supervisory authority:\n\nInformation Commissioner\'s Office (ICO)\nWycliffe House, Water Lane, Wilmslow, Cheshire, SK9 5AF\nWebsite: https://ico.org.uk | Helpline: 0303 123 1113\n\nWe appreciate the opportunity to resolve any questions or concerns directly prior to contacting the regulator.',
  },
  {
    title: '10. Compliance & Legal Notice Desk',
    body: 'Krifoo Technologies\nData Protection & Legal Desk\nEmail: admin@krifoo.co.uk \nOfficial Web Portal: https://krifoo.co.uk\nUnited Kingdom',
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: '1. Acceptance of Terms',
    body: 'These Terms and Conditions constitute a legally enforceable commercial agreement between you (the "Merchant" or "Operator") and Krifoo Technologies ("Krifoo", "we", "us"). By accessing or operating the Krifoo Admin Application (Package ID: com.krifoo.admin), POS station integrations, or associated cloud ordering services at https://krifoo.co.uk, you accept and agree to be bound by these terms in full.',
    callout: {
      title: 'Mandatory Compliance Notice',
      text: 'If you do not accept these terms in full, you must cease use of the terminal immediately and uninstall the software.',
      type: 'warning',
    },
  },
  {
    title: '2. Operator Eligibility & Account Security',
    body: 'Store operators must be at least 18 years of age (or the age of legal majority in the business operating jurisdiction) and possess full legal authority to represent the registered dining establishment:\n\n• Credential Integrity: Safeguard login credentials, API keys, and OTP authentication tokens. All orders accepted, rejected, or modified via the terminal are legally attributed to the merchant account holder.\n• Accurate Commercial Profiles: Merchants warrant that store name, operating premises address, telephone numbers, and business registration numbers are accurate and updated.',
  },
  {
    title: '3. Marketplace Operations & Kitchen Fulfillment',
    body: 'Krifoo acts as an intermediary technology platform connecting diners with independent food establishments:\n\n• Direct Contract of Sale: Contracts for the preparation and sale of meals are executed directly between the consumer and the fulfilling restaurant.\n• Preparation Timelines: Operators agree to fulfill accepted orders in accordance with estimated preparation times and notify customers promptly of unexpected kitchen delays.\n• Delivery Radiuses & Fees: Delivery zones, fees, and minimum spend tiers configured in Krifoo Admin must reflect actual operational coverage.',
  },
  {
    title: '4. Table Reservations & Seating Management',
    body: 'Dine-in reservations confirmed through Krifoo Admin are binding commercial commitments:\n\n• 15-Minute Grace Period: In the event a dining party does not arrive within fifteen (15) minutes of the reserved booking time, the merchant reserves the right to reallocate the table.\n• Capacity Accuracy: Merchants agree to keep table availability schedules updated in Krifoo Admin to avoid double-booking or overcapacity issues.',
  },
  {
    title: '5. Pricing, Payouts & Stripe Connect',
    body: 'Product retail prices are established exclusively by the merchant. Financial settlements and commission distributions are executed via Stripe Connect:\n\n• PCI-DSS Compliance: All card transactions and bank payout rails comply with Level 1 PCI-DSS standards. Krifoo does not store unencrypted payment card credentials.\n• Settlement Schedules: Net sales proceeds (minus applicable platform commission fees and payment processing fees) are transferred to merchant bank accounts according to Stripe Connect rolling payout schedules.',
  },
  {
    title: '6. Cancellations, Refunds & Quality Claims',
    body: 'Due to the perishable nature of prepared foodstuffs, cancellation rules are strictly defined:\n\n• Consumer Cancellation Window: Consumers hold a sixty (60) second grace period following submission. Once kitchen preparation has commenced or been accepted in Krifoo Admin, cancellation for change-of-mind is void.\n• Damaged or Missing Items: Verified customer claims submitted with photographic evidence within two (2) hours of delivery will be resolved by the merchant via item replacement, merchant credit, or monetary reimbursement processed within 3 to 7 banking days.',
  },
  {
    title: '7. Merchant Obligations, Hygiene & POS Hardware',
    body: 'Licensed restaurant operators agree to maintain strict professional and operational standards:\n\n• Food Safety & Hygiene: Full compliance with municipal health authority rules, food hygiene ratings, and sanitary standards during storage, preparation, and packaging.\n• POS Hardware Connectivity: Merchants are responsible for keeping tablet devices powered, connected to Wi-Fi, and paired with thermal receipt printers (Epson TM-m30III, Star Micronics, ESC/POS hardware) to ensure uninterrupted order ticket generation.\n• Customer Data Confidentiality: Customer contact details (phone numbers and addresses) displayed on receipts are confidential and may be used solely for immediate fulfillment. Extracting customer details for unauthorized direct marketing is strictly prohibited.',
    callout: {
      title: 'Critical Food Safety & Allergen Disclaimer',
      text: 'Krifoo does not operate food preparation kitchens. Menu specifications, dietary designations (vegan, halal, kosher, gluten-free), and allergen disclosures (nuts, dairy, gluten, eggs, etc.) are the sole legal responsibility of the preparing merchant.',
      type: 'warning',
    },
  },
  {
    title: '8. Proprietary Intellectual Property',
    body: 'All software code, user interface designs, typography, brand marks, and documentation rights are the exclusive property of Krifoo Technologies. Merchants receive a revocable, non-exclusive license solely for authorized operational use.',
  },
  {
    title: '9. Prohibited Conduct',
    body: 'The following actions constitute material breach and result in immediate account termination:\n\n• Submitting fictitious test orders, price gouging, or manipulating customer review scores.\n• Automated scraping of competitor menu items, platform reverse engineering, or penetration testing.\n• Verbal, physical, or discriminatory abuse directed toward couriers, customers, or Krifoo support personnel.',
  },
  {
    title: '10. Warranty Disclaimers & Limitation of Liability',
    body: 'THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMISSIBLE UNDER APPLICABLE LAW, KRIFOO TECHNOLOGIES SHALL NOT BE HELD LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES. AGGREGATE LIABILITY SHALL NOT EXCEED THE SPECIFIC TRANSACTION VALUE OF THE DISPUTED ORDER OR £50.00 GBP.',
  },
  {
    title: '11. Governing Law & Dispute Resolution',
    body: 'These Terms are governed by and construed in accordance with the laws of England and Wales. The parties submit to the exclusive jurisdiction of the courts of England and Wales for the resolution of any dispute arising hereunder.',
  },
  {
    title: '12. Legal Notice Desk',
    body: 'Krifoo Technologies\nEmail: admin@krifoo.co.uk | legal@krifoo.co.uk\nOfficial Web Portal: https://krifoo.co.uk\nUnited Kingdom',
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [activeTab, setActiveTab] = useState<LegalType>('privacy');

  const sections = activeTab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const title = activeTab === 'terms' ? 'Terms & Conditions' : 'Privacy Policy';
  const subtitle = activeTab === 'terms' ? 'Merchant Service Agreement' : 'Privacy & Data Protection Policy';

  const openWebPortal = () => {
    Linking.openURL('https://krifoo.co.uk').catch((err) => {
      console.log('Error opening web portal:', err);
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header Bar (matches legal-modal.tsx) */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <ArrowLeft size={22} color="#0F172A" />
        </Pressable>

        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.topBarSub}>Krifoo Merchant Documentation</Text>
        </View>

        <TouchableOpacity onPress={openWebPortal} style={styles.webBtn} hitSlop={10} activeOpacity={0.7}>
          <Globe size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* 2-Tab Segment Bar (matches legal-modal.tsx) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === 'privacy' && [styles.tabBtnActive, { borderBottomColor: Colors.primary }],
          ]}
          onPress={() => setActiveTab('privacy')}
          activeOpacity={0.7}
        >
          <ShieldCheck
            size={16}
            color={activeTab === 'privacy' ? Colors.primary : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'privacy' ? Colors.primary : '#64748B' },
              activeTab === 'privacy' && styles.tabTextActive,
            ]}
          >
            Privacy Policy
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabBtn,
            activeTab === 'terms' && [styles.tabBtnActive, { borderBottomColor: Colors.primary }],
          ]}
          onPress={() => setActiveTab('terms')}
          activeOpacity={0.7}
        >
          <FileText
            size={16}
            color={activeTab === 'terms' ? Colors.primary : '#64748B'}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'terms' ? Colors.primary : '#64748B' },
              activeTab === 'terms' && styles.tabTextActive,
            ]}
          >
            Terms of Service
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable Document Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: isTablet ? 24 : 16,
            maxWidth: 840,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
      >
        {/* Document Header Card */}
        <View style={styles.docHeader}>
          <View style={styles.docHeaderBadgeRow}>
            <View style={[styles.legalBadge, { backgroundColor: Colors.primary + '15' }]}>
              <ShieldCheck size={13} color={Colors.primary} />
              <Text style={[styles.legalBadgeText, { color: Colors.primary }]}>
                OFFICIAL LEGAL DOCUMENT
              </Text>
            </View>
            <Text style={styles.docDate}>Updated: October 2026</Text>
          </View>

          <Text style={styles.docTitle}>{subtitle}</Text>
          <Text style={styles.docMeta}>
            Krifoo Technologies · UK GDPR & Data Protection Act 2018
          </Text>
          <Text style={styles.docMeta}>
            Governing Law: England and Wales · Bundle: com.krifoo.admin
          </Text>
        </View>

        {/* Sections List */}
        {sections.map((section, idx) => (
          <View key={idx} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            {section.callout && (
              <View
                style={[
                  styles.calloutBox,
                  section.callout.type === 'success'
                    ? { backgroundColor: '#ECFDF5', borderColor: '#10B981' }
                    : { backgroundColor: '#FFF7ED', borderColor: '#FB923C' },
                ]}
              >
                <View style={styles.calloutHeader}>
                  {section.callout.type === 'success' ? (
                    <ShieldCheck size={16} color="#059669" />
                  ) : (
                    <AlertTriangle size={16} color="#EA580C" />
                  )}
                  <Text
                    style={[
                      styles.calloutTitle,
                      section.callout.type === 'success' ? { color: '#059669' } : { color: '#EA580C' },
                    ]}
                  >
                    {section.callout.title}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.calloutText,
                    section.callout.type === 'success' ? { color: '#047857' } : { color: '#9A3412' },
                  ]}
                >
                  {section.callout.text}
                </Text>
              </View>
            )}

            <Text style={styles.sectionBody}>{section.body}</Text>

            {section.bullets && (
              <View style={styles.bulletsContainer}>
                {section.bullets.map((bullet, bIdx) => (
                  <View key={bIdx} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Official Web Legal Portal Card */}
        <TouchableOpacity
          style={styles.portalLinkCard}
          onPress={openWebPortal}
          activeOpacity={0.7}
        >
          <View style={styles.portalLinkLeft}>
            <Globe size={22} color={Colors.primary} />
            <View>
              <Text style={styles.portalLinkTitle}>Official Web Legal Portal</Text>
              <Text style={styles.portalLinkSub}>
                View full documentary text at https://krifoo.co.uk
              </Text>
            </View>
          </View>
          <ExternalLink size={18} color={Colors.primary} />
        </TouchableOpacity>

        {/* Document Footer */}
        <View style={styles.docFooter}>
          <Text style={styles.footerText}>
            © 2026 Krifoo Technologies. Registered in England & Wales.
          </Text>
          <Text style={[styles.footerText, { marginTop: 4 }]}>
            All rights reserved. Regulated by UK GDPR and the Information Commissioner's Office (ICO).
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  topBarSub: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  webBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
  },
  docHeader: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  docHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  legalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  legalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  docDate: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  docTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  docMeta: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionBody: {
    fontSize: 13.5,
    lineHeight: 22,
    fontWeight: '400',
    color: '#475569',
  },
  bulletsContainer: {
    marginTop: 4,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 4,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.primary,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
  calloutBox: {
    padding: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    marginVertical: 4,
    gap: 4,
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calloutTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  calloutText: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  portalLinkCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  portalLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  portalLinkTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  portalLinkSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  docFooter: {
    marginTop: 16,
    paddingTop: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '400',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
});
