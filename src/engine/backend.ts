// PocketBase adapter — same surface the rest of the codebase relies on, so
// the UI components and the auth hook don't care what's underneath. The
// public API mirrors the previous Supabase adapter (intentionally), with
// PocketBase-specific implementation details.
//
// Auth model: email + password (PocketBase's default flow). Magic links
// require SMTP configuration; we'll add that later if needed.

import PocketBase, { ClientResponseError } from 'pocketbase';
import type { ProjectSnapshot } from './projects';

const url = import.meta.env.VITE_PB_URL as string | undefined;

// BACKEND_ENABLED gates every call. Without VITE_PB_URL the app stays in
// pure-localStorage mode and no network calls happen.
export const BACKEND_ENABLED = Boolean(url);

export const pb: PocketBase | null = BACKEND_ENABLED
  ? new PocketBase(url!)
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

interface PbUserRecord {
  id: string;
  email?: string;
  name?: string;
  role?: AppRole;
}

interface PbProjectRecord {
  id: string;
  owner: string;
  name: string;
  snapshot: ProjectSnapshot;
  created: string;
  updated: string;
  expand?: {
    owner?: PbUserRecord;
  };
}

function recordToProject(r: PbProjectRecord): RemoteProjectRow {
  return {
    id: r.id,
    owner_id: r.owner,
    name: r.name,
    snapshot: r.snapshot,
    created_at: r.created,
    updated_at: r.updated,
  };
}

function profileFromUser(u: PbUserRecord | null | undefined): Profile | null {
  if (!u) return null;
  return {
    id: u.id,
    display_name: u.name ?? u.email ?? null,
    role: (u.role as AppRole) ?? 'user',
  };
}

// ---------- auth ----------

export async function getCurrentUserId(): Promise<string | null> {
  if (!pb) return null;
  return pb.authStore.isValid ? pb.authStore.model?.id ?? null : null;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (!pb) return null;
  if (!pb.authStore.isValid || !pb.authStore.model) return null;
  return profileFromUser(pb.authStore.model as PbUserRecord);
}

export interface SignInResult {
  ok: boolean;
  error?: string;
}

export async function signIn(
  email: string,
  password: string,
): Promise<SignInResult> {
  if (!pb) return { ok: false, error: 'Backend not configured.' };
  try {
    await pb.collection('users').authWithPassword(email, password);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export async function signUp(
  email: string,
  password: string,
  displayName?: string,
): Promise<SignInResult> {
  if (!pb) return { ok: false, error: 'Backend not configured.' };
  try {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name: displayName?.trim() || email.split('@')[0],
      role: 'user',
    });
    return await signIn(email, password);
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export async function signOut(): Promise<void> {
  if (!pb) return;
  pb.authStore.clear();
}

export function onAuthChange(cb: () => void): () => void {
  if (!pb) return () => undefined;
  const unsubscribe = pb.authStore.onChange(() => cb(), false);
  return () => unsubscribe();
}

// ---------- project sync ----------

export async function listRemoteProjects(): Promise<RemoteProjectRow[]> {
  if (!pb || !pb.authStore.isValid) return [];
  try {
    const records = await pb
      .collection('projects')
      .getFullList<PbProjectRecord>({ sort: '-updated' });
    return records.map(recordToProject);
  } catch (e) {
    console.warn('listRemoteProjects failed', e);
    return [];
  }
}

export async function saveRemoteProject(
  snapshot: ProjectSnapshot,
): Promise<RemoteProjectRow | null> {
  if (!pb || !pb.authStore.isValid) return null;
  const userId = pb.authStore.model?.id;
  if (!userId) return null;

  const payload = {
    id: snapshot.id,
    owner: userId,
    name: snapshot.name,
    snapshot,
  };

  try {
    // Try update first; if 404 (record doesn't exist yet) fall back to
    // create. Cheaper than the alternative two-call check.
    const updated = await pb
      .collection('projects')
      .update<PbProjectRecord>(snapshot.id, payload);
    return recordToProject(updated);
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) {
      try {
        const created = await pb
          .collection('projects')
          .create<PbProjectRecord>(payload);
        return recordToProject(created);
      } catch (createErr) {
        console.warn('saveRemoteProject create failed', createErr);
        return null;
      }
    }
    console.warn('saveRemoteProject failed', e);
    return null;
  }
}

export async function deleteRemoteProject(id: string): Promise<boolean> {
  if (!pb || !pb.authStore.isValid) return false;
  try {
    await pb.collection('projects').delete(id);
    return true;
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 404) return true;
    console.warn('deleteRemoteProject failed', e);
    return false;
  }
}

export async function listAllProjectsAdmin(): Promise<
  Array<RemoteProjectRow & { owner_display_name: string | null }>
> {
  if (!pb || !pb.authStore.isValid) return [];
  try {
    const records = await pb
      .collection('projects')
      .getFullList<PbProjectRecord>({
        sort: '-updated',
        expand: 'owner',
      });
    return records.map((r) => ({
      ...recordToProject(r),
      owner_display_name:
        r.expand?.owner?.name ?? r.expand?.owner?.email ?? null,
    }));
  } catch (e) {
    console.warn('listAllProjectsAdmin failed', e);
    return [];
  }
}

// ---------- helpers ----------

function friendlyError(e: unknown): string {
  if (e instanceof ClientResponseError) {
    const data = e.response?.data;
    if (data && typeof data === 'object') {
      const messages: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        const vv = v as { message?: string };
        if (vv?.message) messages.push(`${k}: ${vv.message}`);
      }
      if (messages.length) return messages.join('; ');
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Unknown error';
}
