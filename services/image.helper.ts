import { DEFAULT_API_URL } from '../constants/config';

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

  // Full HTTP/HTTPS URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Upgrade krifoo domain to secure HTTPS
    if (url.startsWith('http://') && url.includes('krifoo.co.uk')) {
      return url.replace('http://', 'https://');
    }
    return url;
  }

  // Fallback for paths without leading slash: e.g. "uploads/restaurant.png"
  const base = DEFAULT_API_URL.replace(/\/+$/, '');
  return `${base}/${url}`;
}

