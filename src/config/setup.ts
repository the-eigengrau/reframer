import { select, input, password, confirm } from '@inquirer/prompts';
import { execSync } from 'node:child_process';
import boxen from 'boxen';
import { colors, BOX_COLOR, headerStyle } from '../ui/theme.js';
import { promptTheme } from '../ui/prompt-theme.js';
import { saveConfig, type Config, defaultConfig } from './index.js';
import { generateSalt, deriveKey, createSentinel } from '../storage/encryption.js';
import { getDb } from '../storage/database.js';
import { setEncryptionKey } from '../storage/index.js';
import { cacheKey } from './index.js';
import type { AIProvider, EncryptionMode } from '../questionnaire/types.js';

export async function runSetupWizard(): Promise<Config> {
  console.clear();
  console.log();

  console.log(boxen(
    `${colors.white('Welcome to Reframer')}\n\n` +
    `${colors.dim('A tool for Rational Emotive Behavior Therapy (REBT) journaling.')}\n` +
    `${colors.dim('REBT helps you identify irrational beliefs that cause emotional')}\n` +
    `${colors.dim('disturbance and replace them with healthier alternatives.')}\n\n` +
    `${colors.dim("Let's set things up.")}`,
    {
      padding: 1,
      borderColor: BOX_COLOR,
      borderStyle: 'round',
      dimBorder: true,
    }
  ));

  const config = defaultConfig();

  console.log(headerStyle('\n  AI Feedback\n'));

  const aiChoice = await select<AIProvider>({
    message: 'AI feedback on journal entries?',
    theme: promptTheme,
    choices: [
      { value: 'ollama' as const, name: 'Local AI — free, private, runs on your machine' },
      { value: 'anthropic' as const, name: 'Cloud AI — Claude, requires API key' },
      { value: 'none' as const, name: 'No AI — self-guided journaling only' },
    ],
  });

  config.ai.provider = aiChoice;

  if (aiChoice === 'ollama') {
    await setupOllama(config);
  } else if (aiChoice === 'anthropic') {
    await setupAnthropic(config);
  }

  console.log(headerStyle('\n  Encryption\n'));

  const encChoice = await select<EncryptionMode>({
    message: 'How should entries be protected?',
    theme: promptTheme,
    choices: [
      { value: 'cached' as const, name: 'Encrypt with passphrase (recommended)' },
      { value: 'always' as const, name: 'Encrypt — ask every session' },
      { value: 'none' as const, name: 'No encryption' },
    ],
  });

  config.encryption.mode = encChoice;

  if (encChoice !== 'none') {
    const passphrase = await password({
      message: 'Choose a passphrase',
      mask: '●',
      theme: promptTheme,
      validate: (val) => val.length >= 8 || 'At least 8 characters.',
    });

    await password({
      message: 'Confirm passphrase',
      mask: '●',
      theme: promptTheme,
      validate: (val) => val === passphrase || 'Passphrases do not match.',
    });

    const salt = generateSalt();
    config.encryption.salt = salt;
    const key = deriveKey(passphrase, salt, config.encryption.iterations);
    const sentinel = createSentinel(key);
    config.encryption.sentinel = sentinel.ciphertext;
    config.encryption.sentinelIv = sentinel.iv;
    config.encryption.sentinelAuthTag = sentinel.authTag;
    setEncryptionKey(key);

    if (encChoice === 'cached') {
      cacheKey(key, config.encryption.cacheTTLMinutes);
    }
  }

  saveConfig(config);
  getDb();

  console.log();
  console.log(colors.dim('  Setup complete.\n'));

  return config;
}

async function setupOllama(config: Config): Promise<void> {
  let ollamaInstalled = false;
  try {
    execSync('which ollama', { stdio: 'pipe' });
    ollamaInstalled = true;
  } catch { /* not installed */ }

  if (!ollamaInstalled) {
    console.log(colors.dim('\n  Ollama is not installed.'));
    console.log(colors.dim('  Install: brew install ollama'));
    console.log();

    const proceed = await confirm({
      message: 'Have you installed Ollama?',
      theme: promptTheme,
      default: false,
    });

    if (!proceed) {
      console.log(colors.dim('  You can configure AI later in Settings.'));
      config.ai.provider = 'none';
      return;
    }
  }

  try {
    const response = await fetch(`${config.ai.ollamaUrl}/api/tags`);
    if (response.ok) {
      const data = await response.json() as { models: Array<{ name: string }> };
      if (data.models && data.models.length > 0) {
        const modelChoice = await select({
          message: 'Which model?',
          theme: promptTheme,
          choices: data.models.map(m => ({ value: m.name, name: m.name })),
        });
        config.ai.ollamaModel = modelChoice;
      } else {
        console.log(colors.dim('  No models found. Pulling llama3.2...'));
        try {
          execSync('ollama pull llama3.2', { stdio: 'inherit' });
          config.ai.ollamaModel = 'llama3.2';
        } catch {
          console.log(colors.dim('  Failed. Run: ollama pull llama3.2'));
          config.ai.provider = 'none';
          return;
        }
      }
    }
  } catch {
    console.log(colors.dim('  Ollama not running. Start: ollama serve'));
  }

  console.log(colors.dim('  Local AI configured.'));
}

async function setupAnthropic(config: Config): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY || await input({
    message: 'Anthropic API key',
    theme: promptTheme,
    validate: (val) => val.trim().startsWith('sk-') || 'Should start with "sk-"',
  });

  config.ai.anthropicApiKey = apiKey.trim();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.ai.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    if (response.ok) {
      console.log(colors.dim('  Connected.'));
    } else {
      console.log(colors.dim('  Could not verify. Update in Settings later.'));
    }
  } catch {
    console.log(colors.dim('  Could not verify (network).'));
  }
}
