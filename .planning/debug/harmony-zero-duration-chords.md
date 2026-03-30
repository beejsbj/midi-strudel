---
status: awaiting_human_verify
trigger: "Investigate issue: harmony-zero-duration-chords"
created: 2026-03-27T16:24:45Z
updated: 2026-03-27T16:38:02Z
---

## Current Focus

hypothesis: The code fix is self-verified by renderer tests; remaining validation is to confirm the real melody+harmony editor output and playback now behave correctly with overlapping MIDI chords.
test: Have the user regenerate the affected MIDI in the app and confirm the harmony line no longer contains inner `@0` chord members and that playback sounds correct.
expecting: The editor should now emit simple chords like `{C#3, E3, G#3}@0.25` and padded overlap brackets instead of zero-duration inner tokens.
next_action: Request human verification in the actual app workflow.

## Symptoms

expected: For overlapping notes and chord/bracket notation, inner chord voices should follow the custom rules from `strudel-notation-history.md` and should not be rendered with zero-duration note tokens like `C#3@0`. Playback should sound correct.
actual: Generated harmony output includes tokens like `{C#3@0, E3@0, G#3@0}@0.25` and similar `@0` values in overlapping-note regions. The user reports that it is not playing right.
errors: No explicit runtime error provided.
reproduction: Use a MIDI with overlapping notes/chords in the current app, keep the default melody+harmony output style, and inspect the generated code in the Strudel editor. The screenshot shows lines around 389 with `@0` inside harmony brackets.
started: Not provided. Treat as an existing bug in current behavior unless evidence shows a regression.

## Eliminated

## Evidence

- timestamp: 2026-03-27T16:25:27Z
  checked: `strudel-notation-history.md`
  found: Bracket notation requires each comma-separated entry to span the bracket duration using note/rest padding; the examples show padded entries like `C4@0.5 ~@0.25`, not zero-duration inner note tokens.
  implication: Harmony output containing `{C#3@0, E3@0, G#3@0}@0.25` violates the documented notation rules, so the bug is in rendering rather than merely formatting preference.

- timestamp: 2026-03-27T16:25:27Z
  checked: `.planning/debug/knowledge-base.md`
  found: No knowledge base entry exists in this workspace for this symptom.
  implication: No prior known-pattern shortcut is available; root cause has to be established directly from the current renderer.

- timestamp: 2026-03-27T16:26:40Z
  checked: `rg -n "formatNoteVal\\(|@0|durOverride|renderMeasureAbsolute" services`
  found: Explicit zero-duration overrides exist in `GridBuilder.ts` at line 91 for subdivision grid labels and at line 299 inside `renderMeasureAbsolute`, where `noteStrs = chordNotes.map(n => formatNoteVal(..., 0))`.
  implication: The absolute-duration chord path is a concrete candidate for creating the observed `{...@0...}@...` harmony output.

- timestamp: 2026-03-27T16:29:56Z
  checked: `bun -e ... renderSequence(...)` with three same-start notes lasting 0.5s
  found: The renderer outputs `{C#3@0, E3@0, G#3@0}@0.25 ~@0.75`, exactly matching the reported broken token pattern.
  implication: The root cause is directly reproducible in the current absolute-duration harmony path.

- timestamp: 2026-03-27T16:29:56Z
  checked: `bun -e ... renderSequence(...)` with notes `C4(0-0.5)`, `E4(0-1)`, `G4(0.5-1)`
  found: The renderer outputs `{C4@0, E4@0}@0.5 G4@0.25 ~@0.5`, which loses the continuing `E4` voice instead of representing the overlap as padded bracket entries.
  implication: The bug is broader than a bad suffix; absolute-duration overlap groups are rendered with the wrong structure, causing playback errors.

- timestamp: 2026-03-27T16:34:27Z
  checked: `bun x vitest run services/notation/__tests__/MelodicRenderer.test.ts`
  found: Verification could not start because the workspace did not have `vite` and `@vitejs/plugin-react` installed, causing Vitest config loading to fail with `ERR_MODULE_NOT_FOUND`.
  implication: Test verification needs a dependency install before the renderer fix can be evaluated.

- timestamp: 2026-03-27T16:38:02Z
  checked: `bun x vitest run services/notation/__tests__/MelodicRenderer.test.ts`
  found: The focused melodic renderer suite passed after adding regression tests for simple same-start chords and padded overlap lanes.
  implication: The fix removes the reproduced `@0` chord-token failure and preserves overlapping-lane timing in the edited renderer path.

- timestamp: 2026-03-27T16:38:02Z
  checked: `bun x vitest run services/notation/__tests__/GridBuilder.test.ts services/notation/__tests__/MelodicRenderer.test.ts`
  found: Related notation tests passed (`25` tests across `2` files).
  implication: The GridBuilder changes did not break the adjacent subdivision/grid behavior covered by the existing suite.

## Resolution

root_cause: `renderMeasureAbsolute` uses a chord-specific shortcut that serializes same-start notes with `formatNoteVal(..., 0)` and has no general lane-based rendering for overlapping-note groups, so harmony brackets violate the notation contract and misrepresent playback timing.
fix: Replaced the absolute-duration chord shortcut with overlap-group rendering that groups connected overlaps, assigns notes to non-overlapping lanes, pads each lane with rests to the bracket duration, and keeps simple simultaneous chords in shorthand form without inner `@0` durations.
verification: Focused and adjacent notation tests passed after the fix (`bun x vitest run services/notation/__tests__/MelodicRenderer.test.ts` and `bun x vitest run services/notation/__tests__/GridBuilder.test.ts services/notation/__tests__/MelodicRenderer.test.ts`).
files_changed:
  - services/notation/GridBuilder.ts
  - services/notation/__tests__/MelodicRenderer.test.ts
