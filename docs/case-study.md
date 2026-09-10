# MIDI Strudel: from a melody question to a converter

The spark was small: after getting absorbed in *Epic: The Musical*, I wanted to look at its melodies as Strudel code instead of only as a piano roll. The first version was an experiment in notation. Repeated work on the experiment turned it into a web converter for studying, editing, and hearing MIDI-derived patterns, and later into a repo-local CLI that coding agents can invoke without a browser.

This is a case study of that path, not a claim that MIDI transcription is solved.

## The notation problem

MIDI gives the converter note starts, ends, pitches, velocities, tracks, tempo, and meter. Strudel gives it repeating code-shaped patterns. The useful intermediate notation had to keep rests and durations visible while still making polyphony readable.

- Sequential notes are tokens such as `C4` or `C4@0.5`; `@x` is a duration measured in cycles. `~` is a rest and can also carry a duration, such as `~@0.5`.
- A bracket groups material that starts within the same outer time span. Comma-separated voices are padded with rests so their entries have equal total duration: `{C4@0.5 ~@0.25, ~@0.25 E4@0.5}@0.75`.
- Melody and harmony are separated by default. A non-overlapping line can remain a melody stream; simultaneous notes and chords are rendered as harmony material or split into voices when the selected style requires it.
- With `cycleUnit: bar`, `@1` is one measure; with `cycleUnit: beat`, `@1` is one beat. The converter derives its `setcps` expression from BPM, meter, and that unit. Absolute timing preserves measured durations; relative-division timing uses a constructed rhythmic grid. Quantization is an explicit option, not an invisible correction.
- Absolute notation emits note names. Relative notation emits scale degrees and a `.scale(...)` expression when key information is available.

These decisions grew through the working notes in [`strudel-notation-history.md`](../strudel-notation-history.md) and the more formalized prompt in [`strudel-notation-project-prompt.md`](../strudel-notation-project-prompt.md). The history is part of the artifact: the bracket/padding idea and the melody/harmony split were explored before they were stabilized in code.

## One conversion, actually run

The checked-in fixture [`public/examples/ruthlessness-epic-the-musical.mid`](../public/examples/ruthlessness-epic-the-musical.mid) is the input provenance for this example. From the repository root, after `npm ci`, I ran:

```bash
npm run --silent convert -- public/examples/ruthlessness-epic-the-musical.mid --format code
```

The command exited 0, wrote 316 lines (7,139 bytes) to stdout, and wrote nothing to stderr. The beginning of the actual output was:

```text
// @title ruthlessness-epic-the-musical
// @by midi-strudel
// @details BPM: 135 | Time: 4/4

const BPM = 135;
setcps(BPM / 60 / 4);

$GRAND_PIANO_CLASSIC_MELODY: `<
~@2
E6@0.0833 D6@0.0833 C6@0.0833 D6@0.0833
```

That output shows the source metadata, meter-derived CPS setup, an initial rest, and measured note durations. The output is a sample of this fixture, not a quality score for the transcription.

## One converter, two surfaces

The web app remains the human inspection surface: load a MIDI file, adjust notation, timing, mapping, and formatting settings, play the result, and open the generated code in Strudel. The CLI calls the same `convertMidi` path as the web app; `StrudelNotation` delegates rendering to the notation modules rather than maintaining a second transcription implementation. Its stable non-interactive outputs are plain code, schema-v1 JSON, and a `strudel.cc/#...` URL carrying the same encoded code payload used by the web surface. CLI usage and flags live in the repository [`README.md`](../README.md).

The CLI contract was delivered in [PR #6](https://github.com/beejsbj/midi-strudel/pull/6) and hardened in [PR #7](https://github.com/beejsbj/midi-strudel/pull/7). The recorded receipts report subprocess coverage for `.mid`/`.midi`, code/JSON/URL output, clean stdout, stderr separation, deterministic output, and meaningful failures. The web path's bundled-example verification is recorded under parent issue [BJS-38](https://linear.app/bjs-projects/issue/BJS-38/finish-midi-strudel-as-an-agent-facing-converter-and-case-study).

## What remains bounded

This converter is intentionally not a general MIDI transcription system. Key detection is heuristic; unsupported or ambiguous instrument and percussion mappings remain possible; quantization changes timing by configuration; and dense code can be difficult to read. A dense bundled fixture previously produced a roughly 54 KB Strudel URL, so URL size is a practical limit. Standard GM percussion notes 43, 48, and 52 are now mapped where the project has a defensible compatible token, while unsupported notes remain dropped and reported. [PR #8](https://github.com/beejsbj/midi-strudel/pull/8) changed repeated warning floods into deterministic per-note counts and additive JSON diagnostics; it did not claim broader GM coverage.

The relevant completion receipts are [BJS-399](https://linear.app/bjs-projects/issue/BJS-399/build-an-agent-facing-midi-to-strudel-cli) (CLI PRs #6 and #7) and [BJS-404](https://linear.app/bjs-projects/issue/BJS-404/preserve-gm-percussion-and-aggregate-dropped-note-diagnostics) (percussion and diagnostics PR #8). The recorded final checks were 91 tests, typecheck, lint with one existing warning, production build, and diff check for PR #8; PR #7 records 89 tests plus the corresponding checks. Those are receipts for the implemented surfaces and test coverage, not evidence of adoption, benchmarked performance, or universally faithful musical output.
