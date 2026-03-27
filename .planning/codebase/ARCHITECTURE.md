# Architecture

**Analysis Date:** 2026-03-27

Observed facts below cite concrete files. Items labeled `Inference` are cross-file interpretations of the current code, not explicit architecture declarations in the repo.

## Pattern Overview

**Overall:** Root-level React single-page app with a stateful orchestration hook, presentational UI partitions, and service modules for MIDI parsing, key detection, notation rendering, persistence, and embedded Strudel playback. `Inference` from `index.tsx`, `App.tsx`, `hooks/useProjectState.ts`, and `services/*.ts`.

**Key Characteristics:**
- `index.tsx` mounts a single `AppWithBoundary`, so the product runs as one browser app rather than route-based pages.
- `App.tsx` keeps only mobile-sidebar UI state locally and delegates project lifecycle, generated code, and persistence to `hooks/useProjectState.ts`.
- Conversion logic is not embedded in components; `services/MidiParser.ts`, `services/KeyDetector.ts`, `services/StrudelNotation.ts`, and `services/notation/*.ts` form the domain layer.
- The embedded player/editor is lazily loaded through `components/codeViewer/LazyCodeViewer.tsx`, and the runtime-specific playback state then lives inside `components/codeViewer/useStrudelEditor.ts`.
- Shared modules `types.ts` and `constants.ts` are imported by both UI and services, so boundaries are enforced by folder conventions rather than package separation.

## Layers

**Bootstrap And App Shell:**
- Purpose: mount React and provide a crash boundary around the full app.
- Location: `index.tsx`, `App.tsx`, `components/app/AppErrorBoundary.tsx`
- Contains: ReactDOM bootstrap, top-level screen switching, hidden file input, fatal error fallback.
- Depends on: browser DOM, `hooks/useProjectState.ts`, `components/app/*.tsx`
- Used by: the module entry in `index.html`

**Project Orchestration Layer:**
- Purpose: own project state and coordinate parsing, key detection, notation generation, storage, file upload triggers, and example loading.
- Location: `hooks/useProjectState.ts`, `hooks/useDebouncedValue.ts`
- Contains: `StrudelConfig` and `Track[]` state, debounced persistence and generation, dependency injection seams for tests.
- Depends on: `services/MidiParser.ts`, `services/KeyDetector.ts`, `services/StrudelNotation.ts`, `services/projectStorage.ts`, `components/app/examples.ts`
- Used by: `App.tsx`

**UI Composition Layer:**
- Purpose: render the two major app modes and expose configuration plus track controls.
- Location: `components/app/*.tsx`, `components/Sidebar.tsx`, `components/sidebar/*.tsx`, `components/DropZone.tsx`
- Contains: empty state, workspace shell, sidebar sections, upload surface, recoverable error banner.
- Depends on: `types.ts`, `components/sidebar/SidebarShared.tsx`, `components/sidebar/configUpdates.ts`
- Used by: `App.tsx`, `components/app/WorkspaceScreen.tsx`, `components/app/EmptyStateScreen.tsx`

**Notation Domain Layer:**
- Purpose: convert parsed tracks into Strudel-style code strings.
- Location: `services/StrudelNotation.ts`, `services/notation/NotationUtils.ts`, `services/notation/GridBuilder.ts`, `services/notation/MelodicRenderer.ts`, `services/notation/DrumRenderer.ts`, `constants.ts`
- Contains: note preparation, quantization, relative pitch mapping, beat and measure grid construction, melody and harmony splitting, drum mapping, track-level visual suffix generation.
- Depends on: `types.ts`, `constants.ts`
- Used by: `hooks/useProjectState.ts`

**Parsing, Analysis, And Persistence Services:**
- Purpose: ingest MIDI, infer source musical metadata, and persist or recover project state.
- Location: `services/MidiParser.ts`, `services/KeyDetector.ts`, `services/projectStorage.ts`
- Contains: `@tonejs/midi` parsing, key estimation, localStorage sanitization and serialization.
- Depends on: `types.ts`, browser `localStorage`
- Used by: `hooks/useProjectState.ts`
- Quirk: `services/KeyDetector.ts` imports `normalizeConfidence` from `services/projectStorage.ts`, so the analysis layer depends on a persistence utility.

