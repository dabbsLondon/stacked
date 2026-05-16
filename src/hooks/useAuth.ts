import { useEffect, useState } from 'react';
import {
  SUPABASE_ENABLED,
  supabase,
  getCurrentProfile,
  type Profile,
} from '../engine/supabase';

export type AuthState =
  | { kind: 'disabled' } // Supabase not configured — solo localStorage mode
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; userId: string; profile: Profile | null };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() =>
    SUPABASE_ENABLED ? { kind: 'loading' } : { kind: 'disabled' },
  );

  useEffect(() => {
    if (!SUPABASE_ENABLED || !supabase) return;
    let mounted = true;

    async function refresh() {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = data.user;
      if (!user) {
        setState({ kind: 'signed-out' });
        return;
      }
      const profile = await getCurrentProfile();
      if (!mounted) return;
      setState({ kind: 'signed-in', userId: user.id, profile });
    }

    refresh();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
