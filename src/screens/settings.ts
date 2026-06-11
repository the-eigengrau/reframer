import { select, input, password, confirm } from '@inquirer/prompts';
import boxen from 'boxen';
import { saveConfig, clearCachedKey, type Config } from '../config/index.js';
import { getMemories, deleteMemory, deleteAllMemories, setEncryptionKey, eraseHistory } from '../storage/index.js';
import { getDb } from '../storage/database.js';
import { generateSalt, deriveKey, createSentinel } from '../storage/encryption.js';
import { cacheKey } from '../config/index.js';
import { colors, headerStyle, BOX_COLOR } from '../ui/theme.js';
import { promptTheme } from '../ui/prompt-theme.js';
import { showHelp } from '../ui/help.js';
import type { AIProvider, EncryptionMode } from '../questionnaire/types.js';
import { t, setLanguage, getLanguageName } from '../i18n/index.js';
import type { Language } from '../i18n/types.js';
import { initAudio } from '../audio/index.js';

export async function settingsMenu(config: Config): Promise<Config> {
  while (true) {
    console.clear();
    console.log();

    let choice: string;
    while (true) {
      choice = await select({
        message: '',
        theme: { ...promptTheme, prefix: { idle: '', done: '' } },
        choices: [
          { value: 'back', name: colors.dim(t().common.back) },
          { value: 'language', name: `${t().settings.language}  ${colors.dim(getLanguageName(config.preferences.language))}` },
          { value: 'audio', name: `${t().settings.audio}  ${colors.dim(config.preferences.audioEnabled ? t().settings.audioStatus.on : t().settings.audioStatus.off)}` },
          { value: 'ai', name: `${t().settings.aiProvider}  ${colors.dim(config.ai.provider)}` },
          { value: 'encryption', name: `${t().settings.encryption}  ${colors.dim(t().settings.encryptionStatus[config.encryption.mode])}` },
          { value: 'zeroRetention', name: `${t().settings.zeroRetention}  ${colors.dim(config.preferences.zeroRetention ? t().settings.zeroRetentionStatus.on : t().settings.zeroRetentionStatus.off)}` },
          { value: 'skipAI', name: `${t().settings.skipAI}  ${colors.dim(config.preferences.skipAI ? t().settings.skipAIStatus.on : t().settings.skipAIStatus.off)}` },
          { value: 'memories', name: t().settings.memories },
          { value: 'eraseHistory', name: colors.dim(t().settings.eraseHistory) },
          { value: 'reset', name: colors.dim(t().settings.resetAllData) },
          { value: 'help', name: colors.dim('? Help') },
        ],
      });
      if (choice === 'help') {
        showHelp('settings');
        continue;
      }
      break;
    }

    switch (choice) {
      case 'language':
        config = await configureLanguage(config);
        break;
      case 'audio':
        config = await configureAudio(config);
        break;
      case 'ai':
        config = await configureAI(config);
        break;
      case 'encryption':
        config = await configureEncryption(config);
        break;
      case 'zeroRetention':
        config = await configureZeroRetention(config);
        break;
      case 'skipAI':
        config = await configureSkipAI(config);
        break;
      case 'memories':
        await manageMemories();
        break;
      case 'eraseHistory':
        await eraseHistoryAction();
        break;
      case 'reset':
        await resetAllData();
        break;
      case 'back':
        return config;
    }
  }
}

