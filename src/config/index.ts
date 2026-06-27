import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { configSchema, type Config, defaultConfig } from './schema.js';

let cachedConfig: Config | null = null;

export function getConfigDir(): string {
  const dir = path.join(os.homedir(), '.reframer');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function getKeyfilePath(): string {
  return path.join(getConfigDir(), '.keyfile');
}

export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return defaultConfig();
  }

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    cachedConfig = configSchema.parse(raw);
    return cachedConfig;
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  cachedConfig = config;
}

export function configExists(): boolean {
  return fs.existsSync(getConfigPath());
}

/** Save derived key to keyfile with TTL */
export function cacheKey(key: Buffer, ttlMinutes: number): void {
  const keyfilePath = getKeyfilePath();
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  const data = JSON.stringify({
    key: key.toString('hex'),
    expiresAt,
  });
  fs.writeFileSync(keyfilePath, data, { mode: 0o600 });
}

/** Read cached key if it hasn't expired */
export function readCachedKey(): Buffer | null {
  const keyfilePath = getKeyfilePath();
  if (!fs.existsSync(keyfilePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(keyfilePath, 'utf-8'));
    if (data.expiresAt > Date.now()) {
      return Buffer.from(data.key, 'hex');
    }
    // Expired, delete the keyfile
    fs.unlinkSync(keyfilePath);
    return null;
  } catch {
    return null;
  }
}

export function clearCachedKey(): void {
  const keyfilePath = getKeyfilePath();
  if (fs.existsSync(keyfilePath)) {
    fs.unlinkSync(keyfilePath);
  }
}

export { type Config, defaultConfig } from './schema.js';
