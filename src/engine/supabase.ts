import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ProjectSnapshot } from './projects';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// When env vars are absent the app stays in pure-localStorage mode. The rest
// of the codebase should branch on SUPABASE_ENABLED before touching `supabase`.
export const SUPABASE_ENABLED = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type AppRole = 'user' | 'admin';

export interface Profile {
  id: string;
  display_name: string | null;
  role: AppRole;
}

export interface RemoteProjectRow {
  id: string;
  owner_id: string;
  name: string;
  snapshot: ProjectSnapshot;
  created_at: string;
  updated_at: string;
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .eq('id', uid)
    .maybeSingle();
  if (error) {
    console.warn('getCurrentProfile failed', error);
    return null;
  }
  return data as Profile | null;
}

export async function signInWithMagicLink(
  email: string,
  redirectTo?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured.' };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo ?? window.location.origin },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ---------- project sync ----------

export async function listRemoteProjects(): Promise<RemoteProjectRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, name, snapshot, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('listRemoteProjects failed', error);
    return [];
  }
  return (data ?? []) as RemoteProjectRow[];
}

export async function saveRemoteProject(
  snapshot: ProjectSnapshot,
): Promise<RemoteProjectRow | null> {
  if (!supabase) return null;
  const uid = await getCurrentUserId();
  if (!uid) return null;
  // Upsert by id so the client can keep its locally-generated uuid as the
  // canonical key across devices.
  const row = {
    id: snapshot.id,
    owner_id: uid,
    name: snapshot.name,
    snapshot,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('projects')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) {
    console.warn('saveRemoteProject failed', error);
    return null;
  }
  return data as RemoteProjectRow;
}

export async function deleteRemoteProject(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) {
    console.warn('deleteRemoteProject failed', error);
    return false;
  }
  return true;
}

// Admin: list everyone's projects. The RLS policy `projects_admin_read`
// makes this an allowed read for role='admin'; for non-admins the query
// returns the same as listRemoteProjects.
export async function listAllProjectsAdmin(): Promise<
  Array<RemoteProjectRow & { owner_display_name: string | null }>
> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projects')
    .select(
      `
        id,
        owner_id,
        name,
        snapshot,
        created_at,
        updated_at,
        owner:profiles!projects_owner_id_fkey ( display_name )
      `,
    )
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('listAllProjectsAdmin failed', error);
    return [];
  }
  return (data ?? []).map((row) => {
    const r = row as unknown as RemoteProjectRow & {
      owner:
        | { display_name: string | null }
        | { display_name: string | null }[]
        | null;
    };
    const owner = Array.isArray(r.owner) ? r.owner[0] ?? null : r.owner;
    return {
      id: r.id,
      owner_id: r.owner_id,
      name: r.name,
      snapshot: r.snapshot,
      created_at: r.created_at,
      updated_at: r.updated_at,
      owner_display_name: owner?.display_name ?? null,
    };
  });
}
