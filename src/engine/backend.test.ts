// Without VITE_PB_URL in the test environment, BACKEND_ENABLED is false and
// every helper should return a safe null/[]/false without throwing or making
// network calls. Locks the offline / no-config path so we never accidentally
// blow up in pure-localStorage mode.

import { describe, expect, it } from 'vitest';
import {
  BACKEND_ENABLED,
  pb,
  getCurrentUserId,
  getCurrentProfile,
  signIn,
  signUp,
  signOut,
  onAuthChange,
  listRemoteProjects,
  saveRemoteProject,
  deleteRemoteProject,
  listAllProjectsAdmin,
} from './backend';
import { emptySnapshot } from './projects';

describe('backend adapter without VITE_PB_URL', () => {
  it('reports itself as disabled', () => {
    expect(BACKEND_ENABLED).toBe(false);
    expect(pb).toBeNull();
  });

  it('getCurrentUserId resolves to null', async () => {
    expect(await getCurrentUserId()).toBeNull();
  });

  it('getCurrentProfile resolves to null', async () => {
    expect(await getCurrentProfile()).toBeNull();
  });

  it('signIn resolves to a configured-error result', async () => {
    const r = await signIn('me@example.com', 'pw');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not configured/i);
  });

  it('signUp resolves to a configured-error result', async () => {
    const r = await signUp('me@example.com', 'password');
    expect(r.ok).toBe(false);
  });

  it('signOut does not throw', async () => {
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('onAuthChange returns a no-op unsubscriber', () => {
    const fn = onAuthChange(() => undefined);
    expect(typeof fn).toBe('function');
    expect(fn()).toBeUndefined();
  });

  it('listRemoteProjects resolves to []', async () => {
    expect(await listRemoteProjects()).toEqual([]);
  });

  it('saveRemoteProject resolves to null', async () => {
    expect(await saveRemoteProject(emptySnapshot('t'))).toBeNull();
  });

  it('deleteRemoteProject resolves to false', async () => {
    expect(await deleteRemoteProject('id')).toBe(false);
  });

  it('listAllProjectsAdmin resolves to []', async () => {
    expect(await listAllProjectsAdmin()).toEqual([]);
  });
});
