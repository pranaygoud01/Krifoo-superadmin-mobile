import { apiRequest, type ApiResponse } from './api';

/** Super admin: service push notifications to restaurant devices (/api/admin/broadcasts). */

export type BroadcastCategory = 'info' | 'important' | 'maintenance';

export interface BroadcastAudience {
  mode: 'all' | 'selected';
  restaurantIds: string[];
  onlyOpen: boolean;
}

export interface Broadcast {
  _id: string;
  title: string;
  body: string;
  category: BroadcastCategory;
  audience: BroadcastAudience;
  status: 'sending' | 'sent' | 'failed';
  recipientRestaurants: number;
  deviceCount: number;
  deliveredCount: number;
  failedCount: number;
  createdAt: string;
  sentAt?: string | null;
  createdBy?: { fullName?: string; email?: string };
}

export interface AudienceSummary {
  restaurants: number;
  restaurantsWithApp: number;
  devices: number;
}

export const BROADCAST_TITLE_MAX = 50;
export const BROADCAST_BODY_MAX = 178;

const audienceQuery = (a: BroadcastAudience) => {
  const p = new URLSearchParams({ mode: a.mode, onlyOpen: String(a.onlyOpen) });
  if (a.mode === 'selected') p.set('restaurantIds', a.restaurantIds.join(','));
  return `?${p.toString()}`;
};

export const broadcastService = {
  list() {
    return apiRequest<Broadcast[]>('/api/admin/broadcasts') as Promise<
      ApiResponse<Broadcast[]> & { meta?: { sentToday: number; dailyLimit: number } }
    >;
  },
  audience(a: BroadcastAudience) {
    return apiRequest<AudienceSummary>(`/api/admin/broadcasts/audience-count${audienceQuery(a)}`);
  },
  send(message: { title: string; body: string; category: BroadcastCategory }, audience: BroadcastAudience) {
    return apiRequest<Broadcast>('/api/admin/broadcasts', { method: 'POST', body: { ...message, audience } });
  },
  test(message: { title: string; body: string; category: BroadcastCategory }) {
    return apiRequest('/api/admin/broadcasts/test', { method: 'POST', body: message });
  },
};
