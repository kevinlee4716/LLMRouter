// Migration: add username column to users table for username-based login
// Created: 2026-07-07

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    ALTER TABLE users ADD COLUMN username TEXT;
    ALTER TABLE users ADD COLUMN reset_token TEXT;
    ALTER TABLE users ADD COLUMN reset_token_expires INTEGER;
    -- Backfill existing users: derive username from email (part before @)
    UPDATE users SET username = substr(email, 1, instr(email, '@') - 1) WHERE username IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);
}

export function down(_db: Db): void {
  throw new Error('irreversible migration: column additions are safe to keep');
}
