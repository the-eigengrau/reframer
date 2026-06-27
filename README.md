# Reframer

**A Stoic AI journal that teaches you to think clearly when life hits hard.**

Reframer is a CLI-based tool for helping you feel better powered by Rational Emotive Behavior Therapy (REBT), the oldest and most battle-tested form of cognitive behavioral therapy. It walks you through a structured framework for dismantling irrational beliefs, then drops you into a Socratic dialogue with an AI that remembers your patterns across sessions.

Your data stays on your machine. Encrypted. No cloud required.

You can choose to use a cloud AI provider if you'd like to use their more powerful models.

```
npm install -g reframer
```
---

## Why REBT

In 1955, Albert Ellis created REBT, the original cognitive behavioral therapy. A decade before Beck's CBT. Ellis was heavily inspired by Stoicism.

Epictetus, 135 AD: *"Men are disturbed not by things, but by the views which they take of them."*

That's the entire theory. Bad events don't cause your suffering. Your **beliefs** about those events do. Specifically, your irrational demands: "This **must** not happen," "I **should** be better," "They **have** to treat me fairly." REBT teaches you to find these demands and replace them with preferences. Not suppression. Not positive thinking. Rational flexibility.

### The research

70 years of clinical evidence:

- **David et al. (2018)** - Meta-analysis of 84 studies. Significant effect sizes for outcomes (d=0.58) and belief change (d=0.70), sustained at follow-up. ([Journal of Clinical Psychology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5836900/))
- **King et al. (2024)** - 162 REBT intervention studies. Medium-to-large effects across behavioral, cognitive, emotional, and health outcomes. ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0306835))
- **David et al. (2008)** - RCT, 170 patients: REBT matched cognitive therapy and pharmacotherapy for major depression. ([Journal of Clinical Psychology](https://onlinelibrary.wiley.com/doi/abs/10.1002/jclp.20487))

Demonstrated effective for depression, anxiety, PTSD, OCD, anger, substance use, and performance contexts.

### The model

Every session walks you through five steps:

| Step | What you do |
|------|-------------|
| **A** - Activating Event | Describe what happened |
| **B** - Beliefs | Find the demands: must, should, have to |
| **C** - Consequences | How you felt and acted |
| **D** - Disputation | Challenge those beliefs with evidence |
| **E** - Effective New Philosophy | Replace demands with preferences |

The structured writing alone is massively helpful and therapeutic. The AI conversation that follows just deepens it.

---

## Features

### AI therapist that learns about you

After each journal entry, you enter a Socratic dialogue with an AI trained in the Albert Ellis tradition. Warm, direct, and curious. It asks questions rather than lectures. It challenges your "musts" and "shoulds" gently.

The AI extracts memories from each session (personal details, recurring patterns, breakthroughs, themes) and carries them forward. By your tenth session, it knows your tendencies. By your thirtieth, it catches patterns you don't see yourself.

### Latin and Ancient Greek

REBT descends directly from Stoic philosophy. So we support Classical Latin (Senecan register) or polytonic Ancient Greek (in the style of Epictetus) as languages. The AI responds in that language too, using authentic Stoic terminology: *opiniones* for beliefs, *disputatio* for disputation, *δόξαι* for judgments, *ἔλεγχος* for examination.

### Chiptune ancient Greek music

The startup jingle is an 8-bit arrangement of the [Seikilos Epitaph](https://en.wikipedia.org/wiki/Seikilos_epitaph) (~1st century AD), the oldest surviving complete musical composition. Found inscribed on a tombstone near Aidin, Turkey, its melody accompanies the words *"Hoson zes, phainou"* — "While you live, shine." Rendered here as a Game Boy-style chiptune with square waves, 4-bit DAC emulation, and LFSR noise.

### Local-first, encrypted by default

All data lives in `~/.reframer/data.db`. Journal entries, conversations, and AI memories are encrypted with **AES-256-GCM** (PBKDF2 key derivation, 100k iterations, SHA-512). Your passphrase never leaves your machine.

**No telemetry. No analytics. No tracking.**

### Local & Cloud LLM Options

| Provider | Privacy | Setup |
|----------|---------|-------|
| **Ollama** (local) | Nothing leaves your machine | `ollama pull llama3.2 && ollama serve` |
| **Claude** (cloud) | Entries sent over HTTPS | Set `ANTHROPIC_API_KEY` |
| **None** | Maximum privacy | Self-guided REBT only |

### Vim mode

Press `Ctrl+G` during any journal prompt to open your `$EDITOR`. Write long-form entries in vim, emacs, or whatever you use.

---

## Install

```bash
npm install -g reframer
```

From source:

```bash
git clone https://github.com/the-eigengrau/reframer.git
cd reframer
npm install
npm run dev
```

## Usage

```bash
reframer
```

First run → setup wizard (AI provider, encryption passphrase). Every run after that → straight to journaling.

`Ctrl+G` opens vim mid-prompt. Main menu has settings, past entries, and stats.

## Privacy

- **Ollama**: Zero network traffic. Everything runs locally.
- **Claude**: Only journal content is sent to the Anthropic API over HTTPS. Encrypted at rest.

## Development

```bash
npm run dev        # Run with tsx
npm run build      # Compile TypeScript
npm test           # Run tests
```

## License

MIT