async function configureAI(config: Config): Promise<Config> {
  console.clear();
  console.log();

  const provider = await select<AIProvider>({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '', done: '' } },
    choices: [
      { value: 'ollama' as const, name: t().settings.localAI },
      { value: 'anthropic' as const, name: t().settings.cloudAI },
      { value: 'none' as const, name: t().settings.noAI },
    ],
  });

  config.ai.provider = provider;

  if (provider === 'anthropic') {
    const apiKey = await input({
      message: t().settings.anthropicApiKey,
      theme: promptTheme,
      default: config.ai.anthropicApiKey || undefined,
    });
    config.ai.anthropicApiKey = apiKey;
  } else if (provider === 'ollama') {
    try {
      const response = await fetch(`${config.ai.ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json() as { models: Array<{ name: string }> };
        if (data.models && data.models.length > 0) {
          const modelChoice = await select({
            message: t().settings.ollamaModel,
            theme: promptTheme,
            choices: data.models.map(m => ({ value: m.name, name: m.name })),
            default: config.ai.ollamaModel,
          });
          config.ai.ollamaModel = modelChoice;
        } else {
          console.log(colors.dim('  No models found. Run: ollama pull llama3.2'));
        }
      }
    } catch {
      console.log(colors.dim('  Ollama not running. Start: ollama serve'));
    }
  }

  saveConfig(config);
  console.log(colors.dim(`  ${t().common.updated}`));
  return config;
}

async function configureEncryption(config: Config): Promise<Config> {
  console.clear();
  console.log();

  const mode = await select<EncryptionMode>({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '', done: '' } },
    choices: [
      { value: 'cached' as const, name: t().settings.cached },
      { value: 'always' as const, name: t().settings.alwaysAsk },
      { value: 'none' as const, name: t().settings.noEncryption },
    ],
  });

  if (mode !== 'none' && config.encryption.mode === 'none') {
    const passphrase = await password({
      message: t().passphrase.choose,
      mask: '●',
      theme: promptTheme,
      validate: (val) => val.length >= 8 || t().passphrase.tooShort,
    });

    await password({
      message: t().passphrase.confirm,
      mask: '●',
      theme: promptTheme,
      validate: (val) => val === passphrase || t().passphrase.mismatch,
    });

    const salt = generateSalt();
    config.encryption.salt = salt;
    const key = deriveKey(passphrase, salt, config.encryption.iterations);
    const sentinel = createSentinel(key);
    config.encryption.sentinel = sentinel.ciphertext;
    config.encryption.sentinelIv = sentinel.iv;
    config.encryption.sentinelAuthTag = sentinel.authTag;

    setEncryptionKey(key);
    if (mode === 'cached') {
      cacheKey(key, config.encryption.cacheTTLMinutes);
    }

    console.log(colors.dim(`  ${t().settings.newEntriesOnly}`));
  } else if (mode === 'none') {
    setEncryptionKey(null);
    clearCachedKey();
  }

  config.encryption.mode = mode;
  saveConfig(config);
  console.log(colors.dim(`  ${t().common.updated}`));
  return config;
}

async function manageMemories(): Promise<void> {
  const memories = getMemories(50);

  if (memories.length === 0) {
    console.log(colors.dim(`\n  ${t().settings.noMemories}`));
    await select({
      message: '',
      theme: { ...promptTheme, prefix: { idle: '', done: '' } },
      choices: [{ value: 'back', name: colors.dim(t().common.back) }],
    });
    return;
  }

  console.log();
  const grouped: Record<string, typeof memories> = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

  for (const [category, items] of Object.entries(grouped)) {
    console.log(colors.white(`  ${category}`));
    for (const item of items) {
      console.log(colors.dim(`    ${item.content}`));
    }
    console.log();
  }

  const action = await select({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '', done: '' } },
    choices: [
      { value: 'delete_one', name: t().settings.deleteOne },
      { value: 'delete_all', name: t().settings.deleteAll },
      { value: 'back', name: colors.dim(t().common.back) },
    ],
  });

  if (action === 'delete_one') {
    const memChoice = await select({
      message: t().settings.select,
      theme: promptTheme,
      choices: [
        ...memories.map(m => ({
          value: m.id,
          name: `${colors.dim(`[${m.category}]`)} ${m.content.slice(0, 60)}`,
        })),
        { value: '__cancel', name: colors.dim(t().common.cancel) },
      ],
      pageSize: 15,
    });

    if (memChoice !== '__cancel') {
      deleteMemory(memChoice);
      console.log(colors.dim(`  ${t().common.deleted}`));
    }
  } else if (action === 'delete_all') {
    const sure = await confirm({
      message: t().settings.deleteAllConfirm,
      theme: promptTheme,
      default: false,
    });
    if (sure) {
      deleteAllMemories();
      console.log(colors.dim(`  ${t().settings.allDeleted}`));
    }
  }
}

async function configureLanguage(config: Config): Promise<Config> {
  console.clear();
  console.log();

  const language = await select<Language>({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '', done: '' } },
    choices: [
      { value: 'en' as const, name: getLanguageName('en') },
      { value: 'la' as const, name: getLanguageName('la') },
      { value: 'grc' as const, name: getLanguageName('grc') },
    ],
    default: config.preferences.language,
  });

  config.preferences.language = language;
  setLanguage(language);
  saveConfig(config);
  console.log(colors.dim(`  ${t().common.updated}`));
  return config;
}

async function configureAudio(config: Config): Promise<Config> {
  console.clear();
  console.log();

  console.log(boxen(colors.dim(t().settings.seikilosBlurb), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: BOX_COLOR,
    borderStyle: 'round',
    dimBorder: true,
  }));

  const audioEnabled = await select<boolean>({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '', done: '' } },
    choices: [
      { value: true, name: t().settings.audioOn },
      { value: false, name: t().settings.audioOff },
    ],
    default: config.preferences.audioEnabled,
  });

  config.preferences.audioEnabled = audioEnabled;

  if (audioEnabled) {
    const startupMusic = await select<'always' | 'daily' | 'never'>({
      message: t().settings.startupMusic,
      theme: { ...promptTheme, prefix: { idle: '', done: '' } },
      choices: [
        { value: 'always' as const, name: t().settings.startupMusicAlways },
        { value: 'daily' as const, name: t().settings.startupMusicDaily },
        { value: 'never' as const, name: t().settings.startupMusicNever },
      ],
      default: config.preferences.startupMusic,
    });
    config.preferences.startupMusic = startupMusic;
  }

  saveConfig(config);
  initAudio(config.preferences);
  console.log(colors.dim(`  ${t().common.updated}`));
  return config;
}

async function configureZeroRetention(config: Config): Promise<Config> {
  console.clear();
  console.log();

  console.log(boxen(colors.dim(t().settings.zeroRetentionBlurb), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: BOX_COLOR,
    borderStyle: 'round',
    dimBorder: true,
  }));

  const enabled = await select<boolean>({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '', done: '' } },
    choices: [
      { value: false, name: t().settings.zeroRetentionStatus.off },
      { value: true, name: t().settings.zeroRetentionStatus.on },
    ],
    default: config.preferences.zeroRetention,
  });

  config.preferences.zeroRetention = enabled;
  saveConfig(config);
  console.log(colors.dim(`  ${t().common.updated}`));
  return config;
}

async function configureSkipAI(config: Config): Promise<Config> {
  console.clear();
  console.log();

  const enabled = await select<boolean>({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '', done: '' } },
    choices: [
      { value: false, name: t().settings.skipAIStatus.off },
      { value: true, name: t().settings.skipAIStatus.on },
    ],
    default: config.preferences.skipAI,
  });

  config.preferences.skipAI = enabled;
  saveConfig(config);
  console.log(colors.dim(`  ${t().common.updated}`));
  return config;
}

async function eraseHistoryAction(): Promise<void> {
  const sure = await confirm({
    message: t().settings.eraseHistoryConfirm,
    theme: promptTheme,
    default: false,
  });

  if (!sure) return;

  eraseHistory();
  console.log(colors.dim(`  ${t().settings.eraseHistoryDone}`));
}

async function resetAllData(): Promise<void> {
  const sure = await confirm({
    message: t().settings.resetConfirm,
    theme: promptTheme,
    default: false,
  });

  if (!sure) return;

  const db = getDb();
  db.exec('DELETE FROM entries');
  db.exec('DELETE FROM conversations');
  db.exec('DELETE FROM memories');
  db.exec('DELETE FROM activity');
  console.log(colors.dim(`  ${t().settings.dataCleared}`));
}
