import type { AIProvider } from './anthropic.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOllamaProvider } from './ollama.js';
import { runConversation } from './conversation.js';
import { buildEntryMessage } from './prompt.js';
import type { AppConfig } from '../questionnaire/types.js';
import type { REBTEntry } from '../questionnaire/types.js';
import { t } from '../i18n/index.js';
import { getRandomTipRaw } from '../ui/tips.js';

export function createProvider(config: AppConfig): AIProvider | null {
  switch (config.ai.provider) {
    case 'anthropic': {
      const apiKey = config.ai.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return null;
      return createAnthropicProvider(apiKey);
    }
    case 'ollama':
      return createOllamaProvider(config.ai.ollamaModel, config.ai.ollamaUrl);
    case 'none':
    default:
      return null;
  }
}

export async function runAISession(config: AppConfig, entry: REBTEntry, persist = true): Promise<void> {
  const provider = createProvider(config);
  if (!provider) return;

  await runConversation(provider, entry, persist);
}

export async function generateFarewell(config: AppConfig, entry: REBTEntry): Promise<string | null> {
  const provider = createProvider(config);
  if (!provider) return null;

  const systemPrompt = t().ai.farewellSystemPrompt;

  // Give the LLM the full entry so it can reference specifics
  const entryContent = buildEntryMessage(entry);

  // Pick a few tips as tonal inspiration
  const tips = [getRandomTipRaw(), getRandomTipRaw(), getRandomTipRaw()];

  const userMessage = `${entryContent}

---

Here are some aphorisms for tonal inspiration (do NOT copy these — use them only as a guide for voice and brevity):
- ${tips[0]}
- ${tips[1]}
- ${tips[2]}

Now write a single closing line for this person. Reference something specific from THEIR session — a word they used, the situation they described, the shift they made. Make them feel seen.`;

  try {
    let result = '';
    await provider.chat(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
      (text) => { result += text; },
    );
    return result.trim();
  } catch {
    return null;
  }
}

export type { AIProvider } from './anthropic.js';
