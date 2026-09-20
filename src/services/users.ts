/**
 * User accounts: registration, login, Google linking, trial, roles, per-user extension tokens.
 */

import crypto from 'crypto';
import { getDb } from './db.ts';
import { hashPassword, verifyPassword, sha256, newExtensionToken, timingSafeEqualHex } from './auth.ts';

export const TRIAL_DAYS = 3;

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  avatar_url: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  trial_started_at: number;
  trial_extended_until: number | null;
  extension_token_hash: string | null;
  extension_token_created_at: number | null;
  extension_token_last_used_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TrialInfo {
  trialEndsAt: number;
  trialDaysLeft: number;
  trialExpired: boolean;
}

/** Shape safe to send to the browser. Never includes hashes. */
export interface PublicUser extends TrialInfo {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: number;
  extensionToken: { configured: boolean; createdAt: number | null; lastUsedAt: number | null };
}

const normEmail = (e: string) => String(e || '').trim().toLowerCase();

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}

export function trialInfo(u: UserRow, now = Date.now()): TrialInfo {
  // An explicit admin override (extend or end early) replaces the default end date in
  // either direction; only the default 3-day window uses trial_started_at on its own.
  const base = u.trial_started_at + TRIAL_DAYS * 86400_000;
  const trialEndsAt = u.trial_extended_until != null ? u.trial_extended_until : base;
  const msLeft = trialEndsAt - now;
  return {
    trialEndsAt,
    trialDaysLeft: Math.max(0, Math.ceil(msLeft / 86400_000)),
    trialExpired: msLeft <= 0,
  };
}

export function toPublic(u: UserRow): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatar_url,
    role: u.role,
    status: u.status,
    hasPassword: !!u.password_hash,
    hasGoogle: !!u.google_id,
    createdAt: u.created_at,
    extensionToken: {
      configured: !!u.extension_token_hash,
      createdAt: u.extension_token_created_at,
      lastUsedAt: u.extension_token_last_used_at,
    },
    ...trialInfo(u),
  };
}

/** Bidding is allowed only for active accounts inside their trial (or extension). */
export function canUserBid(u: UserRow): { allowed: boolean; reason?: 'suspended' | 'trial_expired' } {
  if (u.status === 'suspended') return { allowed: false, reason: 'suspended' };
  if (trialInfo(u).trialExpired) return { allowed: false, reason: 'trial_expired' };
  return { allowed: true };
}

// ---------------------------------------------------------------- lookups

export function findById(id: string): UserRow | null {
  return (getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined) || null;
}

export function findByEmail(email: string): UserRow | null {
  return (getDb().prepare('SELECT * FROM users WHERE email = ?').get(normEmail(email)) as unknown as UserRow | undefined) || null;
}

export function findByGoogleId(googleId: string): UserRow | null {
  return (getDb().prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as unknown as UserRow | undefined) || null;
}

export function listUsers(): UserRow[] {
  return getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all() as unknown as UserRow[];
}

export function countAdmins(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number };
  return row.n;
}

/** Ids of accounts the background poller should run for. */
export function listBiddableUserIds(): string[] {
  const now = Date.now();
  return (getDb().prepare("SELECT * FROM users WHERE status = 'active'").all() as unknown as UserRow[])
    .filter((u) => !trialInfo(u, now).trialExpired)
    .map((u) => u.id);
}

// ---------------------------------------------------------------- create / update

export function createUser(input: {
  email: string;
  password?: string | null;
  name?: string | null;
  role?: UserRole;
  googleId?: string | null;
  avatarUrl?: string | null;
}): UserRow {
  const email = normEmail(input.email);
  if (!isValidEmail(email)) throw new Error('Enter a valid email address');
  if (findByEmail(email)) throw new Error('An account with that email already exists');
  if (input.password !== undefined && input.password !== null && input.password.length < 10) {
    throw new Error('Password must be at least 10 characters');
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, google_id, avatar_url, name, role, status, trial_started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    )
    .run(
      id,
      email,
      input.password ? hashPassword(input.password) : null,
      input.googleId || null,
      input.avatarUrl || null,
      (input.name || '').trim() || null,
      input.role || 'user',
      now,
      now,
      now
    );
  return findById(id)!;
}

export function verifyLogin(email: string, password: string): { user?: UserRow; error?: string } {
  const u = findByEmail(email);
  if (!u) return { error: 'Incorrect email or password' };
  if (!u.password_hash) return { error: 'This account signs in with Google. Use "Continue with Google".' };
  if (typeof password !== 'string' || !verifyPassword(password, u.password_hash)) {
    return { error: 'Incorrect email or password' };
  }
  if (u.status === 'suspended') return { error: 'This account has been suspended. Contact the administrator.' };
  return { user: u };
}

