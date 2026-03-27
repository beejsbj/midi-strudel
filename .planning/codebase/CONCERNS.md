# Codebase Concerns

**Analysis Date:** 2026-03-27

## Tech Debt

**Definite issues:**

**Persisted track state is never sanitized:**
- Confidence: High
- Issue: `loadTracksFromStorage` returns arbitrary parsed JSON as `Track[]` without validating track shape, note fields, or numeric ranges, and `useProjectState` hydrates that payload directly into live state.
- Files: `services/projectStorage.ts`, `hooks/useProjectState.ts`, `services/StrudelNotation.ts`, `services/notation/NotationUtils.ts`
- Impact: stale or corrupted local storage can break notation generation on app load and leave the app in a bad state until browser storage is cleared manually.
- Fix approach: add a `sanitizeTracks` step, validate required `Track` and `Note` fields, drop invalid entries, and clear incompatible persisted payloads.

**Package-manager drift is committed into the repo:**
- Confidence: High
- Issue: `package.json` declares `bun`, the repo contains both `bun.lock` and `package-lock.json`, and contributor docs point to `npm`.
- Files: `package.json`, `bun.lock`, `package-lock.json`, `README.md`, `CLAUDE.md`
- Impact: installs can resolve different dependency trees across environments, which raises the chance of "works on my machine" failures and lockfile churn.
- Fix approach: choose one package manager, delete the other lockfile, and align setup and verification docs with the chosen tool.

**Drum-note diagnostics are wired into hot regeneration paths:**
- Confidence: High
- Issue: `renderDrumTrack` warns once per unmapped MIDI note on every notation regeneration instead of once per file import.
- Files: `services/notation/DrumRenderer.ts`, `hooks/useProjectState.ts`
- Impact: dense drum tracks can flood the console during ordinary config tweaks, which makes real runtime failures harder to spot and slows debugging.
- Fix approach: collect unmapped-note diagnostics during parsing, dedupe them per track, and surface them once in UI or once per import.

**Lower-confidence observations:**

**TypeScript enforcement is intentionally loose around risky boundaries:**
- Confidence: Medium
- Issue: `tsconfig.json` omits strictness flags and enables `allowJs`, while core browser/library integration code relies on optional properties and `unknown`-shaped external objects.
- Files: `tsconfig.json`, `components/codeViewer/useStrudelEditor.ts`, `services/projectStorage.ts`
- Impact: schema drift and upstream API mismatches are more likely to show up as runtime bugs instead of compile-time failures.
- Fix approach: turn on stricter compiler options incrementally around storage, parser, and editor-integration code.

## Known Bugs

**Definite issues:**

**Overlapping loads can commit stale project state:**
- Confidence: High
- Symptoms: if a user starts one example/file load and then starts another before the first finishes, the earlier async result can still call `setTracks` and `setConfig` last and overwrite the newer selection.
- Files: `hooks/useProjectState.ts`
- Trigger: start `handleExampleLoad` or `loadProjectFile`, then trigger another load before the first `fetch` or parse completes.
- Workaround: wait for one load to finish before starting another.

**Uppercase MIDI extensions are rejected by the upload gate:**
- Confidence: High
- Symptoms: valid files such as `SONG.MID` or `theme.MIDI` are rejected unless the browser also provides a matching MIDI MIME type.
- Files: `components/DropZone.tsx`
- Trigger: upload or drop a MIDI file whose extension is uppercase or mixed-case.
- Workaround: rename the file to lowercase before uploading.

**Persistence failures are silent on large projects:**
- Confidence: High
- Symptoms: config or track changes stop surviving reloads once browser storage quota is exceeded, but the UI shows no warning.
- Files: `services/projectStorage.ts`, `hooks/useProjectState.ts`
- Trigger: load or edit a sufficiently large `Track[]` payload so `localStorage.setItem` throws.
- Workaround: keep the tab open or clear prior saved projects to free storage.

**Lower-confidence observations:**

Not detected.

