import { useEffect, useState } from 'react';
import {
  BACKEND_ENABLED,
  getCurrentProfile,
  onAuthChange,
  pb,
  type Profile,
} from '../engine/backend';

export type AuthState =
  | { kind: 'disabled' } // No VITE_PB_URL — pure localStorage mode
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; userId: string; profile: Profile | null };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() =>
    BACKEND_ENABLED ? { kind: 'loading' } : { kind: 'disabled' },
  );

  useEffect(() => {
    if (!BACKEND_ENABLED || !pb) return;
    let mounted = true;

    async function refresh() {
      if (!pb || !mounted) return;
      if (!pb.authStore.isValid || !pb.authStore.model) {
        setState({ kind: 'signed-out' });
        return;
      }
      const profile = await getCurrentProfile();
      if (!mounted) return;
      setState({
        kind: 'signed-in',
        userId: pb.authStore.model.id as string,
        profile,
      });
    }

    refresh();
    const unsubscribe = onAuthChange(() => refresh());

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return state;
}
