# Structured notation

Every conversion uses structured notation: beat groups, independent note gates,
and a phrase library shared by the score. There is no Expanded output mode or
Duration/Division switch. The converter chooses subdivisions and local weights
where they preserve the effective notes exactly.

The converter works on supported MIDI uploads; the bundled songs are regression
fixtures, not a list of recognized music. Discovery uses deterministic code with
no model or inference service.

## Web, CLI, and saved projects

Upload a MIDI or load a saved project in the web app. The same converter is
available through the CLI:

```sh
npm run --silent convert -- song.mid
npm run --silent convert -- song.mid --format json
npm run --silent convert -- song.mid --format url
```

Older saved representation, timing-dialect, duration-precision, and melody/harmony
settings are discarded during migration. Notes, retained source metadata, tempo,
track settings, and meaningful formatting preferences survive. Retired CLI flags
produce a migration message rather than silently choosing a different dialect.
Code, JSON, and Strudel URL exports all use the shared converter. Diagnostics go
to stderr; JSON also includes them as data.

Absolute/relative pitches, cycle units, quantization, velocity, and line wrapping
remain separate choices. Displayed BPM is rounded for readability; the stored
and generated playback tempo retains its precise value.

## Timing and articulation

Source PPQ, ticks, note identities, and tempo/meter maps are retained alongside
seconds. Requested quantization creates effective events without changing their
source references. Every track, including a delayed entrance, uses one song-origin
loop boundary. Hidden tracks still contribute to that boundary.

Structural spans place attacks; gates control their intended releases. A
mini-notation weight such as `@2` changes a token's share of its surrounding
sequence. It does not universally mean two cycles. `clip` scales a note's gate
independently of that structural placement. Simultaneous notes can share a chord
when their releases and retained controls match; other overlapping notes retain
independent gates. MIDI tracks are preserved without guessing which notes are
melody or harmony.

The renderer groups local beat subdivisions and uses local weights for irregular
spacing. Sustained notes remain one attack, including across beat and measure
boundaries. Numeric formatting must preserve the effective timing: replacing a
long decimal with a fraction is a spelling change, not quantization. No-op
`.slow(1)` calls are omitted.

Short fractions are used in JavaScript arguments, such as `.clip(1/3)`. Changing
gate or velocity patterns retain decimal values inside mini-notation strings:
the pinned Strudel runtime gives `/` a different meaning there.

For example, four short sixteenth-note attacks on the first beat of a 4/4 measure,
with half-slot gates and three remaining silent beats, can be written as:

```js
note(`[[C4 C4 C4 C4] ~ ~ ~]`).clip(0.5)
```

Instrument, velocity, and visual settings are omitted from that example.

## Phrase library and arrangement

One `phrases` object collects named passages under each track. A short selector
places those passages on the song timeline. Repeated selector tokens can use `!`
without replacing repeated attacks with one sustained selection.

For example, Ruthlessness's piano part can be organized as follows, with velocity,
visuals, and the unchanged tempo header omitted:

```js
const phrases = {
  piano: {
    a: note(`[[E6 D6 C6] [D6 C6 B5] [C6 B5 A5] [B5 A5 G5]]`),
    b: note(`[[E6 D6 C6] [D6 C6 B5] ~ ~]`),
  },
};

$piano: cat("<~@2 a!3 b a!3 ~@9>")
  .pickRestart(phrases.piano)
  .sound("gm_piano");
```

Here `a` is the repeated riff and `b` is intervening one-off material. Presentation
can name a one-off passage without claiming to have discovered a repetition.
Safe passage boundaries preserve crossing notes; material that cannot be factored
safely remains explicit. Every track retains the common loop period.

## Exact phrase discovery

Discovery searches complete, bar-aligned windows of one, two, and four source
measures independently within each MIDI track. Matching includes pitch, relative
onset and release, multiplicity, and velocity when retained. Silent windows and
boundary cuts through sustained notes are excluded. Transposed and approximately
similar passages remain separate.

Each accepted occurrence uses `pickRestart` to begin at phrase-local time zero.
Its selection lasts the actual phrase duration; extending a selection is not used
to stretch or repeat a riff.

Selection favors a reusable vocabulary over the shortest possible whole-song
program. Only candidates with a meaningful estimated saving are eligible. The
estimate charges for the definition, lookup, timeline uses, and longer-window
complexity. Candidates are ranked by their remaining nonoverlapping occurrence
count, then shorter measure count, then estimated saving, with stable
signature/source-position tie breaks. Definitions do not reference other phrases.

Shared conversion and schema-v1 CLI JSON include a `patterns` object containing
accepted repeated `definitions` and `occurrences`, with track and source-note
references. One-off presentation entries are not reported as discovered reuse.
These are accepted emitted patterns, not speculative musical section labels.

`sharedSpanSeconds` and occurrence times use source-performance seconds. A playback
BPM change scales audible seconds by `sourceBpm / bpm`; it does not rewrite source
locations. Cycle-unit and playback-meter choices change the Strudel cycle
representation while retaining that relationship.

## Fidelity boundary

Legacy saved notes without ticks and material with changing tempo or meter remain
accepted through precise performance-time literals with a diagnostic. This is an
internal fallback, not a selectable output mode. This release does not export
dynamic tempo/meter maps. Bounded discovery or rendering limits must fall back
without dropping supported events or snapping their timing.

Discovery is limited per track to 8,192 measures, 100,000 event visits, and 200,000
selection operations. Exhaustion discards partial discoveries and emits a bounded
diagnostic. The rhythmic renderer also limits beat and cell allocation. These
limits bound analysis independently of a machine's wall-clock speed.

Existing unsupported percussion omissions remain reported. Pedal, pitch bend,
controller automation, original sample envelopes, and acoustic timbre are outside
this event-level guarantee.

Verification evaluates the complete generated score with the installed Strudel
1.2.2 REPL, then compares queried events with independently parsed MIDI. Checks
include numeric pitch or mapped drum identity, onset, gate end, retained velocity,
multiplicity, two complete loops, and boundary windows. The timing bound is one
microsecond and, where source ticks exist, half a source tick. Browser playback
is not required for these checks.