**Editor And Playback Runtime Layer:**
- Purpose: host the embedded Strudel editor/player and sync playback visuals with generated code.
- Location: `components/CodeViewer.tsx`, `components/codeViewer/useStrudelEditor.ts`, `components/strudelPlaybackHighlight.ts`, `components/codeViewer/CodeViewerToolbar.tsx`, `components/codeViewer/CodeViewerAlerts.tsx`
- Contains: lazy editor boot, Strudel runtime and audio initialization, CodeMirror decorations, copy and open actions, playback highlight state.
- Depends on: `@strudel/*`, CodeMirror packages, browser audio APIs.
- Used by: `components/app/EmptyStateScreen.tsx`, `components/app/WorkspaceScreen.tsx`
- Quirk: editor playback and audio errors stay local to `components/codeViewer/useStrudelEditor.ts`, separate from the app-wide `error` state in `hooks/useProjectState.ts`.

## Data Flow

**File Load To Track Model:**

1. `components/DropZone.tsx` or the hidden file input in `App.tsx` hands a `File` to `hooks/useProjectState.ts`.
2. `hooks/useProjectState.ts` calls `parseMidiFile` from `services/MidiParser.ts` to create `Track[]`, source BPM, and source time signature.
3. `hooks/useProjectState.ts` calls `detectKey` from `services/KeyDetector.ts` and writes the parsed tracks plus source and playback defaults into `StrudelConfig`.

**Code Generation And Persistence:**

1. `hooks/useProjectState.ts` keeps `config` and `tracks` in React state and debounces both with `hooks/useDebouncedValue.ts`.
2. A memoized `StrudelNotation` instance is created from the debounced config and generates code from the debounced tracks.
3. Separate effects save the debounced config and tracks through `services/projectStorage.ts`.
4. `App.tsx` passes the generated `code` plus state setters into `components/app/WorkspaceScreen.tsx`, `components/Sidebar.tsx`, and `components/app/EmptyStateScreen.tsx`.

**Notation Rendering Pipeline:**

1. `services/StrudelNotation.ts` prepares each track’s notes, filters unmapped drum notes, computes global duration, and emits shared header plus setup code.
2. Melodic tracks flow into `services/notation/MelodicRenderer.ts`, which splits melody and harmony, formats sequences, and adds `.sound()`, `.scale()`, and visual suffixes.
3. Drum tracks flow into `services/notation/DrumRenderer.ts`, which reuses `renderSequence` and emits `.bank()` output.
4. `services/notation/GridBuilder.ts` chooses absolute-duration or relative-division formatting for each block, while `services/notation/NotationUtils.ts` handles timing math, quantization, rests, relative-note conversion, and visual suffix helpers.

**Playback And Highlight Pipeline:**

1. `components/codeViewer/LazyCodeViewer.tsx` loads `components/CodeViewer.tsx` only when a player/editor is needed.
2. `components/codeViewer/useStrudelEditor.ts` creates a `StrudelMirror` instance, preloads Strudel audio and runtime modules, and injects CodeMirror extensions.
3. During playback, Strudel draw callbacks are converted into `PlaybackFrame` data by `components/strudelPlaybackHighlight.ts`.
4. The CodeMirror view receives decoration updates so active notes, note colors, and progressive fill match live playback.

**State Management:**
- Observed: application state is local React state in `hooks/useProjectState.ts` plus small UI-only state in `App.tsx` and `components/Sidebar.tsx`.
- Observed: config and track mutations are performed by passing `setConfig` and `setTracks` down the tree instead of using context or a separate store library.
- Observed: editor runtime state such as `isPlaying`, `isReady`, `audioError`, and `strudelError` lives inside `components/codeViewer/useStrudelEditor.ts`.
- `Inference`: the app follows a "single orchestration hook plus prop drilling" pattern rather than a store-driven or route-driven architecture.

## Key Abstractions

**`StrudelConfig`:**
- Purpose: central configuration contract for conversion, formatting, playback, quantization, and visuals.
- Examples: `types.ts`, `hooks/useProjectState.ts`, `components/sidebar/*.tsx`, `services/StrudelNotation.ts`
- Pattern: one shared config object flows from the orchestration hook into UI controls, storage, and notation services.

