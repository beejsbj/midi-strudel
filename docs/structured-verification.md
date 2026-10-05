# Structured foundation verification

Verified on 2026-09-23. Source implementation: `15d582c`.
Scope: BJS-441 through BJS-444 under BJS-440. This receipt covers implementation
and review; merge and deployment are separate steps.

## Repository checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

All 134 tests in 18 files pass. Typecheck, lint, and production build pass.
Pre-existing warnings remain: the project-state hook's exhaustive-deps warning,
soundfonts' use of eval, and the large Strudel-editor bundle.

Public-converter tests evaluate complete generated scores with the installed
Strudel 1.2.2 REPL. They cover exact tuplets and irregular weights, independent
chord gates, overlapping sustains, duplicate pitches, hidden/delayed tracks,
legacy and changing-map fallback, relative notes, drums, requested quantization,
one/two/four-measure phrases, rejected near-matches, discovery limits, and source
references. CLI subprocess tests cover code/JSON/URL parity. Configuration,
persistence, and hook tests cover the web mode switch and regeneration.

## Source fixture acceptance

| Fixture | Required accepted pattern | Result |
| --- | --- | --- |
| Ruthlessness piano | Bars 3, 4, 5, 7, 8, 9 | One definition, six occurrences |
| Warrior piano | Bars 2, 4, 6, 8 | One definition, four occurrences; transposed bar 16 stays separate |
| Warrior hi-hat | Bars 26, 27, 28, 31, 32, 33, 34, 35, 47, 48, 77, 78, 79, 80, 92, 93, 94, 95 | One eight-hit definition, eighteen occurrences |

Fixture SHA-256 values:

```text
ruthlessness-epic-the-musical.mid
7e24b52856dfdec9931be4146fb977b92baeef4c3866d62b7c17ab1fda8b99e8
warrior-of-the-mind-epic-the-musical.mid
849c3dcd52bf1e764051ed68de0239c837b23dcb6217ac9b2f05b07ca5029966
```

## Independent full-song matrix

An additional source oracle reparsed each original MIDI independently of converter
preparation. All **12 configurations pass**: both songs, expanded/structured
output, and absolute notes, relative notes, or beat cycles with playback BPM 90
and 3/4 playback meter. Every case retained velocity and disabled quantization.

| Fixture | Supported source notes | Events across two loops | Expanded characters | Structured characters |
| --- | ---: | ---: | ---: | ---: |
| Ruthlessness | 372 | 744 | 36,455 | 7,156 |
| Warrior | 3,304 | 6,608 | 312,927 | 95,363 |

Character counts are the complete absolute-mode code with the same configuration,
including declarations, mapping, and explicit remainder: approximately 80% and
70% reductions respectively. The largest onset or gate-end error across the full
matrix was **2.2737367544323206e-13 seconds**, below both the one-microsecond and
half-source-tick limits. Numeric pitch/mapped drum identity, velocity, and
multiplicity also matched.

Each score was queried over two complete loops. All internal occurrence boundaries
were checked against the cached full query and independent source oracle. Fresh
fragment queries covered both loop boundaries, every definition/restart-phase
combination, phrase lengths, and adjacent/gapped transitions. All 12 cases had
complete category coverage within the 24-window sampling cap. This does not claim
a separate query for every individual occurrence. Each subprocess had a 90-second
limit; all final cases completed within it, including expanded relative Warrior
at approximately 7.6 seconds.

## Independent review

The Standards and Spec reviews ran independently from base `67de273`, with final
source follow-ups at `15d582c`. Neither has unresolved findings. Review caught and
resolved fractional tempo/quantization rounding during project reload; a public
save/reload regression now compares complete code, span, metadata, and diagnostics.
Quantization policy and effective-event adaptation now have shared implementations.

A separate performance investigation found Strudel's scale join doing excessive
work when placed after whole-song slowdown. Scale conversion now happens before
slowdown, with source-event equivalence retained in both rendering modes.

## Limits

No browser audio or acoustic/timbral equivalence is claimed. Unsupported GM drum
notes remain explicitly reported; Warrior contains 293 such source events.
Changing tempo/meter and older tickless projects use the precise literal route.
Discovery is exact and bounded; transposed or approximate reuse and dynamic-map
export are outside this release. See [structured notation](structured-notation.md)
for timing semantics, selection policy, and generated examples.
