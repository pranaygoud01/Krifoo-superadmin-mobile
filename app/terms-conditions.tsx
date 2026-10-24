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
  FileText,
  AlertTriangle,
  Scale,
  ShieldAlert,
  Clock,
  Printer,
  UtensilsCrossed,
  CreditCard,
  Building2,
  Mail,
  ExternalLink,
  Ban,
  CheckCircle2,
} from 'lucide-react-native';

export default function TermsConditionsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const handleOpenEmail = (email: string) => {
    Linking.openURL(`mailto:${email}?subject=Krifoo%20Admin%20Terms%20Inquiry`).catch(() => {});
  };

  const handleOpenWeb = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <Header title="Terms & Conditions" showBackButton={true} />

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
              <Scale size={22} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaKicker}>MERCHANT SERVICE AGREEMENT</Text>
              <Text style={styles.metaTitle}>Terms & Conditions</Text>
              <Text style={styles.metaSub}>
                Legally enforceable merchant partner agreement governing restaurant operators utilizing Krifoo
                Admin and associated point-of-sale services.
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
              <Text style={styles.metaGridLabel}>Jurisdiction</Text>
              <Text style={styles.metaGridValue}>United Kingdom / Global</Text>
            </View>
          </View>
        </View>

        {/* Notice of Mandatory Compliance */}
        <View style={styles.calloutCard}>
          <View style={styles.calloutHeader}>
            <ShieldAlert size={16} color="#B45309" />
            <Text style={styles.calloutTitle}>Notice of Mandatory Compliance</Text>
          </View>
          <Text style={styles.calloutText}>
            By accessing or operating the Krifoo Admin application, you agree to be bound by these Terms. If you do not
            accept these Terms in full, you must immediately cease terminal use and uninstall the software.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 1. ACCEPTANCE OF TERMS                                                    */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 01</Text>
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>
            These Terms and Conditions constitute a legally enforceable commercial agreement between you (the "Merchant" or
            "Operator") and <Text style={styles.boldText}>Krifoo Technologies</Text> ("Krifoo", "we", "us"). This applies
            directly to the Krifoo Admin Application (Package ID: <Text style={styles.codeText}>com.krifoo.admin</Text>),
            POS station integrations, and associated cloud ordering services.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 2. ELIGIBILITY & STORE OPERATOR ACCOUNTS                                   */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 02</Text>
          <Text style={styles.sectionTitle}>2. Operator Eligibility & Account Security</Text>
          <Text style={styles.paragraph}>
            Store operators must be at least 18 years of age (or the age of legal majority in the business operating
            jurisdiction) and possess full legal authority to represent the registered dining establishment:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Credential Integrity</Text>: Merchants must safeguard login credentials, API keys,
              and OTP authentication tokens. All orders accepted, rejected, or modified via the terminal are legally attributed
              to the merchant account holder.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Accurate Commercial Profiles</Text>: Merchants warrant that store name, operating
              premises address, telephone numbers, and business registration numbers are accurate and updated.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 3. MARKETPLACE SERVICES & FULFILLMENT                                     */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 03</Text>
          <Text style={styles.sectionTitle}>3. Marketplace Operations & Kitchen Fulfillment</Text>
          <Text style={styles.paragraph}>
            Krifoo acts as an intermediary technology platform connecting diners with independent food establishments:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Direct Contract of Sale</Text>: Contracts for the preparation and sale of meals are
              executed directly between the consumer and the fulfilling restaurant.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Preparation Timelines</Text>: Operators agree to fulfill accepted orders in accordance
              with estimated preparation times and notify customers promptly of unexpected kitchen delays.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Delivery Radiuses & Fees</Text>: Delivery zones, fees, and minimum spend tiers configured
              in Krifoo Admin must reflect actual operational coverage.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 4. TABLE RESERVATIONS                                                     */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 04</Text>
          <Text style={styles.sectionTitle}>4. Table Reservations & Seating Management</Text>
          <Text style={styles.paragraph}>
            Dine-in reservations confirmed through Krifoo Admin are binding commercial commitments:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>15-Minute Grace Period</Text>: In the event a dining party does not arrive within
              fifteen (15) minutes of the reserved booking time, the merchant reserves the right to reallocate the table.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Capacity Accuracy</Text>: Merchants agree to keep table availability schedules updated
              in Krifoo Admin to avoid double-booking or overcapacity issues.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 5. PRICING, FEES & STRIPE PAYOUTS                                         */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 05</Text>
          <Text style={styles.sectionTitle}>5. Pricing, Payouts & Stripe Connect</Text>
          <Text style={styles.paragraph}>
            Product retail prices are established exclusively by the merchant. Financial settlements and commission distributions
            are executed via Stripe Connect:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>PCI-DSS Compliance</Text>: All card transactions and bank payout rails comply with
              Level 1 PCI-DSS standards. Krifoo does not store unencrypted payment card credentials.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Settlement Schedules</Text>: Net sales proceeds (minus applicable platform commission
              fees and payment processing fees) are transferred to merchant bank accounts according to Stripe Connect rolling
              payout schedules.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 6. CANCELLATIONS, REFUNDS & CLAIMS                                        */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 06</Text>
          <Text style={styles.sectionTitle}>6. Cancellations, Refunds & Quality Claims</Text>
          <Text style={styles.paragraph}>
            Due to the perishable nature of prepared foodstuffs, cancellation rules are strictly defined:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Consumer Cancellation Window</Text>: Consumers hold a sixty (60) second grace period
              following submission. Once kitchen preparation has commenced or been accepted in Krifoo Admin, cancellation for
              change-of-mind is void.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Damaged or Missing Items</Text>: Verified customer claims submitted with photographic
              evidence within two (2) hours of delivery will be resolved by the merchant via item replacement, merchant credit,
              or monetary reimbursement processed within 3 to 7 banking days.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 7. MERCHANT OBLIGATIONS & POS PRINTERS                                    */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 07</Text>
          <Text style={styles.sectionTitle}>7. Merchant Obligations, Hygiene & POS Hardware</Text>
          <Text style={styles.paragraph}>
            Licensed restaurant operators agree to maintain strict professional and operational standards:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Food Safety & Hygiene</Text>: Full compliance with municipal health authority rules,
              food hygiene ratings, and sanitary standards during storage, preparation, and packaging.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>POS Hardware Connectivity</Text>: Merchants are responsible for keeping tablet devices
              powered, connected to Wi-Fi, and paired with thermal receipt printers (Epson TM-m30III, Star Micronics, ESC/POS hardware)
              to ensure uninterrupted order ticket generation.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              <Text style={styles.boldText}>Customer Data Confidentiality</Text>: Customer contact details (phone numbers and addresses)
              displayed on receipts are confidential and may be used solely for immediate fulfillment. Extracting customer details for
              unauthorized direct marketing is strictly prohibited.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 8. DIETARY & ALLERGEN DISCLAIMER                                          */}
        {/* ========================================================================= */}
        <View style={styles.allergenCard}>
          <View style={styles.allergenHeader}>
            <UtensilsCrossed size={18} color="#991B1B" />
            <Text style={styles.allergenTitle}>Critical Food Safety & Allergen Disclaimer</Text>
          </View>
          <Text style={styles.allergenText}>
            Krifoo does not operate food preparation kitchens. Menu specifications, dietary designations (vegan, halal, kosher, gluten-free),
            and allergen disclosures (including nuts, dairy, celery, crustaceans, eggs, and mustard) are the sole legal responsibility
            of the preparing merchant. Merchants warrant that all allergen alerts configured in Krifoo Admin are accurate and up to date.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 9. PROPRIETARY INTELLECTUAL PROPERTY                                      */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 08</Text>
          <Text style={styles.sectionTitle}>8. Proprietary Intellectual Property</Text>
          <Text style={styles.paragraph}>
            All software code, user interface designs, typography, brand marks, and documentation rights are the exclusive property
            of Krifoo Technologies. Merchants receive a revocable, non-exclusive license solely for authorized operational use.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 10. PROHIBITED CONDUCT                                                    */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 09</Text>
          <Text style={styles.sectionTitle}>9. Prohibited Conduct</Text>
          <Text style={styles.paragraph}>
            The following actions constitute material breach and result in immediate account termination:
          </Text>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              Submitting fictitious test orders, price gouging, or manipulating customer review scores.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              Automated scraping of competitor menu items, platform reverse engineering, or penetration testing.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              Verbal, physical, or discriminatory abuse directed toward couriers, customers, or Krifoo support personnel.
            </Text>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* 11. DISCLAIMER OF WARRANTIES & LIABILITY                                  */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 10</Text>
          <Text style={styles.sectionTitle}>10. Warranty Disclaimers & Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
            TO THE FULLEST EXTENT PERMISSIBLE UNDER APPLICABLE LAW, KRIFOO TECHNOLOGIES SHALL NOT BE HELD LIABLE FOR INDIRECT,
            INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES. AGGREGATE LIABILITY SHALL NOT EXCEED THE SPECIFIC TRANSACTION VALUE OF THE
            DISPUTED ORDER OR $50.00 USD.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 12. GOVERNING LAW                                                         */}
        {/* ========================================================================= */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionNumber}>SECTION 11</Text>
          <Text style={styles.sectionTitle}>11. Governing Law & Dispute Resolution</Text>
          <Text style={styles.paragraph}>
            These Terms are governed by the statutory laws of Krifoo's corporate registration jurisdiction. Parties agree to pursue
            informal resolution consultation prior to seeking formal arbitration or judicial recourse.
          </Text>
        </View>

        {/* ========================================================================= */}
        {/* 13. LEGAL NOTICE DESK                                                     */}
        {/* ========================================================================= */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Building2 size={20} color="#0F172A" />
            <Text style={styles.contactTitle}>Krifoo Legal Notice Desk</Text>
          </View>

          <Text style={styles.contactSub}>
            Formal notices, regulatory inquiries, or partnership contract matters may be directed to our compliance desk:
          </Text>

          <View style={styles.contactDetailsRow}>
            <Mail size={16} color="#0284C7" />
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
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284C7',
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
    color: '#0284C7',
    marginTop: 2,
  },
  calloutCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: '#D97706',
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
    color: '#92400E',
  },
  calloutText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
  },
  allergenCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  allergenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  allergenTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#991B1B',
  },
  allergenText: {
    fontSize: 12,
    color: '#7F1D1D',
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
    backgroundColor: '#0284C7',
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 19,
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
    color: '#0284C7',
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
