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
  is_public: boolean;
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
  is_public?: boolean;
  created: string;
  updated: string;
  expand?: {
    owner?: PbUserRecord;
  };
}

function recordToProject(r: PbProjectRecord): RemoteProjectRow {
  // Force the snapshot id to match the PB record id. The snapshot stored
  // inside a PB row was written with whatever local id the client minted
  // (often a UUID), but only `r.id` is what PB matches on for future
  // updates. Aligning them here keeps a freshly-pulled project from
  // re-creating itself on the next push.
  const snapshot: ProjectSnapshot = { ...r.snapshot, id: r.id };
  return {
    id: r.id,
    owner_id: r.owner,
    name: r.name,
    snapshot,
    is_public: Boolean(r.is_public),
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

// PocketBase rejects every custom record id (its default schema validates id
// length / charset and treats the id field as system-generated). So our flow:
//   - If the snapshot's id looks like a PB-generated id (15 chars, lowercase
//     alphanumeric), try UPDATE; otherwise we know it's a stale UUID.
//   - On 404 (record not yet on the server) OR a non-PB-shaped id, CREATE
//     without supplying an id and return the row. The caller then migrates
//     the local copy to use PB's generated id so we never push the same
//     project twice.
const PB_ID_RE = /^[a-z0-9]{15}$/;

export async function saveRemoteProject(
  snapshot: ProjectSnapshot,
): Promise<RemoteProjectRow | null> {
  if (!pb || !pb.authStore.isValid) return null;
  const userId = pb.authStore.model?.id;
  if (!userId) return null;

  const body = {
    owner: userId,
    name: snapshot.name,
    snapshot,
  };

  // 1) If the id has PB shape, attempt an update first.
  if (PB_ID_RE.test(snapshot.id)) {
    try {
      const updated = await pb
        .collection('projects')
        .update<PbProjectRecord>(snapshot.id, body);
      return recordToProject(updated);
    } catch (e) {
      if (!(e instanceof ClientResponseError) || e.status !== 404) {
        console.warn('saveRemoteProject update failed', e);
        return null;
      }
      // 404 → fall through to create.
    }
  }

  // 2) Create with PB-generated id.
  try {
    const created = await pb
      .collection('projects')
      .create<PbProjectRecord>(body);
    return recordToProject(created);
  } catch (e) {
    console.warn('saveRemoteProject create failed', e);
    return null;
  }
}

// Walk the current user's PB projects, group by name, delete every
// duplicate except the most-recently-updated entry per name. Returns the
// number of records deleted from PocketBase. Used by the reconcile flow
// to clean up the historical mess from when every save created a fresh
// row (each call to saveRemoteProject before the pushAndMigrate fix did
// that under the hood — explained in the App.tsx comment).
export async function dedupeRemoteByName(): Promise<number> {
  if (!pb || !pb.authStore.isValid) return 0;
  const userId = pb.authStore.model?.id;
  if (!userId) return 0;
  try {
    const records = await pb
      .collection('projects')
      .getFullList<PbProjectRecord>({
        sort: '-updated',
        filter: `owner = "${userId}"`,
      });
    const seen = new globalThis.Set<string>();
    const toDelete: string[] = [];
    for (const r of records) {
      if (seen.has(r.name)) toDelete.push(r.id);
      else seen.add(r.name);
    }
    for (const id of toDelete) {
      try {
        await pb.collection('projects').delete(id);
      } catch (e) {
        console.warn('dedupeRemoteByName: delete failed', id, e);
      }
    }
    return toDelete.length;
  } catch (e) {
    console.warn('dedupeRemoteByName failed', e);
    return 0;
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

export async function setProjectPublic(
  id: string,
  isPublic: boolean,
): Promise<boolean> {
  if (!pb || !pb.authStore.isValid) return false;
  try {
    await pb.collection('projects').update(id, { is_public: isPublic });
    return true;
  } catch (e) {
    console.warn('setProjectPublic failed', e);
    return false;
  }
}

// Public library — any signed-in user can read every project where
// is_public = true. Returns rows including the owner display name so the
// library UI can show who shared each project.
export async function listPublicProjects(): Promise<
  Array<RemoteProjectRow & { owner_display_name: string | null }>
> {
  if (!pb || !pb.authStore.isValid) return [];
  try {
    const records = await pb
      .collection('projects')
      .getFullList<PbProjectRecord>({
        sort: '-updated',
        expand: 'owner',
        filter: 'is_public = true',
      });
    return records.map((r) => ({
      ...recordToProject(r),
      owner_display_name:
        r.expand?.owner?.name ?? r.expand?.owner?.email ?? null,
    }));
  } catch (e) {
    console.warn('listPublicProjects failed', e);
    return [];
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

// Friendly alias to match the file's pattern.
type RemoteProjectWithOwner = RemoteProjectRow & {
  owner_display_name: string | null;
};
export type { RemoteProjectWithOwner };

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
