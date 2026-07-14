import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  userCount,
  createUser,
  verifyCredentials,
  createSession,
  validateSession,
  deleteSession,
  findUserByEmail,
  generateResetToken,
  resetPassword,
  changePassword,
  changeUsername,
  listUsers,
  deleteUser,
  adminCreateUser,
  type SessionUser,
} from '../services/auth.js';
import { setupCodeMatches, clearSetupCode } from '../lib/setup-code.js';

export const authRouter = Router();

// Dashboard auth (#35). These routes are mounted BEFORE requireAuth, so
// /status, /setup and /login are reachable without a session (bootstrap);
// /logout and /me validate the token themselves.
// User management routes require authentication (checked inline).

const safeUsername = z.string().min(1, 'Username is required').max(50)
  .regex(/^[a-zA-Z0-9_\-.\u4e00-\u9fff]+$/, 'Username can only contain letters, numbers, underscore, hyphen, dot, and Chinese characters');

const credentialsSchema = z.object({
  username: safeUsername,
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const setupSchema = z.object({
  username: safeUsername,
  email: z.string().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ── Brute-force throttle ──────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; lockedUntil: number }>();

function isLockedOut(key: string): boolean {
  const a = attempts.get(key.toLowerCase());
  return !!a && a.lockedUntil > Date.now();
}
function recordFailure(key: string): void {
  const k = key.toLowerCase();
  const a = attempts.get(k) ?? { count: 0, lockedUntil: 0 };
  a.count++;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = Date.now() + LOCKOUT_MS;
    a.count = 0;
  }
  attempts.set(k, a);
}
function clearFailures(key: string): void {
  attempts.delete(key.toLowerCase());
}

function bearer(req: Request): string | undefined {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '')
    ?? (req.headers['x-dashboard-token'] as string | undefined);
}

function isLoopbackRemote(req: Request): boolean {
  let addr = req.socket.remoteAddress ?? '';
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (addr === '::1') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr);
}

authRouter.get('/status', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  res.json({
    needsSetup: userCount() === 0,
    authenticated: !!session,
    username: session?.username ?? null,
    email: session?.email ?? null,
  });
});

// First-run account creation.
authRouter.post('/setup', (req: Request, res: Response) => {
  if (userCount() > 0) {
    clearSetupCode();
    res.status(409).json({ error: { message: 'Setup already completed. Use login instead.', type: 'setup_complete' } });
    return;
  }
  if (!isLoopbackRemote(req) && !setupCodeMatches((req.body ?? {}).setupCode)) {
    res.status(403).json({
      error: {
        message: 'A setup code is required to create the first account from a remote device. ' +
          'Check the server logs for the code, or open the dashboard from a browser on the machine running LLMRouter.',
        type: 'setup_code_required',
      },
    });
    return;
  }
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  const user = createUser(parsed.data.username, parsed.data.email, parsed.data.password);
  clearSetupCode();
  const token = createSession(user.userId);
  res.status(201).json({ token, username: user.username, email: user.email });
});

// Username login.
authRouter.post('/login', (req: Request, res: Response) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  const { username, password } = parsed.data;

  if (isLockedOut(username)) {
    res.status(429).json({ error: { message: 'Too many failed attempts. Try again later.', type: 'rate_limit_error' } });
    return;
  }

  const user = verifyCredentials(username, password);
  if (!user) {
    recordFailure(username);
    res.status(401).json({ error: { message: 'Invalid username or password', type: 'authentication_error' } });
    return;
  }

  clearFailures(username);
  const token = createSession(user.userId);
  res.json({ token, username: user.username, email: user.email });
});

// Register a new account (after first setup).
authRouter.post('/register', (req: Request, res: Response) => {
  if (userCount() === 0) {
    res.status(400).json({ error: { message: 'Use /api/auth/setup to create the first account.' } });
    return;
  }
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  try {
    const user = createUser(parsed.data.username, parsed.data.email, parsed.data.password);
    const token = createSession(user.userId);
    res.status(201).json({ token, username: user.username, email: user.email });
  } catch (err: any) {
    if (err.code === 'user_taken') {
      res.status(409).json({ error: { message: '用户名或邮箱已被注册' } });
    } else {
      res.status(500).json({ error: { message: 'Registration failed' } });
    }
  }
});

