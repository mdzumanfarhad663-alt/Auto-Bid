/**
 * Crypto primitives, sessions, login rate limiting, and the shared encrypted secrets.
 *
 * Accounts live in the users table (users.ts). This module holds what is genuinely global:
 * password hashing, the HMAC-signed session cookie (payload carries the user id, no
 * server-side session store), the login rate limiter, and the AES-256-GCM secret store
 * keyed from SESSION_SECRET, which holds the one admin-managed OpenAI key every user shares.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

const SESSION_COOKIE = 'autobid_session';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

interface AuthState {
  sessionSecret?: string;
  secrets: Record<string, string>; // name -> "<ivB64>.<tagB64>.<cipherB64>"
}

let state: AuthState = { secrets: {} };

function load() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      state = { secrets: {}, ...JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')) };
    }
  } catch {
    state = { secrets: {} };
  }
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  } catch (e) {
    console.error('[Auth] Failed to persist auth state:', e);
  }
}

// ---------------------------------------------------------------- password

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------- sessions

function sessionSecret(): Buffer {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return crypto.createHash('sha256').update(fromEnv).digest();
  if (!state.sessionSecret) {
    state.sessionSecret = crypto.randomBytes(32).toString('base64');
    persist();
    console.warn('[Auth] SESSION_SECRET is not set; generated one in data/auth.json. Sessions will reset on redeploy.');
  }
  return crypto.createHash('sha256').update(state.sessionSecret).digest();
}

export function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function issueSessionCookie(userId: string): { name: string; value: string; maxAgeMs: number } {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + SESSION_TTL_MS, n: crypto.randomBytes(8).toString('hex') })
  ).toString('base64url');
  return { name: SESSION_COOKIE, value: `${payload}.${sign(payload)}`, maxAgeMs: SESSION_TTL_MS };
}

/** Returns the user id carried by a valid, unexpired cookie, or null. */
export function verifySessionCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return null;
    return typeof data.uid === 'string' && data.uid ? data.uid : null;
  } catch {
    return null;
  }
}

/**
 * Short-lived signed value for OAuth state (CSRF). Same signing key as sessions.
 */
export function issueSignedState(ttlMs = 10 * 60 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ttlMs, n: crypto.randomBytes(12).toString('hex') })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySignedState(raw: string | undefined): boolean {
  if (!raw) return false;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// ---------------------------------------------------------------- extension token

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function newExtensionToken(): string {
  return `fab_${crypto.randomBytes(32).toString('base64url')}`;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- secrets

function secretKey(): Buffer {
  return crypto.createHash('sha256').update('secrets:').update(sessionSecret()).digest();
}

export function setSecret(name: string, value: string) {
  if (!value) {
    delete state.secrets[name];
    persist();
    return;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  state.secrets[name] = `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
  persist();
}

export function getSecret(name: string): string {
  const packed = state.secrets[name];
  if (!packed) return '';
  try {
    const [ivB64, tagB64, encB64] = packed.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong SESSION_SECRET after a redeploy: the secret is unreadable, not corrupt data.
    return '';
  }
}

export function hasSecret(name: string): boolean {
  return !!state.secrets[name];
}

export function maskSecret(value: string): string {
  if (!value) return '';
  return value.length <= 8 ? '••••' : `${value.slice(0, 3)}…${value.slice(-4)}`;
}

// The OpenAI key comes from, in order: the encrypted store, then the env var.
export function getOpenAiKey(): string {
  return getSecret('openaiApiKey') || (process.env.OPENAI_API_KEY || '').trim();
}

// ---------------------------------------------------------------- login rate limit

const attempts = new Map<string, { count: number; first: number }>();

export function loginAllowed(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const rec = attempts.get(ip);
  if (!rec) return { allowed: true };
  if (Date.now() - rec.first > LOGIN_WINDOW_MS) {
    attempts.delete(ip);
    return { allowed: true };
  }
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((rec.first + LOGIN_WINDOW_MS - Date.now()) / 1000) };
  }
  return { allowed: true };
}

export function recordLoginFailure(ip: string) {
  const rec = attempts.get(ip);
  if (!rec || Date.now() - rec.first > LOGIN_WINDOW_MS) attempts.set(ip, { count: 1, first: Date.now() });
  else rec.count += 1;
}

export function clearLoginFailures(ip: string) {
  attempts.delete(ip);
}

load();
