import type { ImageSourcePropType } from 'react-native';
import { DEFAULT_API_URL } from '../constants/config';
import { LocalImages, resolveImageSource } from '../constants/local-assets';

/**
 * Safely resolves any image input (object, relative path, protocol-relative URL, or full URL)
 * into a valid absolute HTTPS/HTTP URI string for expo-image or React Native Image.
 */
export function resolveImageUrl(rawUrl?: any): string | null {
  if (!rawUrl) return null;

  let url = rawUrl;

  // Handle MongoDB / Cloudinary object structures: { url: "...", secure_url: "..." }
  if (typeof rawUrl === 'object') {
    url = rawUrl.secure_url || rawUrl.url || rawUrl.uri || null;
  }

  if (typeof url !== 'string') return null;
  url = url.trim();
  if (!url) return null;

  // Local Expo asset refs are bundled with `require()` and must not be converted into backend URLs.
  if (
    url.startsWith('@/assets/') ||
    url.startsWith('./assets/') ||
    url.startsWith('/assets/') ||
    url.startsWith('assets/') ||
    url.startsWith('~assets/')
  ) {
    return null;
  }

  // Protocol-relative URLs (e.g. //res.cloudinary.com/...)
  if (url.startsWith('//')) {
    return `https:${url}`;
  }

  // Relative backend URLs (e.g. /uploads/image.png)
  if (url.startsWith('/')) {
    const base = DEFAULT_API_URL.replace(/\/+$/, '');
    return `${base}${url}`;
  }

  // Local device file, content, or data URI
  if (url.startsWith('file://') || url.startsWith('data:') || url.startsWith('content://')) {
    return url;
  }

// Full HTTP/HTTPS URLs: Upgrade any insecure HTTP (Cloudinary, backend, etc.) to secure HTTPS
  if (url.startsWith('http://') || url.startsWith('https://')) {
    if (url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  }

  // Fallback for paths without leading slash: e.g. "uploads/restaurant.png"
  const base = DEFAULT_API_URL.replace(/\/+$/, '');
  return `${base}/${url}`;
}

export function resolveMediaImageSource(
  rawUrl?: any,
  fallback?: ImageSourcePropType | null,
): ImageSourcePropType | null {
  if (!rawUrl) {
    return fallback ?? null;
  }

  // Bundled local asset required directly (number)
  if (typeof rawUrl === 'number') {
    return rawUrl;
  }

  // Object with uri
  if (typeof rawUrl === 'object' && rawUrl.uri && typeof rawUrl.uri === 'string') {
    const resolved = resolveImageUrl(rawUrl.uri);
    return resolved ? { ...rawUrl, uri: resolved } : (fallback ?? null);
  }

  // Object with url or secure_url
  let cleanCandidate = rawUrl;
  if (typeof rawUrl === 'object') {
    cleanCandidate = rawUrl.secure_url || rawUrl.url || rawUrl.uri || null;
  }

  if (typeof cleanCandidate === 'string') {
    // Check if it matches a bundled local asset name (e.g. "assets/food.png", "food.png", "logo.png")
    const localAsset = resolveImageSource(cleanCandidate, null as any);
    if (localAsset && typeof localAsset === 'number') {
      return localAsset;
    }

    const resolved = resolveImageUrl(cleanCandidate);
    if (resolved) {
      return { uri: resolved };
    }
  }

  return fallback ?? null;
}

