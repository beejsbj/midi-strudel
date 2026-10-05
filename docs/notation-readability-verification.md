# Notation readability verification

Verified on 2026-09-24 against source implementation `ec65363`. This revision
supersedes the earlier opt-in/default-mode decisions in the
[foundation receipt](structured-verification.md). It implements the user's
follow-up: structured output only, no Expanded mode, retired Duration/Division
controls, one phrase object, and track-preserving polyphony.

## Delivered behavior

- Every generated score has one phrase library, short collision-safe track keys,
  compact selectors, and bounded one-off passages. No scattered phrase/timeline
  constants or automatic melody/harmony split remain.
- Safe simultaneous notes become chords; repeated equal-span tokens use `!`;
  no-op `.slow(1)` is omitted. Fractions replace constant numeric arguments only
  when they evaluate to the identical number. Varying mini-notation controls keep
  decimals because the pinned runtime does not safely support interpolation.
- Older saved representation/timing settings migrate away. Imported meters and
  exact BPM survive save/reload. Displayed BPM is rounded independently.
- Retired CLI flags fail with migration guidance. Formatting, cycle units,
  relative pitches, velocity, and quantization remain independent controls.
- Precise literal rendering is an internal fallback for unsupported timing. Zero
  gates are isolated so neighboring ordinary notes can remain structured.

## Validation

`npm test`: **112 tests in 15 files pass**. The removed tests exercised the retired
Duration/Division renderers; public MIDI/runtime fidelity tests remain and have
new phrase-library, chord, migration, and unusual-meter coverage.

`npm run typecheck`, `npm run lint`, and `npm run build` pass. Existing warnings
remain for the hook dependency list, soundfont eval, and editor bundle size.

Independent review found and resolved two migration regressions before completion:
valid 3/64 source meter was being capped at 3/32, and an explicitly requested
300ms quantization threshold was being capped at the sidebar's 200ms limit.
Public conversion now only strips retired fields. Runtime regressions cover both
cases; save/reload tests cover 3/64 and 33/4 meters. Review also checked namespace
collisions, duplicate notes, sustained passage boundaries, metadata, and budgets.

Chrome verification of the local app loaded Ruthlessness, showed the shared phrase
object, confirmed the retired settings were absent, and showed 135 BPM without
sidebar overflow. This check exposed and fixed a MIDI-package import difference
between Vite and Node. Both paths now work. No browser audio test was required.

## Independent full-song comparison

All six combinations pass: Ruthlessness and Warrior of the Mind, each with
absolute pitches, relative pitches, and beat cycles at playback BPM90 with 3/4
playback meter. Every case retains velocity and disables quantization. A source
oracle reparses MIDI independently of converter event preparation.

| Song | Supported notes | Events over two loops | Earlier structured characters | Current characters |
| --- | ---: | ---: | ---: | ---: |
| Ruthlessness | 372 | 744 | 7,156 | 3,622 |
| Warrior of the Mind | 3,304 | 6,608 | 95,363 | 57,521 |

Character counts compare complete absolute-mode output with retained velocity
and track colors disabled: approximately 49% and 40% smaller than the previous
structured output. Readability also comes from the single library, short
selectors, local one-off passages, and removal of misleading controls.

Pitches/mapped drums, onsets, intended gate ends, velocity, and multiplicity match
across two complete loops. Maximum timing error is **2.2737367544323206e-13s**.
Fresh fragment queries cover loop boundaries and the selected definition/restart
phases, phrase lengths, and adjacent/gapped transitions; all requested categories
fit within the 24-window cap. Cached full queries additionally check all internal
occurrence boundaries. Every case completed within its 90-second subprocess
limit. Full Warrior two-loop queries took approximately19–30s in this run.

The original required repetitions remain covered: Ruthlessness piano bars
3/4/5/7/8/9; Warrior piano bars2/4/6/8, with its transposed bar16 separate; and the
18-occurrence Warrior hi-hat phrase.

## Limits

Warrior's 293 unsupported percussion events remain explicitly reported. Two
tracks contain zero-gate events that retain precise internal fallback, also
reported. Changing tempo/meter and tickless saved notes remain supported through
that fallback. One-off library entries are presentation, not inferred sections or
additional discovered-reuse metadata; identical-looking one-offs can remain
separate when discovery rejects their savings. Acoustic envelopes, original
samples, pedal/CC expression, and dynamic-map export are outside this guarantee.

This receipt proves the implementation and local verification. PR merge and
production deployment remain separate actions.
