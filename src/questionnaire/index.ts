import {
  promptActivatingEvent,
  promptEmotionBefore,
  promptEmotionIntensity,
  promptEarlyWarningSigns,
  promptBeliefs,
  promptConsequences,
  promptDisputation,
  promptEffectiveNewPhilosophy,
  promptMotivation,
} from './prompts.js';
import type { REBTEntry } from './types.js';
import { generateId } from '../storage/index.js';
import { todayKey } from '../utils/date.js';

export async function runQuestionnaire(): Promise<REBTEntry> {
  console.clear();

  const activatingEvent = await promptActivatingEvent();
  const emotionBefore = await promptEmotionBefore();
  const emotionIntensity = await promptEmotionIntensity();
  const earlyWarningSigns = await promptEarlyWarningSigns();
  const beliefs = await promptBeliefs();
  const consequences = await promptConsequences();
  const disputation = await promptDisputation(beliefs);
  const effectiveNewPhilosophy = await promptEffectiveNewPhilosophy();
  const motivation = await promptMotivation();

  const entry: REBTEntry = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    dateKey: todayKey(),
    emotionIntensity,
    activatingEvent,
    beliefs,
    consequences,
    disputation,
    effectiveNewPhilosophy,
    emotionBefore,
    earlyWarningSigns,
    motivation,
  };

  // Persistence is decided by the session layer (runSession), which knows
  // whether zero-retention mode is enabled.
  return entry;
}
