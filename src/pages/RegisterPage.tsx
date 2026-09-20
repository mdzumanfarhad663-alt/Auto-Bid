import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { PublicUser } from '../types.ts';

interface Props {
  onAuthenticated: (user: PublicUser) => void;
  googleEnabled: boolean;
  onSwitchToLogin: () => void;
}

const GoogleIcon: React.FC = () => (
  <svg viewBox="0 0 48 48" className="h-4 w-4">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const RegisterPage: React.FC<Props> = ({ onAuthenticated, googleEnabled, onSwitchToLogin }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onAuthenticated(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Start your free trial</h1>
            <p className="text-xs text-slate-400">3 days, no card required</p>
          </div>
        </div>

        {error && <div className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800 rounded-lg px-3 py-2">{error}</div>}

        {googleEnabled && (
          <>
            <a
              href="/api/auth/google"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-sm font-semibold transition"
            >
              <GoogleIcon /> Continue with Google
            </a>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <div className="flex-1 h-px bg-slate-800" />
              or
              <div className="flex-1 h-px bg-slate-800" />
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">Name</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">Email</label>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          />
          <p className="text-[11px] text-slate-500 mt-1">At least 10 characters.</p>
        </div>

        <button
          type="submit"
          disabled={busy || !email || password.length < 10}
          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-xs text-slate-400 text-center">
          Already have an account?{' '}
          <button type="button" onClick={onSwitchToLogin} className="text-blue-400 hover:text-blue-300 font-semibold">
            Sign in
          </button>
        </p>
      </form>
    </div>
  );
};