## Security Considerations

**Definite issues:**

**External playback window is opened without `noopener`:**
- Confidence: High
- Risk: `window.open(..., '_blank')` keeps the new page connected to `window.opener`, which is a known reverse-tabnabbing risk.
- Files: `components/CodeViewer.tsx`
- Current mitigation: None in `handleOpenStrudel`.
- Recommendations: open with `noopener,noreferrer` window features or create a safe intermediary anchor element with `rel="noopener noreferrer"`.

**Untrusted MIDI files are parsed on the main thread with no size or complexity guard:**
- Confidence: High
- Risk: arbitrary uploads are accepted based on extension/MIME only, then fully read into memory and parsed synchronously by `@tonejs/midi`.
- Files: `components/DropZone.tsx`, `services/MidiParser.ts`, `hooks/useProjectState.ts`
- Current mitigation: extension and MIME checks only.
- Recommendations: cap accepted file size, normalize extension checks, reject obviously oversized inputs early, and move parsing off the main thread.

**Audio initialization reaches third-party infrastructure without an in-app privacy boundary:**
- Confidence: High
- Risk: playback setup loads sample manifests from `raw.githubusercontent.com`, which leaks user network metadata to a third party and creates a hidden online dependency in an otherwise local-feeling workflow.
- Files: `components/codeViewer/useStrudelEditor.ts`
- Current mitigation: None beyond normal browser network controls.
- Recommendations: self-host required sample manifests/assets, add offline fallback behavior, and document the network dependency in the UI.

**Lower-confidence observations:**

**Opening generated code in external Strudel shares project output with another origin by design:**
- Confidence: Medium
- Risk: the generated code is encoded into the destination URL hash and becomes visible to the external Strudel page after the user clicks out.
- Files: `components/CodeViewer.tsx`
- Current mitigation: user action is required before the external site opens.
- Recommendations: label the action as an export/share boundary and consider a copy-first workflow for privacy-sensitive use.

## Performance Bottlenecks

**Definite issues:**

**Parsing, notation generation, and persistence all happen on the UI thread:**
- Confidence: High
- Problem: file reads, MIDI parsing, key detection, notation generation, and `localStorage` serialization all run in the browser main thread.
- Files: `services/MidiParser.ts`, `services/KeyDetector.ts`, `services/StrudelNotation.ts`, `hooks/useProjectState.ts`, `services/projectStorage.ts`
- Cause: the app performs all processing synchronously inside React-side async handlers and render-time memoization.
- Improvement path: move parse/generate work into a Web Worker, batch expensive updates, and persist large payloads asynchronously with IndexedDB instead of `localStorage`.

**First playback is gated on multiple network-bound audio bootstrap steps:**
- Confidence: High
- Problem: the editor waits for soundfont registration plus several remote sample manifest requests before playback becomes ready.
- Files: `components/codeViewer/useStrudelEditor.ts`
- Cause: `ensureAudioReady` calls `registerSoundfonts()` and loads every file in `SAMPLE_JSON_FILES` up front.
- Improvement path: lazy-load only the required sample packs, cache bootstrap state aggressively, and prefetch or self-host assets.

**Lower-confidence observations:**

**Playback highlighting may become a hot path on very large generated outputs:**
- Confidence: Medium
- Problem: custom CodeMirror plugins repeatedly scan note tokens, visible ranges, and active playback ranges inside a large handwritten rendering layer.
- Files: `components/strudelPlaybackHighlight.ts`, `components/codeViewer/useStrudelEditor.ts`
- Cause: the highlight system is custom and document-driven rather than based on a smaller semantic model.
- Improvement path: measure with long documents, then cache more aggressively or reduce per-frame decoration work.

## Fragile Areas

**Definite issues:**

