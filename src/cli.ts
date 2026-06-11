import { select, password as passwordPrompt } from '@inquirer/prompts';
import { loadConfig, configExists, readCachedKey, cacheKey, saveConfig, type Config } from './config/index.js';
import { runSetupWizard } from './config/setup.js';
import { getDb, closeDb } from './storage/database.js';
import { setEncryptionKey, saveEntry, recordActivity } from './storage/index.js';
import { deriveKey, verifySentinel } from './storage/encryption.js';
import { animateParthenon } from './ui/ascii-art.js';
import { displayStatus } from './gamification/index.js';
import { runQuestionnaire } from './questionnaire/index.js';
import { runAISession, generateFarewell } from './ai/index.js';
import { viewPastEntries } from './screens/entries.js';
import { viewStats } from './screens/stats.js';
import { settingsMenu } from './screens/settings.js';
import { colors } from './ui/theme.js';
import { promptTheme } from './ui/prompt-theme.js';
import { animateSessionComplete } from './ui/celebration.js';
import { getRandomTipRaw } from './ui/tips.js';
import { showHelp } from './ui/help.js';
import { sleep } from './utils/sleep.js';
import { setLanguage, t } from './i18n/index.js';
import { initAudio, play, stopAudio, SoundEffect, getStartupMode } from './audio/index.js';

export async function main(): Promise<void> {
  let config: Config;

  if (!configExists()) {
    config = await runSetupWizard();
  } else {
    config = loadConfig();
  }

  setLanguage(config.preferences.language);
  initAudio(config.preferences);
  await setupEncryption(config);
  getDb();

  console.clear();
  console.log();
  if (shouldPlayStartupMusic(config)) {
    play(SoundEffect.Startup);
  }
  await animateParthenon(config.preferences.animationsEnabled);

  console.log();

  displayStatus();

  await mainMenuLoop(config);
  closeDb();
}

async function setupEncryption(config: Config): Promise<void> {
  if (config.encryption.mode === 'none') {
    setEncryptionKey(null);
    return;
  }

  if (config.encryption.mode === 'cached') {
    const cachedKey = readCachedKey();
    if (cachedKey) {
      setEncryptionKey(cachedKey);
      return;
    }
  }

  console.clear();
  console.log();
  console.log(colors.primary('  Rationalizer'));
  console.log();
  console.log(colors.white(`  ${t().passphrase.enter}`));

  const passphrase = await passwordPrompt({
    message: '',
    mask: '●',
    theme: { ...promptTheme, prefix: { idle: '  ›', done: '  ›' } },
  });

  const key = deriveKey(passphrase, config.encryption.salt, config.encryption.iterations);

  if (config.encryption.sentinel) {
    const valid = verifySentinel({
      ciphertext: config.encryption.sentinel,
      iv: config.encryption.sentinelIv || '',
      authTag: config.encryption.sentinelAuthTag || '',
    }, key);

    if (!valid) {
      console.log(colors.error(`\n  ${t().passphrase.incorrect}\n`));
      process.exit(1);
    }
  }

  setEncryptionKey(key);

  if (config.encryption.mode === 'cached') {
    cacheKey(key, config.encryption.cacheTTLMinutes);
  }
}

async function mainMenuLoop(config: Config): Promise<void> {
  let firstRun = true;
  let lastSessionEntry: import('./questionnaire/types.js').REBTEntry | null = null;
  while (true) {
    if (!firstRun) {
      console.clear();
      console.log();
      await animateParthenon(config.preferences.animationsEnabled);
      console.log();
      displayStatus();
    }
    firstRun = false;

    let choice: string;
    while (true) {
      console.log();
      choice = await select({
        message: '',
        theme: { ...promptTheme, prefix: { idle: '', done: '' } },
        choices: [
          { value: 'session', name: t().menu.beginSession },
          { value: 'entries', name: t().menu.pastEntries },
          { value: 'stats', name: t().menu.statsAndLevel },
          { value: 'settings', name: t().menu.settings },
          { value: 'exit', name: t().menu.exit },
          { value: 'help', name: colors.dim('? Help') },
        ],
      });
      if (choice === 'help') {
        showHelp('mainMenu');
        continue;
      }
      play(SoundEffect.MenuSelect);
      break;
    }

    switch (choice) {
      case 'session':
        lastSessionEntry = await runSession(config);
        break;
      case 'entries':
        await viewPastEntries();
        break;
      case 'stats':
        await viewStats();
        break;
      case 'settings':
        config = await settingsMenu(config);
        break;
      case 'exit':
        stopAudio();
        play(SoundEffect.Farewell);
        await showFarewell(config, lastSessionEntry);
        return;
    }
  }
}

async function runSession(config: Config): Promise<import('./questionnaire/types.js').REBTEntry> {
  const entry = await runQuestionnaire();

  // Zero-retention mode logs only a content-free streak marker; otherwise the
  // full entry is persisted. The same flag decides whether the AI conversation
  // and extracted memories are written to disk.
  const persist = !config.preferences.zeroRetention;
  if (persist) {
    saveEntry(entry);
  } else {
    recordActivity(entry);
  }

  if (config.ai.provider !== 'none' && !config.preferences.skipAI) {
    await runAISession(config, entry, persist);
  }

  console.clear();
  console.log();
  await animateSessionComplete(config.preferences.animationsEnabled);

  return entry;
}

async function typewriter(text: string, enabled: boolean): Promise<void> {
  if (!enabled) {
    process.stdout.write(colors.white(text));
    return;
  }
  for (const char of text) {
    process.stdout.write(colors.white(char));
    await sleep(30);
  }
}

function shouldPlayStartupMusic(config: Config): boolean {
  const mode = getStartupMode();
  if (mode === 'never') return false;
  if (mode === 'always') return true;

  // 'daily' — check if already played today
  const today = new Date().toISOString().slice(0, 10);
  const lastPlayed = (config as Record<string, unknown>).lastStartupMusicDate as string | undefined;
  if (lastPlayed === today) return false;

  // Record today's play (best-effort, non-critical)
  try {
    (config as Record<string, unknown>).lastStartupMusicDate = today;
    saveConfig(config);
  } catch {
    // Non-critical
  }
  return true;
}

async function showFarewell(config: Config, sessionEntry: import('./questionnaire/types.js').REBTEntry | null): Promise<void> {
  console.clear();
  console.log();

  // Only show a farewell line if the user actually journaled this run
  if (!sessionEntry) {
    console.log();
    return;
  }

  if (config.ai.provider !== 'none' && !config.preferences.skipAI) {
    const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frame = 0;
    const spinner = setInterval(() => {
      process.stdout.write(`\r  ${colors.dim(spinnerFrames[frame++ % spinnerFrames.length])}`);
    }, 80);

    const farewell = await generateFarewell(config, sessionEntry);

    clearInterval(spinner);
    process.stdout.write('\r\x1b[2K');

    if (farewell) {
      process.stdout.write('  ');
      await typewriter(farewell, config.preferences.animationsEnabled);
      process.stdout.write('\n\n');
      return;
    }
  }

  // Fallback: REBT tip (no-repeat rotation)
  const tip = getRandomTipRaw();
  process.stdout.write('  ');
  await typewriter(tip, config.preferences.animationsEnabled);
  process.stdout.write('\n\n');
}
