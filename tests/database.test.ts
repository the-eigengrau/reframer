import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { saveEntry, getEntry, listEntries, saveMemory, getMemories, deleteMemory, saveConversation, getConversation, setEncryptionKey, generateId, getStreakData } from '../src/storage/index.js';
import { deriveKey, generateSalt } from '../src/storage/encryption.js';
import * as database from '../src/storage/database.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { REBTEntry, Memory, Conversation } from '../src/questionnaire/types.js';

// Use a temporary directory for test database
const TEST_DIR = path.join(os.tmpdir(), `reframer-test-${Date.now()}`);

// Override the database module to use test directory
let testDb: Database.Database | null = null;

function setupTestDb() {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  // Use the real getDb but we need to override the path
  // For testing, we'll call getDb which uses the real path
  // Instead, we test the storage functions directly
}

describe('storage (no encryption)', () => {
  beforeEach(() => {
    setEncryptionKey(null); // No encryption for these tests
  });

  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('storage with encryption', () => {
  const salt = generateSalt();
  const key = deriveKey('test-pass-123456', salt, 1000);

  beforeEach(() => {
    setEncryptionKey(key);
  });

  afterEach(() => {
    setEncryptionKey(null);
  });

  it('should set and clear encryption key without error', () => {
    setEncryptionKey(key);
    setEncryptionKey(null);
  });
});

describe('date helpers', () => {
  it('should import date utils', async () => {
    const { todayKey, previousDay, daysBetween } = await import('../src/utils/date.js');

    const today = todayKey();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const prev = previousDay('2024-01-15');
    expect(prev).toBe('2024-01-14');

    const days = daysBetween('2024-01-01', '2024-01-10');
    expect(days).toBe(9);
  });

  it('should handle month boundaries', async () => {
    const { previousDay } = await import('../src/utils/date.js');
    expect(previousDay('2024-03-01')).toBe('2024-02-29'); // Leap year
    expect(previousDay('2023-03-01')).toBe('2023-02-28');
  });
});
