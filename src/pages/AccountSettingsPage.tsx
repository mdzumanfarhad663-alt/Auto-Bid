import React, { useState } from 'react';
import { User, KeyRound, Puzzle, Copy, Check, Trash2 } from 'lucide-react';
import { PublicUser } from '../types.ts';

interface Props {
  user: PublicUser;
  onUserUpdated: (user: PublicUser) => void;
}

const input = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500';
const btn = 'px-4 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50';

const ago = (t: number | null) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export const AccountSettingsPage: React.FC<Props> = ({ user, onUserUpdated }) => {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newToken, setNewToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [localUser, setLocalUser] = useState(user);

  const call = async (label: string, path: string, init: RequestInit, onOk: (d: any) => void) => {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onOk(data);
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  };

  return (
    <div id="account-settings-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Account Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Your profile, password, and your own extension token.</p>
      </div>

      {msg && (
        <div className={`text-xs rounded-xl px-4 py-3 border ${msg.kind === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-rose-50 border-rose-300 text-rose-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <User className="h-5 w-5 text-blue-500" /> Profile
        </h2>
        <div className="text-xs text-slate-500">
          {localUser.hasGoogle && <span className="mr-3">Google-linked</span>}
          Trial: {localUser.trialExpired ? <span className="text-rose-600 font-semibold">ended</span> : <span className="text-emerald-600 font-semibold">{localUser.trialDaysLeft} day(s) left</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={input.replace('bg-slate-950 text-slate-200 border-slate-700', 'bg-white text-slate-800 border-slate-300')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={input.replace('bg-slate-950 text-slate-200 border-slate-700', 'bg-white text-slate-800 border-slate-300')} />
          </div>
        </div>
        <button
          disabled={busy === 'profile'}
          onClick={() => call('profile', '/api/account', { method: 'PATCH', body: JSON.stringify({ name, email }) }, (d) => { setLocalUser(d.user); onUserUpdated(d.user); setMsg({ kind: 'ok', text: 'Profile updated.' }); })}
          className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}
        >
          Save profile
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-emerald-500" /> {localUser.hasPassword ? 'Change password' : 'Set a password'}
        </h2>
        {!localUser.hasPassword && <p className="text-xs text-slate-500">Your account currently signs in with Google only. Set a password to also sign in with email.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {localUser.hasPassword && (
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className={input.replace('bg-slate-950 text-slate-200 border-slate-700 placeholder-slate-600', 'bg-white text-slate-800 border-slate-300 placeholder-slate-400')} />
          )}
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (10+ characters)" className={input.replace('bg-slate-950 text-slate-200 border-slate-700 placeholder-slate-600', 'bg-white text-slate-800 border-slate-300 placeholder-slate-400')} />
        </div>
        <button
          disabled={newPassword.length < 10 || (localUser.hasPassword && !currentPassword) || busy === 'pw'}
          onClick={() => call('pw', '/api/account/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, () => { setCurrentPassword(''); setNewPassword(''); setLocalUser({ ...localUser, hasPassword: true }); setMsg({ kind: 'ok', text: 'Password updated.' }); })}
          className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}
        >
          {localUser.hasPassword ? 'Change password' : 'Set password'}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Puzzle className="h-5 w-5 text-sky-500" /> Extension token
        </h2>
        <div className="text-xs text-slate-500">
          {localUser.extensionToken.configured ? (
            <>Active · created {ago(localUser.extensionToken.createdAt)} · last used <span className="text-slate-700 font-medium">{ago(localUser.extensionToken.lastUsedAt)}</span></>
          ) : (
            <span className="text-rose-600">No token yet. Generate one and paste it into the extension popup to connect it to your account.</span>
          )}
        </div>

        {newToken && (
          <div className="bg-slate-950 border border-sky-700 rounded-xl p-3 space-y-2">
            <div className="text-[11px] text-sky-300 font-semibold">Shown once. Paste into the extension popup → Extension token.</div>
            <div className="flex gap-2 items-center">
              <code className="flex-1 text-xs text-slate-100 break-all">{newToken}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(newToken).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                className={`${btn} bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-1`}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            disabled={busy === 'token'}
            onClick={() => call('token', '/api/account/extension-token', { method: 'POST' }, (d) => { setNewToken(d.token); setLocalUser({ ...localUser, extensionToken: { configured: true, createdAt: Date.now(), lastUsedAt: null } }); })}
            className={`${btn} bg-sky-600 hover:bg-sky-500 text-white`}
          >
            {localUser.extensionToken.configured ? 'Regenerate token' : 'Generate token'}
          </button>
          {localUser.extensionToken.configured && (
            <button
              disabled={busy === 'revoke'}
              onClick={() => call('revoke', '/api/account/extension-token', { method: 'DELETE' }, () => { setNewToken(''); setLocalUser({ ...localUser, extensionToken: { configured: false, createdAt: null, lastUsedAt: null } }); setMsg({ kind: 'ok', text: 'Token revoked.' }); })}
              className={`${btn} bg-slate-100 hover:bg-rose-100 text-rose-600 flex items-center gap-1`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Revoke
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
