import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, AlertTriangle, Users as UsersIcon, LogOut, Trash2, Ban, PlayCircle, CalendarPlus, ShieldOff } from 'lucide-react';
import { PublicUser } from '../types.ts';

interface AdminStatus {
  openaiKey: { configured: boolean; masked: string; source: string | null };
  users: { total: number; active: number; admins: number };
  googleEnabled: boolean;
  sessionSecretFromEnv: boolean;
  passwordFromEnv: boolean;
}

interface Props {
  currentUserId: string;
}

const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-4">
    <h2 className="text-base font-bold text-white flex items-center gap-2">{icon}{title}</h2>
    {children}
  </div>
);

const input = 'w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500';
const btn = 'px-3 py-1.5 rounded-lg text-[11px] font-semibold transition disabled:opacity-50 whitespace-nowrap';

const fmtDate = (t: number) => new Date(t).toLocaleDateString();

export const AdminPage: React.FC<Props> = ({ currentUserId }) => {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [allUsers, setAllUsers] = useState<PublicUser[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState('');
  const [extendDays, setExtendDays] = useState<Record<string, string>>({});

  const refresh = () => {
    fetch('/api/admin/status').then((r) => (r.ok ? r.json() : null)).then(setStatus).catch(() => {});
    fetch('/api/admin/users').then((r) => (r.ok ? r.json() : [])).then(setAllUsers).catch(() => {});
  };

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

  const deleteUser = (u: PublicUser) => {
    if (!window.confirm(`Delete ${u.email}? This permanently removes their account, projects and bid history.`)) return;
    call(`del-${u.id}`, `/api/admin/users/${u.id}`, { method: 'DELETE' }, () => setMsg({ kind: 'ok', text: `${u.email} deleted.` }));
  };

  return (
    <div id="admin-page" className="space-y-6">
      <div className="pb-2 border-b border-slate-200 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin</h1>
          <p className="text-xs text-slate-500 mt-0.5">Users, trials, and the shared OpenAI key. Nothing here is ever sent to non-admin pages in full.</p>
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
            {!status.passwordFromEnv && <div><code>ADMIN_PASSWORD</code> is not set in the environment — it only bootstraps the first admin account on a fresh database.</div>}
            {!status.sessionSecretFromEnv && <div><code>SESSION_SECRET</code> is not set. Sessions and the encrypted key are lost on redeploy.</div>}
          </div>
        </div>
      )}

      <Card icon={<KeyRound className="h-5 w-5 text-amber-400" />} title="OpenAI API key (shared by every user)">
        <div className="text-xs text-slate-400">
          {status?.openaiKey.configured ? (
            <>Configured: <code className="text-slate-200">{status.openaiKey.masked}</code> <span className="text-slate-500">({status.openaiKey.source})</span></>
          ) : (
            <span className="text-rose-300">No key configured. No user can generate proposals or pass the relevance gate.</span>
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
      </Card>

      <Card icon={<UsersIcon className="h-5 w-5 text-sky-400" />} title={`Users (${status?.users.total ?? allUsers.length})`}>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[820px]">
            <thead className="text-slate-400 text-left">
              <tr>
                <th className="px-2 py-2 font-medium">User</th>
                <th className="px-2 py-2 font-medium">Role</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Trial</th>
                <th className="px-2 py-2 font-medium">Ext. token</th>
                <th className="px-2 py-2 font-medium">Joined</th>
                <th className="px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="px-2 py-2">
                    <div className="text-slate-200 font-medium">{u.name || '—'}</div>
                    <div className="text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-2 py-2 text-slate-300">{u.role}</td>
                  <td className="px-2 py-2">
                    <span className={u.status === 'suspended' ? 'text-rose-400' : 'text-emerald-400'}>{u.status}</span>
                  </td>
                  <td className="px-2 py-2">
                    {u.trialExpired ? <span className="text-rose-400">ended</span> : <span className="text-slate-300">{u.trialDaysLeft}d left</span>}
                  </td>
                  <td className="px-2 py-2 text-slate-400">{u.extensionToken.configured ? 'set' : '—'}</td>
                  <td className="px-2 py-2 text-slate-500">{fmtDate(u.createdAt)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {u.status === 'active' ? (
                        <button
                          disabled={u.id === currentUserId || busy === `sus-${u.id}`}
                          onClick={() => call(`sus-${u.id}`, `/api/admin/users/${u.id}/suspend`, { method: 'POST' }, () => {})}
                          className={`${btn} bg-rose-950 hover:bg-rose-900 text-rose-300 flex items-center gap-1`}
                        >
                          <Ban className="h-3 w-3" /> Suspend
                        </button>
                      ) : (
                        <button
                          disabled={busy === `act-${u.id}`}
                          onClick={() => call(`act-${u.id}`, `/api/admin/users/${u.id}/activate`, { method: 'POST' }, () => {})}
                          className={`${btn} bg-emerald-950 hover:bg-emerald-900 text-emerald-300 flex items-center gap-1`}
                        >
                          <PlayCircle className="h-3 w-3" /> Activate
                        </button>
                      )}
                      <input
                        type="number"
                        min={1}
                        placeholder="days"
                        value={extendDays[u.id] || ''}
                        onChange={(e) => setExtendDays({ ...extendDays, [u.id]: e.target.value })}
                        className="w-14 bg-slate-950 border border-slate-700 rounded-lg px-1.5 py-1 text-[11px] text-slate-200"
                      />
                      <button
                        disabled={!extendDays[u.id] || busy === `ext-${u.id}`}
                        onClick={() => call(`ext-${u.id}`, `/api/admin/users/${u.id}/extend-trial`, { method: 'POST', body: JSON.stringify({ days: Number(extendDays[u.id]) }) }, () => setExtendDays({ ...extendDays, [u.id]: '' }))}
                        className={`${btn} bg-sky-950 hover:bg-sky-900 text-sky-300 flex items-center gap-1`}
                      >
                        <CalendarPlus className="h-3 w-3" /> Extend
                      </button>
                      {!u.trialExpired && (
                        <button
                          disabled={busy === `endt-${u.id}`}
                          onClick={() => call(`endt-${u.id}`, `/api/admin/users/${u.id}/end-trial`, { method: 'POST' }, () => {})}
                          className={`${btn} bg-slate-800 hover:bg-amber-950 text-amber-300 flex items-center gap-1`}
                        >
                          <ShieldOff className="h-3 w-3" /> End trial
                        </button>
                      )}
                      <button
                        disabled={u.id === currentUserId || busy === `del-${u.id}`}
                        onClick={() => deleteUser(u)}
                        className={`${btn} bg-slate-800 hover:bg-rose-950 text-rose-400 flex items-center gap-1`}
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />} title="Google sign-in">
        <p className="text-xs text-slate-400">
          {status?.googleEnabled ? (
            <span className="text-emerald-300">Enabled — users can register and sign in with Google.</span>
          ) : (
            <>Not configured. Set <code className="text-slate-200">GOOGLE_CLIENT_ID</code> and <code className="text-slate-200">GOOGLE_CLIENT_SECRET</code> in the server environment to enable it.</>
          )}
        </p>
      </Card>
    </div>
  );
};
