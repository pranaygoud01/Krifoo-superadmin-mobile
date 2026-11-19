/** Status colours and labels shared by the Orders board, order cards and the order detail sheet. */

export const ORDER_STATUS_LABELS: Record<string, string> = {
  placed: 'New',
  confirmed: 'Confirmed',
  preparing: 'In Kitchen',
  ready_for_pickup: 'Ready for Collection',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Completed',
  cancelled: 'Cancelled',
};

export const getOrderStatusLabel = (status?: string) =>
  ORDER_STATUS_LABELS[status || ''] || (status || '').replace(/_/g, ' ');

export function getOrderStatusColor(status?: string): string {
  const s = (status || '').toLowerCase().trim();
  switch (s) {
    case 'placed':
      return '#F59E0B'; // Amber - New Orders / Awaiting Acceptance
    case 'confirmed':
    case 'preparing':
      return '#3B82F6'; // Kitchen Blue - In Kitchen Cooking
    case 'ready_for_pickup':
      return '#FF5C39'; // Brand Coral - Ready for Pickup / Takeaway
    case 'out_for_delivery':
      return '#8B5CF6'; // Purple - Rider on the Way / Out for Delivery
    case 'delivered':
      return '#10B981'; // Emerald Green - Completed Successfully
    case 'cancelled':
      return '#EF4444'; // Red - Cancelled
    default:
      return '#94A3B8'; // Slate Gray fallback
  }
}

/** Soft card background + border per status, so cards are distinguishable at a glance. */
export function getOrderStatusSurface(status?: string): { bg: string; border: string; text: string } {
  switch ((status || '').toLowerCase().trim()) {
    case 'placed':
      return { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' }; // Amber
    case 'confirmed':
    case 'preparing':
      return { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' }; // Blue
    case 'ready_for_pickup':
      return { bg: '#FFF4F0', border: '#FFCDBF', text: '#C2410C' }; // Coral
    case 'out_for_delivery':
      return { bg: '#F5F3FF', border: '#DDD6FE', text: '#6D28D9' }; // Purple
    case 'delivered':
      return { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' }; // Green
    case 'cancelled':
      return { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' }; // Red
    default:
      return { bg: '#F8FAFC', border: '#E2E8F0', text: '#475569' }; // Slate
  }
}
