// These tests assert the Supabase adapter's no-config fallback. In the test
// environment VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY aren't set, so the
// module should report itself as disabled and every helper should return a
// safe no-op value (null / [] / false) without throwing.

import { describe, expect, it } from 'vitest';
import {
  SUPABASE_ENABLED,
  supabase,
  getCurrentUserId,
  getCurrentProfile,
  signInWithMagicLink,
  signOut,
  listRemoteProjects,
  saveRemoteProject,
  deleteRemoteProject,
  listAllProjectsAdmin,
} from './supabase';
import { emptySnapshot } from './projects';

describe('supabase adapter without env config', () => {
  it('reports itself as disabled', () => {
    expect(SUPABASE_ENABLED).toBe(false);
    expect(supabase).toBeNull();
  });

  it('getCurrentUserId resolves to null', async () => {
    expect(await getCurrentUserId()).toBeNull();
  });

  it('getCurrentProfile resolves to null', async () => {
    expect(await getCurrentProfile()).toBeNull();
  });

  it('signInWithMagicLink resolves to a configured-error result', async () => {
    const res = await signInWithMagicLink('me@example.com');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not configured/i);
  });

  it('signOut is a no-op (does not throw)', async () => {
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('listRemoteProjects resolves to []', async () => {
    expect(await listRemoteProjects()).toEqual([]);
  });

  it('saveRemoteProject resolves to null', async () => {
    const snap = emptySnapshot('test');
    expect(await saveRemoteProject(snap)).toBeNull();
  });

  it('deleteRemoteProject resolves to false', async () => {
    expect(await deleteRemoteProject('id')).toBe(false);
  });

  it('listAllProjectsAdmin resolves to []', async () => {
    expect(await listAllProjectsAdmin()).toEqual([]);
  });
});
