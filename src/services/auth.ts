/**
 * Single-admin authentication, extension tokens, and encrypted secrets.
 *
 * Password: ADMIN_PASSWORD env, hashed with scrypt at boot; a password changed from the
 * admin page is stored hashed in data/auth.json (Render's disk is ephemeral, so the env
 * var remains the durable source and the page tells the user to update it).
 * Session: HMAC-signed cookie, no server-side session store.
 * Extension token: random, shown once, stored hashed.
 * Secrets: AES-256-GCM with a key derived from SESSION_SECRET, so a leaked data file or
 * config dump does not leak the OpenAI key.
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
  passwordHash?: string; // "scrypt$<saltB64>$<hashB64>"
  sessionSecret?: string;
  extensionTokenHash?: string; // sha256 hex
  extensionTokenCreatedAt?: number;
  extensionTokenLastUsedAt?: number;
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

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function isPasswordConfigured(): boolean {
  return !!(state.passwordHash || process.env.ADMIN_PASSWORD);
}

export function checkPassword(password: string): boolean {
  if (typeof password !== 'string' || !password) return false;
  if (state.passwordHash) return verifyPassword(password, state.passwordHash);
  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(envPassword);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function setPassword(newPassword: string) {
  state.passwordHash = hashPassword(newPassword);
  persist();
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

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function issueSessionCookie(): { name: string; value: string; maxAgeMs: number } {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS, n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  return { name: SESSION_COOKIE, value: `${payload}.${sign(payload)}`, maxAgeMs: SESSION_TTL_MS };
}

export function verifySessionCookie(raw: string | undefined): boolean {
  if (!raw) return false;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
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

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function generateExtensionToken(): string {
  const token = `fab_${crypto.randomBytes(32).toString('base64url')}`;
  state.extensionTokenHash = sha256(token);
  state.extensionTokenCreatedAt = Date.now();
  state.extensionTokenLastUsedAt = undefined;
  persist();
  return token;
}

export function revokeExtensionToken() {
  state.extensionTokenHash = undefined;
  state.extensionTokenCreatedAt = undefined;
  state.extensionTokenLastUsedAt = undefined;
  persist();
}

export function verifyExtensionToken(token: string | undefined): boolean {
  if (!token || !state.extensionTokenHash) return false;
  const a = Buffer.from(sha256(token));
  const b = Buffer.from(state.extensionTokenHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  // Throttle the last-used write so a 20s heartbeat does not rewrite the file each time.
  if (!state.extensionTokenLastUsedAt || Date.now() - state.extensionTokenLastUsedAt > 60_000) {
    state.extensionTokenLastUsedAt = Date.now();
    persist();
  }
  return true;
}

export function extensionTokenStatus() {
  return {
    configured: !!state.extensionTokenHash,
    createdAt: state.extensionTokenCreatedAt || null,
    lastUsedAt: state.extensionTokenLastUsedAt || null,
  };
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
