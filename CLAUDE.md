# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Start dev server at http://localhost:3000
bun run build        # Production build
bun run test         # Run all tests (vitest)
bun run test -- services/notation/__tests__/NotationUtils.test.ts  # Run a single test file
```

## Architecture

This is a MIDI-to-Strudel converter — a React + TypeScript + Vite SPA that parses MIDI files, converts them to [Strudel](https://strudel.cc/) live-coding notation, and embeds a full Strudel player with CodeMirror editor.

### Data flow

1. User drops a `.mid` file → `MidiParser` → `Track[]` + detected BPM/time sig
2. `KeyDetector` runs Krumhansl-Schmuckler algorithm on the `Track[]` to detect `KeySignature`
3. `App.tsx` holds `StrudelConfig` + `Track[]` in state (persisted to `localStorage`)
4. `StrudelNotation.generate(tracks)` → Strudel code string (recomputed via `useMemo` on any config/track change)
5. `CodeViewer` renders the code in an embedded `StrudelMirror` editor with live playback

### Key types (`types.ts`)

- `Note` — single MIDI note with `noteOn`/`noteOff` in seconds, `midi` number, `velocity 0-1`
- `Track` — array of `Note[]` plus metadata (name, sound, color, isDrum, hidden, per-track visual override)
- `StrudelConfig` — all conversion/playback settings; `DEFAULT_CONFIG` is the source of truth for defaults
- `KeySignature` — root, type (major/minor), confidence, averageOctave

### Notation pipeline (`services/notation/`)

`StrudelNotation` (entry point) delegates to:
- `NotationUtils.ts` — pure math/formatting helpers: `getCycleDuration`, `prepareNotes` (quantization), `formatNoteVal`, `getRelativeDegree`, `buildVisualSuffix`, rest token helpers
- `GridBuilder.ts` — LCM/GCD grid construction; produces absolute (`renderMeasureAbsolute`) or subdivision (`renderMeasureSubdivision`) measure strings
- `DrumRenderer.ts` — maps MIDI drum notes via General MIDI drum map to Strudel sample names
- `MelodicRenderer.ts` — `splitMelodyHarmony` separates notes into melody (non-overlapping) and harmony (chords); `renderSequence` builds the token stream per voice

### Strudel integration (`components/CodeViewer.tsx`)

Embeds `@strudel/codemirror`'s `StrudelMirror` editor. The editor instance is stored in a ref and accessed via a typed `StrudelEditorInstance` interface. On mount, `prebake` loads all Strudel modules and soundfonts. Code changes propagate to the editor via `setEditorContent`; if playing, the pattern is re-evaluated.

Custom CodeMirror extensions injected into the editor:
- `durationPlugin` — dims `@0.25`-style duration annotations
- `strudelPlaybackHighlightExtension` (`components/strudelPlaybackHighlight.ts`) — highlights active notes during playback using `StateField`s and `EditorView.decorations`; supports note coloring (hue from pitch class), progressive fill (conic gradient), and pattern text coloring

### Sidebar

`Sidebar.tsx` composes section components from `components/sidebar/`:
- `PlaybackSettings` — BPM, key, time signature, notation type (absolute/relative)
- `FormatSettings` — cycle unit, duration style, format-per-line
- `QuantizationSettings` — snap-to-grid options
- `GeneralOptions` — sound mapping, velocity
- `VisualsSection` — visual methods (pianoroll, punchcard, spiral, pitchwheel, spectrum), visual scope, and coloring toggles
- `TrackList` — per-track sound, color swatch, visual override, hide/show

### Visual methods

Visual methods in `StrudelConfig.visualMethods` map to Strudel's draw functions. When `visualScope === 'inline'`, the function is prefixed with `_` (e.g., `._pianoroll()`) to render inline. Per-track overrides in `Track.trackVisualMethod` take precedence over the global array. `.color()` is always emitted before visual methods in `buildVisualSuffix`.

### Tests

Tests live in `services/notation/__tests__/` and use Vitest. They cover `NotationUtils`, `GridBuilder`, `MelodicRenderer`, and `DrumRenderer`.
