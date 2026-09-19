import React, { useEffect, useState } from 'react';
import { KeyRound, Puzzle, ShieldCheck, AlertTriangle, Copy, Check, Trash2, LogOut } from 'lucide-react';

interface AdminStatus {
  openaiKey: { configured: boolean; masked: string; source: string | null };
  extensionToken: { configured: boolean; createdAt: number | null; lastUsedAt: number | null };
  sessionSecretFromEnv: boolean;
  passwordFromEnv: boolean;
}

const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
    <h2 className="text-base font-bold text-white flex items-center gap-2">{icon}{title}</h2>
    {children}
  </div>
);

const input = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500';
const btn = 'px-4 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-50';

const ago = (t: number | null) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

export const AdminPage: React.FC = () => {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [newToken, setNewToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = () =>
    fetch('/api/admin/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => {});

  useEffect(() => {
    refresh();
  }, []);

  const call = async (label: string, path: string, init: RequestInit, onOk: (d: any) => void) => {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onOk(data);
      refresh();
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  };

  return (
    <div id="admin-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin</h1>
          <p className="text-xs text-slate-500 mt-0.5">Credentials and access. Nothing here is ever sent to the dashboard pages in full.</p>
        </div>
        <button
          onClick={() => fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload())}
          className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      {msg && (
        <div className={`text-xs rounded-xl px-4 py-3 border ${msg.kind === 'ok' ? 'bg-emerald-950/40 border-emerald-700 text-emerald-300' : 'bg-rose-950/30 border-rose-800 text-rose-300'}`}>
          {msg.text}
        </div>
      )}

      {status && (!status.sessionSecretFromEnv || !status.passwordFromEnv) && (
        <div className="text-xs rounded-xl px-4 py-3 border bg-amber-950/40 border-amber-800 text-amber-200 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            {!status.passwordFromEnv && <div><code>ADMIN_PASSWORD</code> is not set in the environment. The password on disk is lost on redeploy.</div>}
            {!status.sessionSecretFromEnv && <div><code>SESSION_SECRET</code> is not set in the environment. Sessions and the encrypted key are lost on redeploy.</div>}
            <div className="mt-1 text-amber-300/80">Set both in Render → Environment. SESSION_SECRET: any random string of 32+ characters.</div>
          </div>
        </div>
      )}

      <Card icon={<KeyRound className="h-5 w-5 text-amber-400" />} title="OpenAI API key">
        <div className="text-xs text-slate-400">
          {status?.openaiKey.configured ? (
            <>Configured: <code className="text-slate-200">{status.openaiKey.masked}</code> <span className="text-slate-500">({status.openaiKey.source})</span></>
          ) : (
            <span className="text-rose-300">No key configured. Proposals and the relevance gate will fail.</span>
          )}
        </div>
        <div className="flex gap-2">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…  (validated against OpenAI before saving)" className={input} autoComplete="off" />
          <button
            disabled={!apiKey || busy === 'key'}
            onClick={() => call('key', '/api/admin/openai-key', { method: 'POST', body: JSON.stringify({ apiKey }) }, () => { setApiKey(''); setMsg({ kind: 'ok', text: 'Key verified and stored encrypted.' }); })}
            className={`${btn} bg-amber-600 hover:bg-amber-500 text-white`}
          >
            {busy === 'key' ? 'Checking…' : 'Save'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500">Stored AES-256-GCM encrypted. The extension fetches it with its token so it can call OpenAI directly.</p>
      </Card>

      <Card icon={<Puzzle className="h-5 w-5 text-sky-400" />} title="Extension token">
        <div className="text-xs text-slate-400">
          {status?.extensionToken.configured ? (
            <>Active · created {ago(status.extensionToken.createdAt)} · last used <span className="text-slate-200">{ago(status.extensionToken.lastUsedAt)}</span></>
          ) : (
            <span className="text-rose-300">No token. The extension cannot reach this dashboard until one is generated and pasted into the popup.</span>
          )}
        </div>

        {newToken && (
          <div className="bg-slate-950 border border-sky-800 rounded-xl p-3 space-y-2">
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
            onClick={() => call('token', '/api/admin/extension-token', { method: 'POST' }, (d) => { setNewToken(d.token); setMsg(null); })}
            className={`${btn} bg-sky-700 hover:bg-sky-600 text-white`}
          >
            {status?.extensionToken.configured ? 'Regenerate token' : 'Generate token'}
          </button>
          {status?.extensionToken.configured && (
            <button
              disabled={busy === 'revoke'}
              onClick={() => call('revoke', '/api/admin/extension-token', { method: 'DELETE' }, () => { setNewToken(''); setMsg({ kind: 'ok', text: 'Token revoked. The extension is now locked out.' }); })}
              className={`${btn} bg-slate-800 hover:bg-rose-900 text-rose-300 flex items-center gap-1`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Revoke
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-500">Regenerating invalidates the old token immediately. "Last used" should tick every poll while the extension runs.</p>
      </Card>

      <Card icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />} title="Change password">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className={input} autoComplete="current-password" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (10+ characters)" className={input} autoComplete="new-password" />
        </div>
        <button
          disabled={!currentPassword || newPassword.length < 10 || busy === 'pw'}
          onClick={() => call('pw', '/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, (d) => { setCurrentPassword(''); setNewPassword(''); setMsg({ kind: 'ok', text: d.note || 'Password changed.' }); })}
          className={`${btn} bg-emerald-700 hover:bg-emerald-600 text-white`}
        >
          Change password
        </button>
      </Card>
    </div>
  );
};
