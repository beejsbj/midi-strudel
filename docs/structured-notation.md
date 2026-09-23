# Structured notation

Structured notation is an opt-in way to study a MIDI file as beat groups and reusable phrases. Expanded output remains the default. Both representations use the same prepared musical events and song loop span.

The converter works on supported MIDI uploads; the bundled songs are regression fixtures, not a list of recognized music. Discovery uses deterministic code with no model or inference service.

## Choose a representation

Select **Structured** in the existing format settings, or use the same option through the CLI:

```sh
npm run --silent convert -- song.mid --rendering structured
npm run --silent convert -- song.mid --rendering structured --format json
npm run --silent convert -- song.mid --rendering expanded
```

The choice persists with a project. Older saved settings and CLI calls without `--rendering` use expanded output. Code, JSON, and Strudel URL exports all use the shared converter. Diagnostics go to stderr; JSON also includes them as data.

## Timing and articulation

Source PPQ, ticks, note identities, and tempo/meter maps are retained alongside seconds. Requested quantization creates effective events without changing their source references. Every track, including a delayed entrance, uses one song-origin loop boundary. Hidden tracks still contribute to that boundary.

Structural spans place attacks; gates control their intended releases. A mini-notation weight such as `@2` changes a token's share of its surrounding sequence. It does not universally mean two cycles. `clip` scales a note's gate independently of that structural placement. Equal-span stacking preserves simultaneous notes with different releases; curly-brace polymeter is not used to represent ordinary overlap.

The structured renderer groups local beat subdivisions and uses local weights for irregular spacing. It keeps sustained notes as one attack, including across beat and measure boundaries. Exact output may need more numeric digits than the display precision setting requests: that setting cannot justify altering the music.

For example, four short sixteenth-note attacks on the first beat of a 4/4 measure produce this expanded expression (line breaks adjusted here):

```js
stack(
  note("C4").late(0).clip(0.03125),
  note("C4").late(0.0625).clip(0.03125),
  note("C4").late(0.125).clip(0.03125),
  note("C4").late(0.1875).clip(0.03125)
).slow(1)
```

Structured output describes the same attacks, half-slot gates, and three remaining silent beats as:

```js
note(`[[C4 C4 C4 C4] ~ ~ ~]`).clip(0.5).slow(1)
```

Both snippets were generated from the same MIDI through the public converter, with one source measure per cycle and velocity omitted. Instrument and visual suffixes are omitted here.

## Exact phrase reuse

Discovery searches complete, bar-aligned windows of one, two, and four source measures within each track, before any melody/harmony presentation split. Matching includes pitch, relative onset and release, multiplicity, and velocity when retained. Silent windows and boundary cuts through sustained notes are excluded. Transposed and approximately similar passages remain separate.

Accepted definitions have source-linked occurrences. Each occurrence uses `pickRestart` to begin at phrase-local time zero. Its selection lasts the actual phrase duration; extending a selection is not used to stretch or repeat a riff. Unmatched notes and silence remain explicit, and every track retains the common loop period.

Selection favors a reusable vocabulary over the shortest possible whole-song program. Only candidates with a meaningful estimated saving are eligible. The estimate charges for the definition, lookup, timeline uses, and longer-window complexity. Candidates are ranked by their remaining nonoverlapping occurrence count, then shorter measure count, then estimated saving, with stable signature/source-position tie breaks. Definitions are flat, without nested phrase references. This makes a frequently returning one-bar riff visible instead of hiding it inside several larger definitions.

Shared conversion and schema-v1 CLI JSON add a `patterns` object containing accepted `definitions` and `occurrences`. Definitions include a safe name, track, measure count, duration, and representative source-note IDs. Occurrences identify the definition, original one-based source measure, source-time interval, and their own source-note IDs. Expanded output and passages without accepted reuse have empty arrays. These are accepted emitted patterns, not speculative musical section labels.

`sharedSpanSeconds` and occurrence times use source-performance seconds. A playback BPM change scales audible seconds by `sourceBpm / bpm`; it does not rewrite source locations. Cycle-unit and playback-meter choices change the Strudel cycle representation while retaining that relationship.

For Ruthlessness's piano, the generated reusable definition is:

```js
// track1Phrase1: source measures 3, 4, 5, 7, 8, 9
const track1Phrase1 = note(`[[E6 D6 C6] [D6 C6 B5] [C6 B5 A5] [B5 A5 G5]]`)
  .velocity(0.3937007874015748).slow(1);
```

The generated selection timeline uses that name six times, with silence before,
between, and after the occurrences, and calls
`track1Timeline.pickRestart({ track1Phrase1 })`. Intervening unmatched notes are
stacked separately; this excerpt is the definition, not the complete score.

## Fidelity boundary

Legacy saved notes without ticks and material with changing tempo or meter remain accepted through precise performance-time literals with a diagnostic. This release does not export dynamic tempo/meter maps. Bounded discovery or rendering limits must fall back without dropping supported events or snapping their timing.

Discovery is limited per track to 8,192 measures, 100,000 event visits, and 200,000 selection operations. Exhaustion discards partial discoveries and emits a bounded diagnostic. The rhythmic renderer also limits beat and cell allocation. These limits bound analysis independently of a machine's wall-clock speed.

Existing unsupported percussion omissions remain reported. Pedal, pitch bend, controller automation, original sample envelopes, and acoustic timbre are outside this event-level guarantee.

Verification evaluates the complete generated score with the installed Strudel 1.2.2 REPL, then compares queried events with independently parsed MIDI. Checks include numeric pitch or mapped drum identity, onset, gate end, retained velocity, multiplicity, two complete loops, and boundary windows. The timing bound is one microsecond and, where source ticks exist, half a source tick. Browser playback is not required for these checks.