**Melody/harmony splitting is a one-lane heuristic:**
- Confidence: High
- Files: `services/notation/MelodicRenderer.ts`, `components/app/examples.ts`, `README.md`
- Why fragile: `splitMelodyHarmonySorted` tracks only a single `lastEnd`, so dense polyphony and crossing voices collapse into one melody lane plus a catch-all harmony lane.
- Safe modification: replace the heuristic with multi-voice assignment or lane packing based on active-note overlap, then regression-test against dense source files.
- Test coverage: only basic overlapping/non-overlapping cases are covered in `services/notation/__tests__/MelodicRenderer.test.ts`; dense arrangements are explicitly described as not converting cleanly in `components/app/examples.ts`.

**The Strudel editor integration depends on a hand-rolled adapter over several upstream libraries:**
- Confidence: High
- Files: `components/codeViewer/useStrudelEditor.ts`
- Why fragile: `StrudelEditorInstance` approximates the editor API with optional fields, `unknown` payloads, and library callbacks that are only partially typed.
- Safe modification: contain all upstream interop behind a narrower adapter module and add integration tests around init, destroy, error, and playback transitions.
- Test coverage: `components/codeViewer/__tests__/useStrudelEditor.test.tsx` mocks all `@strudel/*` packages, so real browser/audio/network lifecycle behavior is not exercised.

**Lower-confidence observations:**

**Large multi-purpose files are carrying too many responsibilities:**
- Confidence: Medium
- Files: `components/codeViewer/useStrudelEditor.ts`, `components/strudelPlaybackHighlight.ts`, `services/notation/GridBuilder.ts`, `components/sidebar/SidebarShared.tsx`, `hooks/useProjectState.ts`
- Why fragile: initialization, editor plugins, playback wiring, rendering math, UI helpers, and persistence logic are concentrated in a few large files, which raises change-coupling.
- Safe modification: split by responsibility before large feature work, especially around editor lifecycle, notation math, and sidebar controls.
- Test coverage: partial; the largest files are not covered end-to-end.

## Scaling Limits

**Definite issues:**

**Project persistence is bounded by `localStorage` size and synchronous write cost:**
- Confidence: High
- Current capacity: only browser quota plus available main-thread time; the app stores full parsed `Track[]` payloads as JSON.
- Limit: larger MIDI files can exceed storage quota or make save/load noticeably slower.
- Scaling path: move project persistence to IndexedDB with schema versioning and store derived output separately from source track data.

**The app already documents a dense example as a stress test:**
- Confidence: High
- Current capacity: the bundled `warrior-of-the-mind` example is described as "much denser" and explicitly noted as not converting as cleanly.
- Limit: denser arrangements expose the current heuristic and performance ceiling before any formal size guard exists.
- Scaling path: benchmark bundled examples, add file-size/note-count telemetry, and optimize parsing/rendering against those targets.

**Lower-confidence observations:**

**External export by URL hash will eventually hit practical length limits:**
- Confidence: Medium
- Current capacity: short and medium outputs are likely fine.
- Limit: very long generated code can exceed practical browser or destination handling limits when `handleOpenStrudel` places the entire payload into the URL hash.
- Scaling path: switch to a blob/share document flow or use a more compact serialization format for external handoff.

## Dependencies at Risk

**Definite issues:**

**Playback depends on a wide, loosely typed `@strudel/*` integration surface:**
- Confidence: High
- Risk: editor/playback behavior spans `@strudel/codemirror`, `@strudel/core`, `@strudel/draw`, `@strudel/mini`, `@strudel/tonal`, `@strudel/webaudio`, `@strudel/soundfonts`, and `@strudel/transpiler`, but the app mostly interacts through a permissive local adapter.
- Impact: upstream API shifts can land as runtime regressions without strong compile-time signals.
- Migration plan: isolate upstream calls in a dedicated adapter, pin and upgrade the Strudel stack together, and add higher-fidelity integration tests before version bumps.

**Lower-confidence observations:**

**Remote sample manifests create a brittle external dependency outside package management:**
- Confidence: Medium
- Risk: the app depends on assets under `https://raw.githubusercontent.com/felixroos/dough-samples/main/` that are not versioned in this repository.
- Impact: playback readiness can break even if `package.json` dependencies stay unchanged.
- Migration plan: vendor or self-host the required sample manifests and version them with the app.

