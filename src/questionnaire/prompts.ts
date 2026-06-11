import { number } from '@inquirer/prompts';
import { colors } from '../ui/theme.js';
import { promptTheme } from '../ui/prompt-theme.js';
import { vimInput } from '../ui/vim-input.js';
import { getContentWidth, wrapText } from '../ui/text.js';
import { t } from '../i18n/index.js';

function printStep(title: string, description: string): void {
  console.log(colors.white(`\n  ${title}`));
  console.log(colors.dim(wrapText(description, getContentWidth(2), '  ')));
}

export async function promptActivatingEvent(): Promise<string> {
  printStep(t().prompts.activatingEvent.title, t().prompts.activatingEvent.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.activatingEvent.validation,
    helpKey: 'activatingEvent',
  });
}

export async function promptEmotionBefore(): Promise<string> {
  printStep(t().prompts.emotionBefore.title, t().prompts.emotionBefore.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.emotionBefore.validation,
    helpKey: 'emotionBefore',
  });
}

export async function promptEmotionIntensity(): Promise<number> {
  printStep(t().prompts.emotionIntensity.title, t().prompts.emotionIntensity.description);

  const result = await number({
    message: '',
    theme: { ...promptTheme, prefix: { idle: '  ›', done: '  ›' } },
    min: 1,
    max: 100,
    required: true,
  });
  return result ?? 50;
}

export async function promptBeliefs(): Promise<string> {
  printStep(t().prompts.beliefs.title, t().prompts.beliefs.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.beliefs.validation,
    helpKey: 'beliefs',
  });
}

export async function promptConsequences(): Promise<string> {
  printStep(t().prompts.consequences.title, t().prompts.consequences.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.consequences.validation,
    helpKey: 'consequences',
  });
}

export async function promptDisputation(beliefs: string): Promise<string> {
  // Show beliefs recall block so user can see what they wrote
  const wrapped = wrapText(beliefs, getContentWidth(2, 68), '  ');
  console.log(colors.dim(`\n  ${t().prompts.beliefs.title}`));
  console.log(colors.dim('  ────────────'));
  console.log(colors.dim(wrapped));

  printStep(t().prompts.disputation.title, t().prompts.disputation.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.disputation.validation,
    helpKey: 'disputation',
  });
}

export async function promptEffectiveNewPhilosophy(): Promise<string> {
  printStep(t().prompts.newPhilosophy.title, t().prompts.newPhilosophy.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.newPhilosophy.validation,
    helpKey: 'newPhilosophy',
  });
}

export async function promptEarlyWarningSigns(): Promise<string> {
  printStep(t().prompts.earlyWarningSigns.title, t().prompts.earlyWarningSigns.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.earlyWarningSigns.validation,
    helpKey: 'earlyWarningSigns',
  });
}

export async function promptMotivation(): Promise<string> {
  printStep(t().prompts.motivation.title, t().prompts.motivation.description);

  return vimInput({
    validate: (val) => val.trim().length > 0 || t().prompts.motivation.validation,
    helpKey: 'motivation',
  });
}
