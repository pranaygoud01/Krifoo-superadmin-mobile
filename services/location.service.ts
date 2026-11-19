import { apiRequest } from './api';

/** One address match from GET /api/location/search (Google geocoding). */
export interface AddressMatch {
  placeId: string;
  label: string; // full formatted address
  line1: string; // first part, e.g. "12 Mill Road"
  postalCode?: string;
  city?: string;
  lat: number;
  lon: number;
}

const component = (components: any[], type: string) =>
  (components || []).find((c: any) => Array.isArray(c?.types) && c.types.includes(type))?.long_name as string | undefined;

export const locationService = {
  /** Search UK addresses by postcode or street. Returns up to 5 matches with coordinates. */
  async searchAddress(query: string): Promise<{ success: boolean; data: AddressMatch[]; message?: string }> {
    const q = query.trim();
    if (q.length < 3) return { success: true, data: [] };
    // Bias to the UK so short postcodes resolve locally.
    const res = await apiRequest<any[]>(`/api/location/search?q=${encodeURIComponent(/\buk\b|united kingdom/i.test(q) ? q : `${q}, UK`)}`);
    if (!res.success) return { success: false, data: [], message: res.message };
    const data = (res.data || [])
      .filter((r: any) => Number.isFinite(Number(r?.lat)) && Number.isFinite(Number(r?.lon)))
      .map((r: any) => ({
        placeId: String(r.place_id || `${r.lat},${r.lon}`),
        label: String(r.display_name || r.name || ''),
        line1: String(r.name || String(r.display_name || '').split(',')[0] || ''),
        postalCode: component(r.address, 'postal_code'),
        city: component(r.address, 'postal_town') || component(r.address, 'locality'),
        lat: Number(r.lat),
        lon: Number(r.lon),
      }));
    return { success: true, data };
  },
};