## Missing Critical Features

**Definite issues:**

**There is no load cancellation or stale-result protection:**
- Confidence: High
- Problem: the app lacks request IDs, abort signals, or stale-response guards around example fetch and MIDI parse flows.
- Blocks: reliable rapid switching between example files and uploaded files.

**There is no schema versioning or migration path for persisted project data:**
- Confidence: High
- Problem: saved config and tracks are stored under fixed keys with no version marker or migration strategy.
- Blocks: safe evolution of `Track`, `Note`, and `StrudelConfig` shapes across releases.

**No CI workflow is detected in the repository:**
- Confidence: High
- Problem: no `.github/workflows/*` files are present, so test, lint, build, and typecheck enforcement is not encoded in the repo.
- Blocks: reliable pre-merge verification and automated regression detection.

**Lower-confidence observations:**

**There is no explicit offline or degraded-mode story for playback assets:**
- Confidence: Medium
- Problem: the app has no fallback UX when audio bootstrap cannot reach remote sample resources.
- Blocks: predictable playback in offline or firewalled environments.

## Test Coverage Gaps

**Definite issues:**

**MIDI parsing itself is untested:**
- Confidence: High
- What's not tested: binary parse success/failure, drum detection heuristics, empty-track handling, and file metadata extraction in `parseMidiFile`.
- Files: `services/MidiParser.ts`
- Risk: parser regressions can break the primary user path without a focused failing test.
- Priority: High

**Critical UI entry points are effectively uncovered:**
- Confidence: High
- What's not tested: upload validation and keyboard behavior in `components/DropZone.tsx`, persisted sidebar state in `components/Sidebar.tsx`, track overrides in `components/sidebar/TrackList.tsx`, external export in `components/CodeViewer.tsx`, boundary fallback in `components/app/AppErrorBoundary.tsx`, and workspace shell behavior in `components/app/WorkspaceScreen.tsx`.
- Files: `components/DropZone.tsx`, `components/Sidebar.tsx`, `components/sidebar/TrackList.tsx`, `components/CodeViewer.tsx`, `components/app/AppErrorBoundary.tsx`, `components/app/WorkspaceScreen.tsx`
- Risk: user-facing regressions in the main workflow can land even when the service tests stay green.
- Priority: High

**Async project-loading edge cases are not covered:**
- Confidence: High
- What's not tested: corrupted persisted tracks, overlapping example/file loads, fetch failures after a newer request starts, and silent storage quota failures.
- Files: `hooks/useProjectState.ts`, `services/projectStorage.ts`
- Risk: state corruption and stale-result bugs can slip into release because existing hook tests only cover debouncing behavior.
- Priority: High

**The editor tests do not exercise real Strudel integration behavior:**
- Confidence: High
- What's not tested: actual `@strudel/*` initialization, network-bound sample loading, browser audio failure paths, and editor teardown behavior against real library objects.
- Files: `components/codeViewer/useStrudelEditor.ts`, `components/codeViewer/__tests__/useStrudelEditor.test.tsx`
- Risk: library upgrades or browser-specific regressions can pass the mocked test suite and fail in production.
- Priority: Medium

**Lower-confidence observations:**

**Notation tests focus on happy-path shape, not output stability across complex songs:**
- Confidence: Medium
- What's not tested: larger multi-track fixtures, dense polyphony, and golden-output regressions for the bundled example MIDIs.
- Files: `services/notation/__tests__/GridBuilder.test.ts`, `services/notation/__tests__/MelodicRenderer.test.ts`, `components/app/examples.ts`, `public/examples/ruthlessness-epic-the-musical.mid`, `public/examples/warrior-of-the-mind-epic-the-musical.mid`
- Risk: the notation engine can drift subtly without a fixture-based alarm.
- Priority: Medium

---

*Concerns audit: 2026-03-27*
