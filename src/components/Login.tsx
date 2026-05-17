import { useState } from 'react';
import { signIn, signUp } from '../engine/backend';

type Mode = 'sign-in' | 'sign-up';

export function Login() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim();
    const pw = password;
    if (!em || !pw) return;
    setSubmitting(true);
    setError(null);
    const res =
      mode === 'sign-in'
        ? await signIn(em, pw)
        : await signUp(em, pw, displayName);
    setSubmitting(false);
    if (!res.ok) setError(res.error ?? 'Could not sign you in.');
    // On success, onAuthChange fires elsewhere and the parent re-renders.
  }

  return (
    <div className="login">
      <header className="login-header">
        <div className="brand home-nav-brand">
          STACKED<span className="brand-dot">.</span>
        </div>
      </header>
      <main className="login-main">
        <div className="login-card">
          <div className="mono login-eyebrow">
            // {mode === 'sign-in' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </div>
          <h1 className="login-title">
            {mode === 'sign-in' ? 'Welcome back.' : 'Welcome aboard.'}
          </h1>
          <p className="login-sub">
            {mode === 'sign-in'
              ? 'Sign in with your email and password. Use the same account on any device with this Stacked instance.'
              : 'Create an account on this Stacked instance. Email and password only — no verification flow.'}
          </p>

          <form className="login-form" onSubmit={onSubmit}>
            {mode === 'sign-up' && (
              <label className="login-field">
                <span className="mono login-field-label">DISPLAY NAME</span>
                <input
                  type="text"
                  className="login-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="how should we show your name?"
                  autoComplete="nickname"
                  disabled={submitting}
                />
              </label>
            )}
            <label className="login-field">
              <span className="mono login-field-label">EMAIL</span>
              <input
                type="email"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                autoFocus
                disabled={submitting}
              />
            </label>
            <label className="login-field">
              <span className="mono login-field-label">PASSWORD</span>
              <input
                type="password"
                className="login-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'sign-up' ? 'at least 8 characters' : '•••••••'}
                autoComplete={
                  mode === 'sign-in' ? 'current-password' : 'new-password'
                }
                minLength={mode === 'sign-up' ? 8 : 1}
                required
                disabled={submitting}
              />
            </label>

            {error && <div className="error mono login-error">{error}</div>}

            <button
              className="btn btn-primary login-submit"
              type="submit"
              disabled={submitting || !email.trim() || !password}
            >
              {submitting
                ? mode === 'sign-in'
                  ? 'SIGNING IN…'
                  : 'CREATING ACCOUNT…'
                : mode === 'sign-in'
                  ? 'SIGN IN'
                  : 'CREATE ACCOUNT'}
            </button>
          </form>

          <div className="login-switch">
            {mode === 'sign-in' ? (
              <>
                <span>No account yet?</span>{' '}
                <button
                  className="login-switch-btn"
                  onClick={() => {
                    setMode('sign-up');
                    setError(null);
                  }}
                  type="button"
                >
                  Create one →
                </button>
              </>
            ) : (
              <>
                <span>Already have one?</span>{' '}
                <button
                  className="login-switch-btn"
                  onClick={() => {
                    setMode('sign-in');
                    setError(null);
                  }}
                  type="button"
                >
                  Sign in →
                </button>
              </>
            )}
          </div>
        </div>
      </main>
      <footer className="login-foot mono">
        runs on PocketBase · GPX in, GPX out · projects sync across your
        devices when you sign in
      </footer>
    </div>
  );
}
