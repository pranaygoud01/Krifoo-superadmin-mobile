import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import {
  ShieldCheck,
  Lock,
  Printer,
  Smartphone,
  Bell,
  EyeOff,
  Clock,
  Trash2,
  Mail,
  ExternalLink,
  Info,
  Building2,
  FileText,
  CheckCircle2,
} from 'lucide-react-native';

export default function PrivacyPolicyScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const handleOpenEmail = (email: string) => {
    Linking.openURL(`mailto:${email}?subject=Krifoo%20Admin%20Privacy%20Inquiry`).catch(() => {});
  };

  const handleOpenWeb = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <Header title="Privacy Policy" showBackButton={true} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: isTablet ? 24 : 16,
            maxWidth: 840,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ========================================================================= */}
        {/* DOCUMENT SPECIFICATION & METADATA BANNER                                   */}
        {/* ========================================================================= */}
        <View style={styles.metaCard}>
          <View style={styles.metaHeaderRow}>
            <View style={styles.metaIconBox}>
              <ShieldCheck size={22} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaKicker}>OFFICIAL COMPLIANCE SPECIFICATION</Text>
              <Text style={styles.metaTitle}>Privacy & Data Protection Policy</Text>
              <Text style={styles.metaSub}>
                Formal disclosure regarding personal and commercial data governance for the Krifoo Admin
                merchant platform.
              </Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaGridLabel}>Issuing Entity</Text>
              <Text style={styles.metaGridValue}>Krifoo Technologies</Text>
            </View>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaGridLabel}>Effective Date</Text>
              <Text style={styles.metaGridValue}>9 October 2026</Text>
            </View>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaGridLabel}>Merchant Package</Text>
              <Text style={styles.metaGridCode}>com.krifoo.admin</Text>
            </View>
            <View style={styles.metaGridCell}>
              <Text style={styles.metaGridLabel}>Framework</Text>
              <Text style={styles.metaGridValue}>GDPR & UK GDPR Compliant</Text>
            </View>
          </View>
        </View>

        {/* Callout Notice: Zero Data Monetization */}
        <View style={styles.calloutCard}>
          <View style={styles.calloutHeader}>
            <Lock size={16} color="#065F46" />
            <Text style={styles.calloutTitle}>Strict Notice on Data Monetization</Text>
          </View>
          <Text style={styles.calloutText}>
            Krifoo does not sell, lease, commercialize, or rent merchant commercial data, sales figures, or
            customer contact information to third-party data brokers, advertising networks, or marketing
            intermediaries.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 1. SCOPE AND APPLICATIONS                                                 */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 01</Text>
          <Text style={styles.sectionTitle}>1. Scope & Ecosystem</Text>
          <Text style={styles.paragraph}>
            This Privacy Policy sets forth the principles under which <Text style={styles.boldText}>Krifoo Technologies</Text>{' '}
            ("we", "us", or "our") governs the collection, recording, storage, and processing of personal and
            commercial partner data. This document applies directly to all operators, managers, and kitchen
            personnel utilizing our merchant platforms:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Krifoo Admin Application</Text> (Package ID:{' '}
              <Text style={styles.codeText}>com.krifoo.admin</Text>): Dedicated merchant terminal for Android
              and iOS used by licensed restaurant operators to manage catalogs, accept orders, configure POS receipt
              printing, and coordinate table seating.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Web Applications & APIs</Text>: Hosted at{' '}
              <Text style={styles.codeText}>https://krifoo.co.uk</Text> and{' '}
              <Text style={styles.codeText}>https://krifoo.com</Text>.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 2. CATEGORIES OF DATA COLLECTED                                           */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 02</Text>
          <Text style={styles.sectionTitle}>2. Categories of Data Collected</Text>
          <Text style={styles.paragraph}>
            We process commercial operational data and essential technical telemetry to ensure reliable order
            routing and terminal operation:
          </Text>

          <Text style={styles.subHeading}>2.1 Commercial Partner & Operator Records</Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Business Identifiers</Text>: Registered restaurant name, trading address,
              store phone number, manager email, and tax identification details.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Operational Catalog Data</Text>: Menu items, pricing matrices, inventory
              availability, shift schedules, delivery radiuses, and table seating configurations.
            </Text>
          </View>

          <Text style={styles.subHeading}>2.2 Hardware & POS Terminal Identifiers</Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Thermal Printer Configurations</Text>: Bluetooth MAC addresses (e.g. SPP /
              BLE devices), local network IP addresses (ports 9100 / 8008), and printer model specifications (e.g., Epson
              TM-m30III, Star Micronics, ESC/POS hardware) stored locally to automate kitchen ticket printing.
            </Text>
          </View>

          <Text style={styles.subHeading}>2.3 Technical Metrics & Diagnostics</Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>System Diagnostics</Text>: Device hardware model, operating system build, network
              connection status, API response latencies, and crash stack traces.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 3. HARDWARE & SYSTEM PERMISSIONS                                          */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 03</Text>
          <Text style={styles.sectionTitle}>3. Hardware & System Permissions</Text>
          <Text style={styles.paragraph}>
            In compliance with Apple App Store Review Guideline 5.1.1 and Google Play Developer Policies, permissions
            are requested strictly on an as-needed functional basis for Krifoo Admin:
          </Text>

          <View style={styles.permissionItem}>
            <View style={styles.permissionIconBadge}>
              <Printer size={18} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.permissionTitle}>Bluetooth & Local Network</Text>
                <Text style={styles.codeBadge}>BLUETOOTH_CONNECT</Text>
                <Text style={styles.codeBadge}>NSLocalNetworkUsage</Text>
              </View>
              <Text style={styles.permissionDesc}>
                Enables discovery, pairing, and bidirectional ESC/POS data transmission to wireless Bluetooth and local
                Wi-Fi/LAN thermal receipt printers for automated kitchen ticket dispatch.
              </Text>
            </View>
          </View>

          <View style={styles.permissionItem}>
            <View style={styles.permissionIconBadge}>
              <Smartphone size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.permissionTitle}>System Wake Lock</Text>
                <Text style={styles.codeBadge}>WAKE_LOCK</Text>
              </View>
              <Text style={styles.permissionDesc}>
                Prevents commercial merchant terminals and kitchen tablets from entering sleep mode during active operating
                hours, ensuring orders are never missed.
              </Text>
            </View>
          </View>

          <View style={styles.permissionItem}>
            <View style={styles.permissionIconBadge}>
              <Bell size={18} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.permissionTitle}>Push Notifications & Buzzers</Text>
                <Text style={styles.codeBadge}>POST_NOTIFICATIONS</Text>
              </View>
              <Text style={styles.permissionDesc}>
                Transmits real-time high-priority alerts, continuous audio buzzers, and vibration pulses for new delivery
                orders, table reservations, and order cancellations.
              </Text>
            </View>
          </View>

          <View style={styles.permissionItem}>
            <View style={styles.permissionIconBadge}>
              <FileText size={18} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.permissionTitle}>Photo Library & Storage</Text>
                <Text style={styles.codeBadge}>READ_MEDIA_IMAGES</Text>
              </View>
              <Text style={styles.permissionDesc}>
                Permits restaurant operators to select and upload store logo graphics, header banners, and menu dish photographs.
              </Text>
            </View>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 4. PROCESSING PURPOSES                                                    */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 04</Text>
          <Text style={styles.sectionTitle}>4. Processing Purposes & Legal Bases</Text>
          <Text style={styles.paragraph}>
            Data processed within Krifoo Admin operates under contractual performance, statutory obligations, and legitimate
            business interests:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Order Fulfillment</Text>: Relaying incoming customer orders to kitchens, calculating
              preparation times, and triggering automatic receipt printing.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Terminal Security</Text>: Authenticating store accounts via secure OTP and tokenized
              sessions to prevent unauthorized console access.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Payouts & Accounting</Text>: Reconciling settled transactions, commission structures,
              and tax filings in compliance with financial regulations.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 5. THIRD-PARTY DISCLOSURES                                                */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 05</Text>
          <Text style={styles.sectionTitle}>5. Third-Party Sub-Processors</Text>
          <Text style={styles.paragraph}>
            Data is transmitted only to certified technical sub-processors under rigorous confidentiality agreements:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Payment Processors (Stripe Connect)</Text>: Level 1 PCI-DSS certified gateway
              managing merchant bank payouts and tokenized customer payments.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Push Notification Gateways</Text>: Firebase Cloud Messaging (FCM) and Expo Push Service
              deliver instant order alerts to tablet hardware.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Geographic Information Services</Text>: Google Maps API is used to calculate delivery
              distance matrices and address lookups.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 6. DATA RETENTION & ERASURE                                               */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 06</Text>
          <Text style={styles.sectionTitle}>6. Data Retention Schedules & Account Erasure</Text>
          <Text style={styles.paragraph}>
            We adhere to strict data minimization principles under GDPR and statutory accounting standards:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Active Profiles</Text>: Maintained for the active duration of the restaurant's merchant
              service agreement.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Fiscal Records</Text>: Preserved for up to six (6) years in accordance with applicable UK
              and statutory taxation, audit, and accounting laws.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Account Erasure (Apple Guideline 5.1.1(v))</Text>: Store operators may request complete
              account closure and profile erasure by emailing{' '}
              <Text style={styles.linkText} onPress={() => handleOpenEmail('admin@krifoo.com')}>
                admin@krifoo.com
              </Text>. Verified requests are executed within thirty (30) days.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 7. SECURITY CONTROLS                                                      */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 07</Text>
          <Text style={styles.sectionTitle}>7. Security Safeguards</Text>
          <Text style={styles.paragraph}>
            Network communications are secured with TLS 1.2 / TLS 1.3 encryption. Production databases are encrypted at rest with
            AES-256. Access to production infrastructure is strictly restricted to authorized engineers under least-privilege
            access protocols.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 8. COMPLIANCE & LEGAL DESK                                                */}
        {/* ========================================================================= */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Building2 size={20} color="#0F172A" />
            <Text style={styles.contactTitle}>Krifoo Legal & Compliance Desk</Text>
          </View>

          <Text style={styles.contactSub}>
            For inquiries regarding privacy, statutory rights (GDPR / UK GDPR / CCPA), or merchant data erasure:
          </Text>

          <View style={styles.contactDetailsRow}>
            <Mail size={16} color="#059669" />
            <TouchableOpacity onPress={() => handleOpenEmail('admin@krifoo.com')} activeOpacity={0.7}>
              <Text style={styles.contactLink}>admin@krifoo.com</Text>
            </TouchableOpacity>
            <Text style={styles.contactDivider}>•</Text>
            <TouchableOpacity onPress={() => handleOpenEmail('admin@krifoo.co.uk')} activeOpacity={0.7}>
              <Text style={styles.contactLink}>admin@krifoo.co.uk</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.contactDomainsRow}>
            <TouchableOpacity
              style={styles.domainChip}
              onPress={() => handleOpenWeb('https://krifoo.co.uk')}
              activeOpacity={0.7}
            >
              <ExternalLink size={13} color="#475569" />
              <Text style={styles.domainChipText}>https://krifoo.co.uk</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.domainChip}
              onPress={() => handleOpenWeb('https://krifoo.com')}
              activeOpacity={0.7}
            >
              <ExternalLink size={13} color="#475569" />
              <Text style={styles.domainChipText}>https://krifoo.com</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 48,
    gap: 14,
  },
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  metaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  metaIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.6,
  },
  metaTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  metaSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 17,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  metaGridCell: {
    flex: 1,
    minWidth: 140,
  },
  metaGridLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaGridValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  metaGridCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: 2,
  },
  calloutCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  calloutTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  calloutText: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionNumber: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    marginBottom: 10,
  },
  subHeading: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 10,
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11.5,
    backgroundColor: '#F1F5F9',
    color: '#0F172A',
  },
  linkText: {
    color: '#2563EB',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#059669',
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 19,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  permissionIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  permissionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  codeBadge: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#E2E8F0',
    color: '#334155',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  permissionDesc: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 16,
  },
  contactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  contactTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  contactSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginTop: 2,
  },
  contactDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexWrap: 'wrap',
  },
  contactLink: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#059669',
  },
  contactDivider: {
    color: '#CBD5E1',
  },
  contactDomainsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  domainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  domainChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
});