function touch(id: string) {
  getDb().prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function updateProfile(id: string, patch: { name?: string; email?: string }): UserRow {
  const u = findById(id);
  if (!u) throw new Error('User not found');
  if (patch.email !== undefined) {
    const email = normEmail(patch.email);
    if (!isValidEmail(email)) throw new Error('Enter a valid email address');
    const other = findByEmail(email);
    if (other && other.id !== id) throw new Error('That email is already in use');
    getDb().prepare('UPDATE users SET email = ? WHERE id = ?').run(email, id);
  }
  if (patch.name !== undefined) {
    getDb().prepare('UPDATE users SET name = ? WHERE id = ?').run(String(patch.name).trim() || null, id);
  }
  touch(id);
  return findById(id)!;
}

/** Change (or, for Google-only accounts, set) the password. */
export function changePassword(id: string, currentPassword: string | undefined, newPassword: string): void {
  const u = findById(id);
  if (!u) throw new Error('User not found');
  if (typeof newPassword !== 'string' || newPassword.length < 10) throw new Error('New password must be at least 10 characters');
  if (u.password_hash) {
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, u.password_hash)) {
      throw new Error('Current password is incorrect');
    }
  }
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), id);
  touch(id);
}

export function linkGoogle(id: string, googleId: string, avatarUrl?: string | null, name?: string | null): UserRow {
  const u = findById(id);
  if (!u) throw new Error('User not found');
  getDb()
    .prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(?, avatar_url), name = COALESCE(name, ?) WHERE id = ?')
    .run(googleId, avatarUrl || null, name || null, id);
  touch(id);
  return findById(id)!;
}

// ---------------------------------------------------------------- admin actions

export function setStatus(id: string, status: UserStatus): UserRow {
  getDb().prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
  const u = findById(id);
  if (!u) throw new Error('User not found');
  return u;
}

export function setRole(id: string, role: UserRole): UserRow {
  getDb().prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, Date.now(), id);
  const u = findById(id);
  if (!u) throw new Error('User not found');
  return u;
}

/** Extend the trial to `until` (epoch ms). Passing a past time ends it immediately. */
export function extendTrial(id: string, until: number): UserRow {
  getDb().prepare('UPDATE users SET trial_extended_until = ?, updated_at = ? WHERE id = ?').run(until, Date.now(), id);
  const u = findById(id);
  if (!u) throw new Error('User not found');
  return u;
}

export function deleteUser(id: string): boolean {
  const res = getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

// ---------------------------------------------------------------- extension tokens

export function generateExtensionTokenFor(id: string): string {
  const token = newExtensionToken();
  getDb()
    .prepare('UPDATE users SET extension_token_hash = ?, extension_token_created_at = ?, extension_token_last_used_at = NULL WHERE id = ?')
    .run(sha256(token), Date.now(), id);
  return token;
}

export function revokeExtensionTokenFor(id: string): void {
  getDb()
    .prepare('UPDATE users SET extension_token_hash = NULL, extension_token_created_at = NULL, extension_token_last_used_at = NULL WHERE id = ?')
    .run(id);
}

/** Resolve a bearer token to its user, updating last-used at most once a minute. */
export function verifyExtensionToken(token: string | undefined): UserRow | null {
  if (!token || !token.startsWith('fab_')) return null;
  const hash = sha256(token);
  const u = getDb().prepare('SELECT * FROM users WHERE extension_token_hash = ?').get(hash) as unknown as UserRow | undefined;
  if (!u || !u.extension_token_hash || !timingSafeEqualHex(u.extension_token_hash, hash)) return null;
  if (!u.extension_token_last_used_at || Date.now() - u.extension_token_last_used_at > 60_000) {
    getDb().prepare('UPDATE users SET extension_token_last_used_at = ? WHERE id = ?').run(Date.now(), u.id);
  }
  return u;
}

// ---------------------------------------------------------------- bootstrap

/**
 * First boot on a fresh database: create the admin from ADMIN_PASSWORD / ADMIN_EMAIL so the
 * operator can sign in before any registration exists. Returns the admin if created.
 */
export function ensureAdminFromEnv(): UserRow | null {
  if (countAdmins() > 0) return null;
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn('[Users] No admin account exists and ADMIN_PASSWORD is not set. Set ADMIN_PASSWORD (and optionally ADMIN_EMAIL) to create one.');
    return null;
  }
  let email = normEmail(process.env.ADMIN_EMAIL || 'admin@example.com');
  if (!isValidEmail(email)) {
    // A malformed ADMIN_EMAIL must never take the whole server down on boot.
    console.warn(`[Users] ADMIN_EMAIL "${email}" is not a valid email address. Falling back to admin@example.com.`);
    email = 'admin@example.com';
  }
  const existing = findByEmail(email);
  if (existing) return setRole(existing.id, 'admin');
  const admin = createUser({ email, password: password.length >= 10 ? password : password.padEnd(10, '0'), name: 'Administrator', role: 'admin' });
  // A short env password is stored as given, hashed, even though registration requires 10+.
  if (password.length < 10) {
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), admin.id);
  }
  console.log(`[Users] Admin account created: ${email}`);
  return findById(admin.id);
}
