import { useState } from 'react';
import { signInWithMagicLink } from '../engine/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const res = await signInWithMagicLink(trimmed);
    setSubmitting(false);
    if (res.ok) {
      setSentTo(trimmed);
    } else {
      setError(res.error ?? 'Could not send the link.');
    }
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
          <div className="mono login-eyebrow">// SIGN IN</div>
          <h1 className="login-title">Welcome back.</h1>
          <p className="login-sub">
            Sign in with a one-time magic link. We'll email it to you — no
            password to remember.
          </p>

          {sentTo ? (
            <div className="login-sent">
              <div className="mono login-sent-label">CHECK YOUR INBOX</div>
              <p className="login-sent-body">
                We've sent a link to <strong>{sentTo}</strong>. Click it from
                the same browser to finish signing in.
              </p>
              <button
                className="btn login-back"
                onClick={() => {
                  setSentTo(null);
                  setEmail('');
                }}
              >
                use a different email
              </button>
            </div>
          ) : (
            <form className="login-form" onSubmit={onSubmit}>
              <label className="login-field">
                <span className="mono login-field-label">EMAIL</span>
                <input
                  type="email"
                  className="login-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  disabled={submitting}
                />
              </label>
              {error && <div className="error mono login-error">{error}</div>}
              <button
                className="btn btn-primary login-submit"
                type="submit"
                disabled={submitting || !email.trim()}
              >
                {submitting ? 'SENDING…' : 'SEND MAGIC LINK'}
              </button>
            </form>
          )}
        </div>
      </main>
      <footer className="login-foot mono">
        100% browser · GPX in, GPX out · multi-device when you sign in
      </footer>
    </div>
  );
}
