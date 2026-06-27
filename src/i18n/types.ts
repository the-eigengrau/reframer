export type Language = 'en' | 'la' | 'grc';

export interface Translations {
  menu: {
    beginSession: string;
    pastEntries: string;
    statsAndLevel: string;
    settings: string;
    exit: string;
  };

  common: {
    back: string;
    cancel: string;
    updated: string;
    deleted: string;
  };

  passphrase: {
    enter: string;
    incorrect: string;
    choose: string;
    confirm: string;
    tooShort: string;
    mismatch: string;
  };

  settings: {
    aiProvider: string;
    localAI: string;
    cloudAI: string;
    noAI: string;
    anthropicApiKey: string;
    ollamaModel: string;
    encryption: string;
    encryptionMode: string;
    cached: string;
    alwaysAsk: string;
    noEncryption: string;
    encryptionStatus: { cached: string; always: string; none: string };
    newEntriesOnly: string;
    memories: string;
    noMemories: string;
    deleteOne: string;
    deleteAll: string;
    select: string;
    deleteAllConfirm: string;
    allDeleted: string;
    preferences: string;
    enableAnimations: string;
    language: string;
    audio: string;
    audioOn: string;
    audioOff: string;
    audioStatus: { on: string; off: string };
    startupMusic: string;
    startupMusicAlways: string;
    startupMusicDaily: string;
    startupMusicNever: string;
    seikilosBlurb: string;
    resetAllData: string;
    resetConfirm: string;
    dataCleared: string;
    zeroRetention: string;
    zeroRetentionStatus: { on: string; off: string };
    zeroRetentionBlurb: string;
    skipAI: string;
    skipAIStatus: { on: string; off: string };
    eraseHistory: string;
    eraseHistoryConfirm: string;
    eraseHistoryDone: string;
  };

  entries: {
    noEntries: string;
    activatingEvent: string;
    emotions: string;
    beliefs: string;
    consequences: string;
    disputation: string;
    newPhilosophy: string;
    earlyWarningSigns: string;
    motivation: string;
    conversation: string;
    you: string;
    reframer: string;
  };

  stats: {
    streak: string;
    longest: string;
    entries: string;
    days: string;
    maxLevel: string;
    daysToLevel: (current: number, required: number, levelName: string) => string;
  };

  prompts: {
    activatingEvent: { title: string; description: string; validation: string };
    emotionBefore: { title: string; description: string; validation: string };
    emotionIntensity: { title: string; description: string };
    beliefs: { title: string; description: string; validation: string };
    consequences: { title: string; description: string; validation: string };
    disputation: { title: string; description: string; validation: string };
    newPhilosophy: { title: string; description: string; validation: string };
    earlyWarningSigns: { title: string; description: string; validation: string };
    motivation: { title: string; description: string; validation: string };
  };

  tips: string[];

  levels: {
    titles: Record<string, string>;
    descriptions: Record<string, string>;
  };

  streak: {
    noActive: string;
    oneDay: string;
    nDays: (n: number) => string;
  };

  conversation: {
    doneHint: string;
    me: string;
    reframer: string;
    error: (msg: string) => string;
  };

  ai: {
    languageInstruction: string;
    farewellSystemPrompt: string;
    entryIntro: string;
    entryLabels: {
      activatingEvent: string;
      emotions: string;
      intensity: string;
      beliefs: string;
      consequences: string;
      disputation: string;
      newPhilosophy: string;
      earlyWarningSigns: string;
      motivation: string;
    };
  };

  help: {
    hint: string;
    mainMenu: string;
    pastEntries: string;
    settings: string;
    activatingEvent: string;
    emotionBefore: string;
    beliefs: string;
    consequences: string;
    disputation: string;
    newPhilosophy: string;
    earlyWarningSigns: string;
    motivation: string;
  };

  levelUp: (name: string, title: string) => string;
}
