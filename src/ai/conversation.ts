import { createInterface } from 'node:readline';
import type { AIProvider } from './anthropic.js';
import type { REBTEntry, ConversationMessage, Conversation } from '../questionnaire/types.js';
import { buildSystemPrompt, buildEntryMessage } from './prompt.js';
import { loadMemories, loadRecentSummaries, extractAndSaveMemories } from './memory.js';
import { saveConversation, generateId } from '../storage/index.js';
import { colors } from '../ui/theme.js';
import { createStreamWrapper, getContentWidth, wrapText } from '../ui/text.js';
import { t } from '../i18n/index.js';

const THINKING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const MAX_LINE_WIDTH = 72;

function startThinking(): { stop: () => void } {
  let frameIndex = 0;
  let stopped = false;

  const interval = setInterval(() => {
    if (stopped) return;
    const frame = THINKING_FRAMES[frameIndex % THINKING_FRAMES.length];
    process.stdout.write(`\r  ${colors.subtle(frame)}`);
    frameIndex++;
  }, 80);

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
      process.stdout.write('\r\x1b[2K');
    },
  };
}

export async function runConversation(
  provider: AIProvider,
  entry: REBTEntry,
  persist = true,
): Promise<void> {
  const memories = loadMemories();
  const recentSummaries = loadRecentSummaries(3, entry.id);
  const systemPrompt = buildSystemPrompt(memories, recentSummaries);

  const messages: ConversationMessage[] = [
    { role: 'user', content: buildEntryMessage(entry) },
  ];

  console.clear();
  console.log();
  console.log(colors.dim(`  ${t().conversation.doneHint}`));

  // Get initial response
  await streamResponse(provider, messages, systemPrompt);

  // Multi-turn conversation loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const getInput = (): Promise<string | null> => {
    return new Promise((resolve) => {
      process.stdout.write(colors.dimWhite('\n  › '));

      const onLine = (line: string) => {
        // Clear all physical lines the echoed input occupied
        const promptText = '  › ' + line;
        const cols = process.stdout.columns || 80;
        const physicalLines = Math.ceil(promptText.length / cols) || 1;
        for (let i = 0; i < physicalLines; i++) {
          process.stdout.write('\x1b[1A\x1b[2K');
        }

        // Write formatted "Me" message with word-wrap
        const wrapped = wrapText(line, getContentWidth(2, MAX_LINE_WIDTH), '  ');
        process.stdout.write(`  ${colors.dimWhite(t().conversation.me)}\n${wrapped}\n`);
        rl.removeListener('line', onLine);
        rl.removeListener('close', onClose);
        resolve(line);
      };

      const onClose = () => {
        rl.removeListener('line', onLine);
        resolve(null);
      };

      rl.once('line', onLine);
      rl.once('close', onClose);
    });
  };

  while (true) {
    const userInput = await getInput();

    if (userInput === null || userInput.trim().toLowerCase() === '/done') {
      console.log();
      break;
    }

    if (userInput.trim() === '') continue;

    messages.push({ role: 'user', content: userInput });
    await streamResponse(provider, messages, systemPrompt);
  }

  rl.close();

  // Zero-retention mode keeps the dialogue live but persists nothing.
  if (!persist) return;

  // Save conversation
  const conversation: Conversation = {
    id: generateId(),
    entryId: entry.id,
    createdAt: new Date().toISOString(),
    messages,
  };
  saveConversation(conversation);

  // Extract memories
  const thinking = startThinking();
  try {
    await extractAndSaveMemories(provider, messages, entry.id);
    thinking.stop();
  } catch {
    thinking.stop();
  }
}

async function streamResponse(
  provider: AIProvider,
  messages: ConversationMessage[],
  systemPrompt: string,
): Promise<void> {
  const thinking = startThinking();
  let firstToken = true;
  const indent = '  ';
  const wrapper = createStreamWrapper({
    width: getContentWidth(indent.length, MAX_LINE_WIDTH),
    indent,
    write: (s) => process.stdout.write(s),
    colorize: colors.white,
  });

  let fullResponse = '';
  try {
    fullResponse = await provider.chat(messages, systemPrompt, (text) => {
      if (firstToken) {
        thinking.stop();
        process.stdout.write(`\n  ${colors.primary(t().conversation.rationalizer)}\n  `);
        firstToken = false;
      }

      wrapper.push(text);
    });
  } catch (error) {
    wrapper.flush();
    thinking.stop();
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.log(colors.error(`  ${t().conversation.error(msg)}`));
    return;
  }

  wrapper.flush();
  if (firstToken) thinking.stop();
  console.log();
  messages.push({ role: 'assistant', content: fullResponse });
}
