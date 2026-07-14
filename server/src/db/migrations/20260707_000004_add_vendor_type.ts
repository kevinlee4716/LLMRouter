// Migration: add vendor_type column to provider_vendors
// vendor_type: chat, embedding, image, audio
// Created: 2026-07-07

import type { Db } from '../types.js';

export function up(db: Db): void {
  db.exec(`
    ALTER TABLE provider_vendors ADD COLUMN vendor_type TEXT NOT NULL DEFAULT 'chat';
  `);
}

export function down(db: Db): void {
  // SQLite doesn't support DROP COLUMN easily; no-op
}
