export type KitchenThemeName = 'dark' | 'light';
export type KitchenTextSize = 'S' | 'M' | 'L';

export const TEXT_SCALE: Record<KitchenTextSize, number> = { S: 0.9, M: 1, L: 1.22 };

export const STAGE_COLORS = {
  new: '#F59E0B',
  cooking: '#3B82F6',
  ready: '#10B981',
} as const;

export interface KitchenPalette {
  bg: string;
  surface: string;
  card: string;
  cardBorder: string;
  text: string;
  muted: string;
  done: string;
  divider: string;
  noteBg: string;
  noteText: string;
  overdue: string;
  overdueBg: string;
  warning: string;
  chipBg: string;
  /** Card background + border per column, so a ticket's stage is obvious at a glance. */
  stage: Record<'new' | 'cooking' | 'ready', { bg: string; border: string }>;
}

export const PALETTES: Record<KitchenThemeName, KitchenPalette> = {
  dark: {
    bg: '#0B0F14',
    surface: '#111827',
    card: '#1F2937',
    cardBorder: '#374151',
    text: '#F9FAFB',
    muted: '#9CA3AF',
    done: '#6B7280',
    divider: '#374151',
    noteBg: '#422006',
    noteText: '#FDE68A',
    overdue: '#F87171',
    overdueBg: '#450A0A',
    warning: '#FBBF24',
    chipBg: '#111827',
    stage: {
      new: { bg: '#2B2211', border: '#92400E' },
      cooking: { bg: '#13213D', border: '#1E40AF' },
      ready: { bg: '#0F2A21', border: '#047857' },
    },
  },
  light: {
    bg: '#E2E8F0',
    surface: '#F1F5F9',
    card: '#FFFFFF',
    cardBorder: '#CBD5E1',
    text: '#0F172A',
    muted: '#475569',
    done: '#94A3B8',
    divider: '#E2E8F0',
    noteBg: '#FEF3C7',
    noteText: '#92400E',
    overdue: '#DC2626',
    overdueBg: '#FEE2E2',
    warning: '#B45309',
    chipBg: '#FFFFFF',
    stage: {
      new: { bg: '#FFFBEB', border: '#FCD34D' },
      cooking: { bg: '#EFF6FF', border: '#93C5FD' },
      ready: { bg: '#ECFDF5', border: '#6EE7B7' },
    },
  },
};