**`Track` / `Note`:**
- Purpose: normalized internal music model after MIDI parsing.
- Examples: `types.ts`, `services/MidiParser.ts`, `services/notation/*.ts`, `components/sidebar/TrackList.tsx`
- Pattern: parsed once, then mutated only through UI overrides such as `hidden`, `sound`, `color`, `trackVisualMethod`, and `drumBank`.

**`StrudelNotation`:**
- Purpose: public facade for the conversion pipeline.
- Examples: `services/StrudelNotation.ts`
- Pattern: class wrapper with a single `generate(tracks)` entry point that delegates to renderer and utility modules under `services/notation/`.

**`PlaybackFrame`:**
- Purpose: derived playback-highlight snapshot for CodeMirror decorations.
- Examples: `components/strudelPlaybackHighlight.ts`, `components/codeViewer/useStrudelEditor.ts`
- Pattern: Strudel draw callbacks are normalized into immutable frame objects before decoration updates are dispatched to the editor.

**Sidebar Section Primitives:**
- Purpose: keep sidebar controls visually and structurally consistent.
- Examples: `components/sidebar/SidebarShared.tsx`, `components/sidebar/configUpdates.ts`
- Pattern: shared primitives plus tiny config-update helpers; each section keeps its own business rules.

## Entry Points

**Browser Entry:**
- Location: `index.tsx`
- Triggers: module script from `index.html`
- Responsibilities: create the React root and mount `AppWithBoundary`.

**Application Root:**
- Location: `App.tsx`
- Triggers: initial render from `index.tsx`
- Responsibilities: initialize `useProjectState`, switch between empty and workspace screens, host the hidden file input, keep mobile sidebar open and closed state.

**Workspace Mode:**
- Location: `components/app/WorkspaceScreen.tsx`
- Triggers: `tracks.length > 0` in `App.tsx`
- Responsibilities: render `components/Sidebar.tsx`, show recoverable errors, and lazy-load the code viewer.

**Empty-State Mode:**
- Location: `components/app/EmptyStateScreen.tsx`
- Triggers: `tracks.length === 0` in `App.tsx`
- Responsibilities: explain the product, offer drag-and-drop upload, preview an example player, and load bundled example MIDIs.

**Editor Bundle Entry:**
- Location: `components/codeViewer/LazyCodeViewer.tsx`
- Triggers: `Suspense` boundaries in `components/app/WorkspaceScreen.tsx` and `components/app/EmptyStateScreen.tsx`
- Responsibilities: split the heavy Strudel editor/player runtime out of the initial bundle.

## Error Handling

**Strategy:** Recoverable user-facing failures become transient string state or local editor errors, while render-time crashes fall back to a full-screen error boundary.

**Patterns:**
- `hooks/useProjectState.ts` catches MIDI parse and example fetch failures, logs them with `console.error`, and exposes the message through `error`.
- `components/app/AppErrorBanner.tsx` renders recoverable errors inline and lets the user dismiss them.
- `components/app/AppErrorBoundary.tsx` catches render crashes and offers a full page reload.
- `components/codeViewer/useStrudelEditor.ts` keeps `audioError` and `strudelError` separate from the app-wide error banner because playback failures do not necessarily invalidate project state.
- `services/projectStorage.ts` and `components/Sidebar.tsx` swallow storage failures and malformed JSON rather than surfacing them to the UI.

## Cross-Cutting Concerns

**Logging:** Direct `console.error` and `console.warn` calls are used in `hooks/useProjectState.ts`, `components/codeViewer/useStrudelEditor.ts`, `components/CodeViewer.tsx`, `components/app/AppErrorBoundary.tsx`, and `services/notation/DrumRenderer.ts`.

**Validation:** File type checks live in `components/DropZone.tsx`; MIDI parsing guards live in `services/MidiParser.ts`; persisted config sanitization lives in `services/projectStorage.ts`; numeric UI inputs are clamped through `components/sidebar/SidebarShared.tsx`.

**Authentication:** Not detected. The app is a purely client-side tool with no auth provider or protected backend.

---

*Architecture analysis: 2026-03-27*
