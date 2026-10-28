'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { signIn } from '@/lib/sync';

// The only screen until you sign in. One account, made in the Supabase dashboard.
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await signIn(email.trim(), password); }
    catch (err) { setError(navigator.onLine ? (err as Error).message : "You're offline. Connect and try again."); }
    setBusy(false);
  }

  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <img src="/icon.svg" alt="" width={56} height={56} />
        <h1>MyUPI</h1>
        <p className="sub">Sign in to see your payments and splits.</p>

        <label className="fld">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="fld">
          <span>Password</span>
          <span className="pw">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button type="button" className="icon-btn plain" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>

        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn lime" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="hint center">You stay signed in on this device until you sign out.</p>
      </form>
      <style jsx>{`
        .login { min-height: 100dvh; display: grid; place-items: center; padding: 24px 16px; }
        form { width: 100%; max-width: 400px; display: grid; gap: 14px; padding: 32px 28px; border-radius: 28px; }
        img { border-radius: 14px; }
        h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; margin-top: 4px; }
        .sub { margin-top: -10px; margin-bottom: 6px; }
        .fld { display: grid; gap: 6px; font-size: 14px; font-weight: 500; color: var(--sub); }
        .fld input { min-height: 50px; padding: 0 16px; border-radius: 14px; background: var(--bg); color: var(--ink); font-size: 16px; width: 100%;
          box-shadow: inset 0 0 0 .5px var(--line); }
        .fld input:focus { outline: none; box-shadow: inset 0 0 0 1.5px var(--lime); }
        .pw { position: relative; display: block; }
        .pw input { padding-right: 52px; }
        .pw button { position: absolute; right: 4px; top: 50%; translate: 0 -50%; }
        .err { padding: 0; margin: -4px 0 0; }
      `}</style>
    </main>
  );
}