// Forgot password: sends a reset token (in production you'd email this; here we return it directly for local use).
authRouter.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: { message: 'Email is required' } });
    return;
  }
  const token = generateResetToken(email.trim());
  // Always return success to prevent email enumeration
  if (!token) {
    res.json({ message: 'If the email exists, a reset link has been sent.' });
    return;
  }
  // For local/dev: return the token directly (in production, you'd email this)
  res.json({ message: 'Reset token generated. Use it with /api/auth/reset-password.', resetToken: token });
});

// Reset password using token.
authRouter.post('/reset-password', (req: Request, res: Response) => {
  const { token, newPassword } = req.body ?? {};
  if (!token || !newPassword || typeof token !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: { message: 'Valid token and new password (min 8 chars) are required' } });
    return;
  }
  if (!resetPassword(token, newPassword)) {
    res.status(400).json({ error: { message: 'Invalid or expired reset token' } });
    return;
  }
  res.json({ message: 'Password has been reset. You can now login with your new password.' });
});

authRouter.post('/logout', (req: Request, res: Response) => {
  deleteSession(bearer(req));
  res.json({ success: true });
});

authRouter.get('/me', (req: Request, res: Response) => {
  const session = validateSession(bearer(req));
  if (!session) {
    res.status(401).json({ error: { message: 'Authentication required', type: 'authentication_error' } });
    return;
  }
  res.json({ username: session.username, email: session.email });
});

// ── Authenticated user management routes ─────────────────────────────────────

function requireAuth(req: Request, res: Response): SessionUser | null {
  const session = validateSession(bearer(req));
  if (!session) {
    res.status(401).json({ error: { message: 'Authentication required', type: 'authentication_error' } });
    return null;
  }
  return session;
}

// Change own password.
authRouter.post('/change-password', (req: Request, res: Response) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: { message: 'Current password and new password (min 8 chars) are required' } });
    return;
  }
  if (!changePassword(session.userId, currentPassword, newPassword)) {
    res.status(400).json({ error: { message: 'Current password is incorrect' } });
    return;
  }
  res.json({ message: 'Password changed successfully' });
});

// Change own username.
authRouter.post('/change-username', (req: Request, res: Response) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const { newUsername } = req.body ?? {};
  if (!newUsername || typeof newUsername !== 'string' || !newUsername.trim()) {
    res.status(400).json({ error: { message: 'New username is required' } });
    return;
  }
  if (!/^[a-zA-Z0-9_\-.\u4e00-\u9fff]+$/.test(newUsername.trim())) {
    res.status(400).json({ error: { message: 'Username can only contain letters, numbers, underscore, hyphen, dot, and Chinese characters' } });
    return;
  }
  if (!changeUsername(session.userId, newUsername.trim())) {
    res.status(400).json({ error: { message: 'Username already taken' } });
    return;
  }
  res.json({ username: newUsername.trim().toLowerCase() });
});

// List all users.
authRouter.get('/users', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  res.json(listUsers());
});

// Admin create user.
authRouter.post('/users', (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: parsed.error.errors.map(e => e.message).join(', ') } });
    return;
  }
  try {
    const user = adminCreateUser(parsed.data.username, parsed.data.email, parsed.data.password);
    res.status(201).json({ userId: user.userId, username: user.username, email: user.email });
  } catch (err: any) {
    res.status(409).json({ error: { message: err.message } });
  }
});

// Delete user.
authRouter.delete('/users/:id', (req: Request, res: Response) => {
  const session = requireAuth(req, res);
  if (!session) return;
  const targetId = parseInt(req.params.id as string, 10);
  if (!deleteUser(targetId, session.userId)) {
    res.status(400).json({ error: { message: 'Cannot delete yourself or user not found' } });
    return;
  }
  res.json({ success: true });
});
