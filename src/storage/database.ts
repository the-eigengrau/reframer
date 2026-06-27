import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let db: Database.Database | null = null;

export function getDataDir(): string {
  const dir = path.join(os.homedir(), '.reframer');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'data.db');
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    createTables(db);
  }
  return db;
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id                TEXT PRIMARY KEY,
      created_at        TEXT NOT NULL,
      date_key          TEXT NOT NULL,
      emotion_intensity INTEGER NOT NULL,
      encrypted_data    TEXT NOT NULL,
      iv                TEXT NOT NULL DEFAULT '',
      auth_tag          TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS memories (
      id              TEXT PRIMARY KEY,
      created_at      TEXT NOT NULL,
      category        TEXT NOT NULL,
      content         TEXT NOT NULL,
      source_entry_id TEXT,
      iv              TEXT NOT NULL DEFAULT '',
      auth_tag        TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      entry_id    TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      messages    TEXT NOT NULL,
      iv          TEXT NOT NULL DEFAULT '',
      auth_tag    TEXT NOT NULL DEFAULT ''
    );

    -- Content-free "I journaled on this day" markers. Used so the streak can
    -- keep counting under zero-retention mode (and after erasing history)
    -- without retaining any journal content.
    CREATE TABLE IF NOT EXISTS activity (
      id          TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      date_key    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date_key ON entries(date_key);
    CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    CREATE INDEX IF NOT EXISTS idx_conversations_entry_id ON conversations(entry_id);
    CREATE INDEX IF NOT EXISTS idx_activity_date_key ON activity(date_key);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
