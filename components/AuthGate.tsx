import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '../context/AuthContext';

/** Routes reachable without a session. `index` is the splash that decides where to go. */
export const PUBLIC_ROUTES = ['index', 'login', 'register', 'privacy-policy', 'terms-conditions'];

/**
 * Sends the user to /login whenever the session disappears while they are on a
 * protected screen (logout from anywhere, or a 401 from the API).
 */
export function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const currentRoute = segments[0] ?? 'index';

  useEffect(() => {
    if (!isLoading && !user && !PUBLIC_ROUTES.includes(currentRoute)) {
      router.replace('/login');
    }
  }, [user, isLoading, currentRoute, router]);

  return null;
}
