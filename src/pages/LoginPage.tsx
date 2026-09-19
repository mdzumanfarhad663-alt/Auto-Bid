import React, { useState } from 'react';
import { Lock } from 'lucide-react';

interface Props {
  onAuthenticated: () => void;
  passwordConfigured: boolean;
}

export const LoginPage: React.FC<Props> = ({ onAuthenticated, passwordConfigured }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onAuthenticated();
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
          <div className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <Lock className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Freelancer AutoBid</h1>
            <p className="text-xs text-slate-400">Admin sign in</p>
          </div>
        </div>

        {!passwordConfigured && (
          <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2">
            No admin password is configured. Set <code>ADMIN_PASSWORD</code> in the server environment and restart.
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">Password</label>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
          />
        </div>

        {error && <div className="text-xs text-rose-400">{error}</div>}

        <button
          type="submit"
          disabled={busy || !password}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};
