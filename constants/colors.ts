/**
 * Krifoo Admin — Design System
 * Mirrors the krifoo-mobile theme (InterTight font, #FF5C39 brand, white background)
 */

export const Colors = {
  // Brand
  primary: '#FF5C39',       // Krifoo orange-red
  primaryDark: '#E04B2A',
  primaryLight: '#FFF0EC',

  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  card: '#FFFFFF',
  cardSurface: '#F8F9FA',
  cardBorder: '#EEEEEE',

  // Text
  text: '#11181C',          // Near-black (from krifoo-mobile)
  textMuted: '#687076',
  textSubtle: '#9BA1A6',

  // Semantic
  success: '#1B942F',
  warning: '#FFB800',
  danger: '#EF4444',
  info: '#3B82F6',

  // Status badges (adjusted for light background)
  statusPending: {
    bg: '#FFF8E7',
    text: '#B45309',
    border: '#FFB800',
  },
  statusApproved: {
    bg: '#ECFDF5',
    text: '#065F46',
    border: '#10B981',
  },
  statusRejected: {
    bg: '#FEF2F2',
    text: '#991B1B',
    border: '#EF4444',
  },
  statusActive: {
    bg: '#EFF6FF',
    text: '#1D4ED8',
    border: '#3B82F6',
  },

  // Tab bar
  tabActive: '#FF5C39',
  tabInactive: '#9BA1A6',
  tabBackground: '#FFFFFF',
  tabBorder: '#EEEEEE',
};

export const Fonts = {
  regular: 'InterTight-Regular',
  medium: 'InterTight-Medium',
  semiBold: 'InterTight-SemiBold',
  bold: 'InterTight-Bold',
};
