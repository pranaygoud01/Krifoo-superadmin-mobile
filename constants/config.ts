// API URL is set via .env file using EXPO_PUBLIC_API_URL
// Environments:
//   Local:      EXPO_PUBLIC_API_URL=http://10.123.62.9:3000
//   Production: EXPO_PUBLIC_API_URL=https://apiv1.krifoo.co.uk
//   Tunnel:     EXPO_PUBLIC_API_URL=https://cubbyhole-postbox-exorcism.ngrok-free.dev
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://apiv1.krifoo.co.uk';

export const STORAGE_KEYS = {
  ADMIN_TOKEN: '@krifoo_admin_token',
  ADMIN_USER: '@krifoo_admin_user',
  API_BASE_URL: '@krifoo_admin_api_url',
};

