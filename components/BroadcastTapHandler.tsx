import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { addBroadcastTapListener } from '../services/notification';

/** Opens "Krifoo updates" when a restaurant owner taps a Krifoo service push notification. */
export function BroadcastTapHandler() {
  const router = useRouter();
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    return addBroadcastTapListener(() => {
      const u = userRef.current;
      if (!u) return; // not signed in yet — the login flow takes over
      router.push(u.userType === 'super_admin' ? '/broadcast' : '/updates');
    });
  }, [router]);

  return null;
}
