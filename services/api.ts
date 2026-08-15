import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_API_URL, STORAGE_KEYS } from '../constants/config';

/**
 * Returns the configured API base URL.
 * Automatically migrates stale stored URLs that incorrectly end with '/api'
 * (which would cause double-prefix like /api/api/auth/...).
 */
export async function getApiBaseUrl(): Promise<string> {
  try {
    const customUrl = await AsyncStorage.getItem(STORAGE_KEYS.API_BASE_URL);
    if (!customUrl) return DEFAULT_API_URL;

    // Migration: if the stored URL ends with /api, strip it so we don't get double /api
    if (customUrl.endsWith('/api')) {
      const fixed = customUrl.slice(0, -4);
      await AsyncStorage.setItem(STORAGE_KEYS.API_BASE_URL, fixed);
      console.warn(`[API] Migrated stale base URL from "${customUrl}" → "${fixed}"`);
      return fixed;
    }

    return customUrl;
  } catch {
    return DEFAULT_API_URL;
  }
}

export async function setApiBaseUrl(url: string): Promise<void> {
  // Normalize: strip trailing /api or trailing slash
  let normalized = url.trim().replace(/\/api\/?$/, '').replace(/\/$/, '');
  await AsyncStorage.setItem(STORAGE_KEYS.API_BASE_URL, normalized);
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN);
  } catch {
    return null;
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<{ success: boolean; data?: T; message?: string; error?: string; [key: string]: any }> {
  const baseUrl = await getApiBaseUrl();
  const token = await getAuthToken();

  // Ensure endpoint starts with /
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${path}`;

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body && options.method !== 'GET') {
    fetchOptions.body = isFormData ? (options.body as any) : JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, fetchOptions);

    // Check Content-Type before parsing JSON
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      const text = await response.text();
      console.warn(`[API] Non-JSON response from ${url}:`, text.substring(0, 300));
      return {
        success: false,
        message:
          response.status === 404
            ? `API endpoint not found (404): ${endpoint}`
            : response.status === 403
            ? 'Access denied. Make sure you are logging in as a Super Admin.'
            : response.status === 401
            ? 'Session expired. Please log in again.'
            : `Server error (${response.status}). Ensure backend is running at: ${baseUrl}`,
        error: `non_json_response_${response.status}`,
      };
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || data.error || `HTTP ${response.status} error`,
        error: data.error || data.message,
      };
    }

    return data;
  } catch (error: any) {
    const isNetworkError =
      error?.message?.includes('Network request failed') ||
      error?.message?.includes('Failed to fetch');

    const message = isNetworkError
      ? `Cannot reach server. If testing on a device, use your PC's local IP instead of localhost.\nConfigured URL: ${baseUrl}`
      : error?.message || 'An unexpected error occurred.';

    console.error('API Request failed:', error);
    return {
      success: false,
      message,
      error: error?.toString(),
    };
  }
}
