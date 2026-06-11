import crypto from 'node:crypto';
import { getDb } from './database.js';
import { encryptJSON, decryptJSON, encrypt, decrypt, type EncryptedPayload } from './encryption.js';
import type {
  REBTEntry,
  REBTSensitiveData,
  EncryptedEntry,
  Memory,
  EncryptedMemory,
  Conversation,
  ConversationMessage,
  EncryptedConversation,
  StreakData,
} from '../questionnaire/types.js';

// --- Encryption key management ---
let encryptionKey: Buffer | null = null;

export function setEncryptionKey(key: Buffer | null): void {
  encryptionKey = key;
}

export function getEncryptionKey(): Buffer | null {
  return encryptionKey;
}

function isEncrypted(): boolean {
  return encryptionKey !== null;
}

function encryptField(data: unknown): { data: string; iv: string; authTag: string } {
  if (!isEncrypted()) {
    return { data: JSON.stringify(data), iv: '', authTag: '' };
  }
  const payload = encryptJSON(data, encryptionKey!);
  return { data: payload.ciphertext, iv: payload.iv, authTag: payload.authTag };
}

function decryptField<T>(data: string, iv: string, authTag: string): T {
  if (!iv && !authTag) {
    return JSON.parse(data) as T;
  }
  return decryptJSON<T>({ ciphertext: data, iv, authTag }, encryptionKey!);
}

function encryptString(text: string): { data: string; iv: string; authTag: string } {
  if (!isEncrypted()) {
    return { data: text, iv: '', authTag: '' };
  }
  const payload = encrypt(text, encryptionKey!);
  return { data: payload.ciphertext, iv: payload.iv, authTag: payload.authTag };
}

function decryptString(data: string, iv: string, authTag: string): string {
  if (!iv && !authTag) {
    return data;
  }
  return decrypt({ ciphertext: data, iv, authTag }, encryptionKey!);
}

// --- Entries ---

export function saveEntry(entry: REBTEntry): void {
  const db = getDb();
  const sensitive: REBTSensitiveData = {
    activatingEvent: entry.activatingEvent,
    beliefs: entry.beliefs,
    consequences: entry.consequences,
    disputation: entry.disputation,
    effectiveNewPhilosophy: entry.effectiveNewPhilosophy,
    emotionBefore: entry.emotionBefore,
    earlyWarningSigns: entry.earlyWarningSigns,
    motivation: entry.motivation,
  };

  const encrypted = encryptField(sensitive);

  db.prepare(`
    INSERT INTO entries (id, created_at, date_key, emotion_intensity, encrypted_data, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.createdAt,
    entry.dateKey,
    entry.emotionIntensity,
    encrypted.data,
    encrypted.iv,
    encrypted.authTag,
  );
}

// Record a content-free date marker for the streak, without persisting any
// journal content. Used by zero-retention sessions in place of saveEntry().
export function recordActivity(entry: Pick<REBTEntry, 'id' | 'createdAt' | 'dateKey'>): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO activity (id, created_at, date_key)
    VALUES (?, ?, ?)
  `).run(entry.id, entry.createdAt, entry.dateKey);
}

// Erase all journal content while preserving the streak: copy each entry's
// date marker into the activity table, then drop the content tables.
export function eraseHistory(): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.exec(`
      INSERT OR IGNORE INTO activity (id, created_at, date_key)
        SELECT id, created_at, date_key FROM entries;
    `);
    db.exec('DELETE FROM entries');
    db.exec('DELETE FROM conversations');
    db.exec('DELETE FROM memories');
  });
  tx();
}

export function getEntry(id: string): REBTEntry | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as EncryptedEntry | undefined;
  if (!row) return null;
  return decryptEntry(row);
}

export function listEntries(limit = 50, offset = 0): REBTEntry[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM entries ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as EncryptedEntry[];
  return rows.map(decryptEntry);
}

function decryptEntry(row: EncryptedEntry): REBTEntry {
  const sensitive = decryptField<REBTSensitiveData>(row.encrypted_data, row.iv, row.auth_tag);
  return {
    id: row.id,
    createdAt: row.created_at,
    dateKey: row.date_key,
    emotionIntensity: row.emotion_intensity,
    ...sensitive,
  };
}

