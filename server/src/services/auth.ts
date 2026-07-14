import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

// Dashboard authentication: username + password accounts with opaque session
// tokens. Distinct from the unified API key, which authenticates the /v1 proxy
// for apps — this gates the /api/* admin surface for the human operator (#35).

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionUser {
  userId: number;
  username: string;
  email: string;
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function normalizeUsername(u: string): string {
  return u.trim().toLowerCase();
}

export function userCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
  return row.c;
}

/** Create a user. Throws { code: 'username_taken' } if the username already exists. */
export function createUser(username: string, email: string, password: string): SessionUser {
  const db = getDb();
  const normUser = normalizeUsername(username);
  const normEmail = normalizeEmail(email);
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(normUser, normEmail) as any;
  if (existing) {
    const err = new Error('Username or email already taken') as any;
    err.code = 'user_taken';
    throw err;
  }
  const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    .run(normUser, normEmail, hashPassword(password));
  return { userId: Number(result.lastInsertRowid), username: normUser, email: normEmail };
}

/** Verify credentials by username. Returns the user on success, null on failure. */
export function verifyCredentials(username: string, password: string): SessionUser | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, username, email, password_hash FROM users WHERE username = ?'
  ).get(normalizeUsername(username)) as { id: number; username: string; email: string; password_hash: string } | undefined;
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  return { userId: row.id, username: row.username, email: row.email };
}

/** Find user by email (for password reset). */
export function findUserByEmail(email: string): { userId: number; username: string; email: string } | null {
  const db = getDb();
  const row = db.prepare('SELECT id, username, email FROM users WHERE email = ?').get(normalizeEmail(email)) as any;
  return row ? { userId: row.id, username: row.username, email: row.email } : null;
}

/** Generate a password reset token valid for 1 hour. */
export function generateResetToken(email: string): string | null {
  const user = findUserByEmail(email);
  if (!user) return null;
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?')
    .run(sha256(token), Date.now() + 3600000, user.userId);
  return token;
}

/** Verify and consume a reset token, returning the user. */
export function verifyResetToken(token: string): { userId: number; username: string } | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, username FROM users WHERE reset_token = ? AND reset_token_expires > ?'
  ).get(sha256(token), Date.now()) as any;
  if (!row) return null;
  return { userId: row.id, username: row.username };
}

/** Reset password using a valid reset token. */
export function resetPassword(token: string, newPassword: string): boolean {
  const user = verifyResetToken(token);
  if (!user) return false;
  getDb().prepare(
    "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?"
  ).run(hashPassword(newPassword), user.userId);
  return true;
}

/** Change password for a logged-in user. */
export function changePassword(userId: number, currentPassword: string, newPassword: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as any;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) return false;
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId);
  return true;
}

/** Change username for a logged-in user. */
export function changeUsername(userId: number, newUsername: string): boolean {
  const db = getDb();
  const norm = normalizeUsername(newUsername);
  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(norm, userId);
  if (existing) return false;
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(norm, userId);
  return true;
}

/** List all users (admin function). */
export function listUsers(): { id: number; username: string; email: string; created_at: string }[] {
  return getDb().prepare('SELECT id, username, email, created_at FROM users ORDER BY id').all() as any[];
}

/** Delete a user by id (cannot delete self). */
export function deleteUser(userId: number, deleterId: number): boolean {
  if (userId === deleterId) return false;
  const result = getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);
  return result.changes > 0;
}

/** Create a user by admin. */
export function adminCreateUser(username: string, email: string, password: string): SessionUser {
  return createUser(username, email, password);
}

/** Mint a session and return the raw token (only the hash is persisted). */
export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at_ms) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_TTL_MS);
  return token;
}

/** Resolve a session token to its user, or null if missing/expired. */
export function validateSession(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT s.user_id, s.expires_at_ms, u.username, u.email
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(sha256(token)) as { user_id: number; expires_at_ms: number; username: string; email: string } | undefined;
  if (!row) return null;
  if (row.expires_at_ms < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return { userId: row.user_id, username: row.username, email: row.email };
}

export function deleteSession(token: string | undefined | null): void {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}
