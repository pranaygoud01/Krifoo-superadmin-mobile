import { apiRequest, type ApiResponse } from './api';

/** Super admin: email marketing (contacts + campaigns) — /api/admin/marketing/… */

export type ContactSource = 'order' | 'newsletter' | 'manual' | 'user_account';
export type SubscribedFilter = 'all' | 'true' | 'false';
export type CampaignAudience = 'all' | 'restaurant_specific';

export interface MarketingContact {
  _id: string;
  email: string;
  customerName?: string;
  phoneNumber?: string;
  restaurantName?: string;
  source: ContactSource;
  totalOrders: number;
  lastOrderAt?: string;
  isSubscribed: boolean;
  unsubscribedAt?: string | null;
}

export interface MarketingStats {
  totalContactsInDB: number;
  totalSubscribed: number;
  totalRestaurants: number;
  dailyLimit: number;
  sentLast24h: number;
}

export interface MarketingCampaign {
  _id: string;
  title: string;
  subject: string;
  targetAudience: CampaignAudience;
  restaurantName?: string;
  recipientCount: number;
  successCount: number;
  failedCount: number;
  status: 'sending' | 'sent' | 'failed';
  promoCode?: string;
  createdAt: string;
  sentBy?: { fullName?: string; email?: string };
}

export interface CampaignContent {
  subject: string;
  offerTitle?: string;
  discountValue?: string;
  promoCode?: string;
  bodyContent: string;
  callToActionText?: string;
  callToActionUrl?: string;
}

export interface AudienceInfo {
  count: number;
  dailyLimit: number;
  sentLast24h: number;
  remainingToday: number;
}


const qs = (params: Record<string, string | number | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== 'all')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const marketingService = {
  getContacts(params: { page?: number; limit?: number; search?: string; isSubscribed?: SubscribedFilter; source?: string }) {
    return apiRequest<MarketingContact[]>(`/api/admin/marketing/contacts${qs({ limit: 30, ...params })}`) as Promise<
      ApiResponse<MarketingContact[]> & { pagination?: { total: number; page: number; totalPages: number }; stats?: MarketingStats }
    >;
  },

  syncContacts() {
    return apiRequest<{ createdCount: number; updatedCount: number; processedOrders: number }>('/api/admin/marketing/sync', {
      method: 'POST',
      timeoutMs: 120000, // reads every past order
    });
  },

  toggleSubscription(contactId: string) {
    return apiRequest<MarketingContact>(`/api/admin/marketing/contacts/${contactId}/toggle-subscribed`, { method: 'PATCH' });
  },

  deleteContact(contactId: string) {
    return apiRequest(`/api/admin/marketing/contacts/${contactId}`, { method: 'DELETE' });
  },

  getCampaigns() {
    return apiRequest<MarketingCampaign[]>('/api/admin/marketing/campaigns');
  },

  getAudience(targetAudience: CampaignAudience, restaurantId?: string) {
    return apiRequest<AudienceInfo>(`/api/admin/marketing/audience-count${qs({ targetAudience, restaurantId })}`);
  },

  sendTest(testEmail: string, content: CampaignContent, restaurantName?: string) {
    return apiRequest('/api/admin/marketing/send-test', {
      method: 'POST',
      body: { testEmail, restaurantName, ...content },
    });
  },

  send(title: string, targetAudience: CampaignAudience, restaurantId: string | undefined, content: CampaignContent) {
    return apiRequest<{ campaignId: string; recipientCount: number }>('/api/admin/marketing/send', {
      method: 'POST',
      body: { title, targetAudience, restaurantId, ...content },
    });
  },
};