// --- Memories ---

export function saveMemory(memory: Memory): void {
  const db = getDb();
  const encrypted = encryptString(memory.content);

  db.prepare(`
    INSERT INTO memories (id, created_at, category, content, source_entry_id, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory.id,
    memory.createdAt,
    memory.category,
    encrypted.data,
    memory.sourceEntryId || null,
    encrypted.iv,
    encrypted.authTag,
  );
}

export function getMemories(limit = 30): Memory[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM memories ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as EncryptedMemory[];
  return rows.map(decryptMemoryRow);
}

export function getMemoriesByCategory(category: string): Memory[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM memories WHERE category = ? ORDER BY created_at DESC'
  ).all(category) as EncryptedMemory[];
  return rows.map(decryptMemoryRow);
}

export function deleteMemory(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

export function deleteAllMemories(): void {
  const db = getDb();
  db.prepare('DELETE FROM memories').run();
}

function decryptMemoryRow(row: EncryptedMemory): Memory {
  return {
    id: row.id,
    createdAt: row.created_at,
    category: row.category as Memory['category'],
    content: decryptString(row.content, row.iv, row.auth_tag),
    sourceEntryId: row.source_entry_id || undefined,
  };
}

// --- Conversations ---

export function saveConversation(conversation: Conversation): void {
  const db = getDb();
  const encrypted = encryptField(conversation.messages);

  db.prepare(`
    INSERT INTO conversations (id, entry_id, created_at, messages, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    conversation.id,
    conversation.entryId,
    conversation.createdAt,
    encrypted.data,
    encrypted.iv,
    encrypted.authTag,
  );
}

export function getConversation(entryId: string): Conversation | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM conversations WHERE entry_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(entryId) as EncryptedConversation | undefined;
  if (!row) return null;
  return decryptConversationRow(row);
}

function decryptConversationRow(row: EncryptedConversation): Conversation {
  return {
    id: row.id,
    entryId: row.entry_id,
    createdAt: row.created_at,
    messages: decryptField<ConversationMessage[]>(row.messages, row.iv, row.auth_tag),
  };
}

// --- Streak Data ---

export function getStreakData(): StreakData {
  const db = getDb();

  // Streak/day counts derive from both retained entries and the content-free
  // activity markers left by zero-retention sessions / erased history.
  const totalEntries =
    (db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number }).count +
    (db.prepare('SELECT COUNT(*) as count FROM activity').get() as { count: number }).count;

  // Get all distinct date_keys (across both tables) sorted descending
  const dateKeys = (db.prepare(`
    SELECT DISTINCT date_key FROM (
      SELECT date_key FROM entries
      UNION
      SELECT date_key FROM activity
    ) ORDER BY date_key DESC
  `).all() as { date_key: string }[])
    .map(r => r.date_key);

  const totalDays = dateKeys.length;
  const lastEntryDate = dateKeys[0] || null;

  const { currentStreak, longestStreak } = calculateStreaks(dateKeys);

  return { currentStreak, longestStreak, totalEntries, totalDays, lastEntryDate };
}

function calculateStreaks(dateKeys: string[]): { currentStreak: number; longestStreak: number } {
  if (dateKeys.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Current streak: must include today or yesterday
  let currentStreak = 0;
  if (dateKeys[0] === today || dateKeys[0] === yesterday) {
    currentStreak = 1;
    for (let i = 1; i < dateKeys.length; i++) {
      const prev = new Date(dateKeys[i - 1]);
      const curr = new Date(dateKeys[i]);
      const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Longest streak
  let longestStreak = dateKeys.length > 0 ? 1 : 0;
  let streak = 1;
  for (let i = 1; i < dateKeys.length; i++) {
    const prev = new Date(dateKeys[i - 1]);
    const curr = new Date(dateKeys[i]);
    const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
    if (diffDays === 1) {
      streak++;
      longestStreak = Math.max(longestStreak, streak);
    } else {
      streak = 1;
    }
  }

  return { currentStreak, longestStreak };
}

// --- Recent entries for AI context ---

export function getRecentEntries(limit = 3): REBTEntry[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM entries ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as EncryptedEntry[];
  return rows.map(decryptEntry);
}

export function generateId(): string {
  return crypto.randomUUID();
}
