import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { DEFAULT_API_URL, STORAGE_KEYS } from '../constants/config';

export type ApiErrorType =
  | 'network'
  | 'server'
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'client'
  | 'unknown';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  errorType?: ApiErrorType;
  statusCode?: number;
  url?: string;
  [key: string]: any;
}

/**
 * Returns the configured API base URL.
 * Automatically migrates stale stored URLs that incorrectly end with '/api'
 * (which would cause double-prefix like /api/api/auth/...).
 */
export async function getApiBaseUrl(): Promise<string> {
  try {
    const customUrl = await AsyncStorage.getItem(STORAGE_KEYS.API_BASE_URL);
    if (customUrl && (customUrl.includes('10.123.62.9') || customUrl.includes(':3000'))) {
      await AsyncStorage.removeItem(STORAGE_KEYS.API_BASE_URL);
      return DEFAULT_API_URL;
    }
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

/**
 * Tests connectivity and latency to the specified or configured API base URL.
 */
export async function testApiConnection(customUrl?: string): Promise<{
  success: boolean;
  latencyMs?: number;
  message: string;
  errorType?: ApiErrorType;
  statusCode?: number;
  url: string;
}> {
  const targetUrl = customUrl ? customUrl.trim().replace(/\/api\/?$/, '').replace(/\/$/, '') : await getApiBaseUrl();
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    // Try pinging the health check or settings endpoint
    const response = await fetch(`${targetUrl}/api/admin/settings`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'Bypass-Tunnel-Reminder': 'true' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (response.status < 500) {
      // Any non-500 response (even 401 or 404) proves server is alive and reachable!
      return {
        success: true,
        latencyMs,
        message: `Server reachable (${latencyMs}ms)`,
        statusCode: response.status,
        url: targetUrl,
      };
    } else {
      return {
        success: false,
        latencyMs,
        message: `Server returned error (${response.status})`,
        errorType: 'server',
        statusCode: response.status,
        url: targetUrl,
      };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    const isTimeout = error?.name === 'AbortError' || error?.message?.includes('aborted');
    return {
      success: false,
      message: isTimeout
        ? `Connection timed out after 8s. Server is not responding at ${targetUrl}.`
        : `Cannot reach server at ${targetUrl}. Ensure backend is running and accessible on this network.`,
      errorType: 'network',
      url: targetUrl,
    };
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
    timeoutMs?: number;
    isFormData?: boolean;
  } = {}
): Promise<ApiResponse<T>> {
  const baseUrl = await getApiBaseUrl();
  const token = await getAuthToken();

  // Ensure endpoint starts with /
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${path}`;

  console.log(`[API Request] ${options.method || 'GET'} ${path} - Token: ${token ? 'present' : 'absent'}`);

  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const timeoutMs = options.timeoutMs || 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fetchOptions: RequestInit = {
    method: options.method || 'GET',
    headers,
    signal: controller.signal,
  };

  if (options.body && options.method !== 'GET') {
    fetchOptions.body = isFormData ? (options.body as any) : JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    // Check Content-Type before parsing JSON
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!isJson) {
      const text = await response.text();
      console.warn(`[API] Non-JSON response from ${url}:`, text.substring(0, 300));

      const isServerErr = response.status >= 500;
      const errorType: ApiErrorType =
        response.status === 404
          ? 'not_found'
          : response.status === 403
          ? 'forbidden'
          : response.status === 401
          ? 'auth'
          : 'server';

      const message =
        response.status === 404
          ? `API endpoint not found (404): ${endpoint}`
          : response.status === 403
          ? 'Access denied. Make sure you are logging in as a Super Admin.'
          : response.status === 401
          ? 'Session expired. Please log in again.'
          : `Server returned an invalid response (${response.status}). Ensure backend is running properly at: ${baseUrl}`;

      // Notify global connection status
      DeviceEventEmitter.emit('api_connection_status', {
        isOnline: !isServerErr,
        errorType,
        message,
        baseUrl,
        statusCode: response.status,
        url,
      });

      return {
        success: false,
        message,
        error: `non_json_response_${response.status}`,
        errorType,
        statusCode: response.status,
        url,
      };
    }

    const data = await response.json();

    if (!response.ok) {
      const statusCode = response.status;
      const isServerErr = statusCode >= 500;
      const errorType: ApiErrorType = isServerErr
        ? 'server'
        : statusCode === 401
        ? 'auth'
        : statusCode === 403
        ? 'forbidden'
        : statusCode === 404
        ? 'not_found'
        : 'client';

      const userMessage =
        data.message ||
        data.error ||
        (isServerErr
          ? `Server error (${statusCode}). The server encountered an issue.`
          : `Request error (${statusCode})`);

      if (isServerErr) {
        DeviceEventEmitter.emit('api_connection_status', {
          isOnline: false,
          errorType: 'server',
          message: userMessage,
          baseUrl,
          statusCode,
          url,
        });
      }

      return {
        ...data,
        success: false,
        message: userMessage,
        error: data.error || data.message || `HTTP ${statusCode}`,
        errorType,
        statusCode,
        url,
      };
    }

    // Success - notify that connection is alive and working
    DeviceEventEmitter.emit('api_connection_status', {
      isOnline: true,
      baseUrl,
      url,
    });

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    const isTimeout = error?.name === 'AbortError' || error?.message?.includes('aborted');
    const isNetworkError =
      isTimeout ||
      error?.message?.includes('Network request failed') ||
      error?.message?.includes('Failed to fetch') ||
      error?.name === 'TypeError';

    const message = isTimeout
      ? `Server request timed out (${Math.round(timeoutMs / 1000)}s). Backend at ${baseUrl} is taking too long to respond.`
      : isNetworkError
      ? `Cannot connect to server. If testing locally, make sure your backend is running at ${baseUrl} and accessible from this device.`
      : error?.message || 'An unexpected error occurred.';

    console.warn('API Request failed:', message);

    // Notify listeners about connection failure
    DeviceEventEmitter.emit('api_connection_status', {
      isOnline: false,
      errorType: 'network',
      message,
      baseUrl,
      statusCode: 0,
      url,
    });

    return {
      success: false,
      message,
      error: error?.toString(),
      errorType: 'network',
      statusCode: 0,
      url,
    };
  }
}
