# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Quick commands (npm)
- Install dependencies: npm install
- Start dev server: npm run dev
  - Vite serves on http://localhost:8080 (vite.config.ts sets host "::" and port 8080)
- Build production: npm run build
- Build (development mode): npm run build:dev
- Preview built app: npm run preview
- Lint: npm run lint
- Type-check only: npx tsc --noEmit
- Tests: not configured in this repo (no test runner or test scripts present)

Note: Use npm for all installs and scripts in this repo. README also shows npm usage. If a bun.lockb exists, ignore it and use npm to avoid mismatched lockfiles.

## High-level architecture
- App entry and providers
  - src/main.tsx mounts <App /> to #root.
  - src/App.tsx wires global providers and routing: QueryClientProvider (TanStack Query), shadcn toasters, and React Router routes for "/" (Index) and a catch-all NotFound.
- Primary orchestration (src/pages/Index.tsx)
  - User uploads a MIDI file via <MidiUpload/>. The page orchestrates the pipeline:
    1) convertMidiToNotes(file) in src/lib/midiProcessor.ts parses the MIDI (via @tonejs/midi) and converts note timing to beats using detected tempo.
    2) generateBracketNotation(notes) in src/lib/bracketNotation.ts groups overlapping notes into bracket notation, injects rests (~), and formats durations (rounded to 4 decimals).
    3) calculateStatistics returns noteCount, restCount, and totalDuration (max release in beats).
    4) MidiPlayback is primed with notes to enable play/pause/reset and time updates for UI.
  - Page state: notes, bracketNotation, statistics, isProcessing, isPlaying, currentTime. It passes these to the timeline visualization and Strudel player.
- MIDI parsing and playback (src/lib/midiProcessor.ts)
  - analyzeMidiFile(file) extracts tempo, time signature, and basic track info if needed.
  - convertMidiToNotes(file, settings) filters notes by selected tracks, note range, and velocity threshold; returns a time-sorted Note[] where time units are beats.
  - MidiPlayback uses Tone.js PolySynth to schedule notes relative to a startTime; provides play(), pause(), reset(), and a requestAnimationFrame loop to publish currentTime. It computes total duration from note releases and stops automatically at the end.
- Bracket notation generation (src/lib/bracketNotation.ts)
  - midiNumberToNoteName maps MIDI numbers to note names (e.g., C4).
  - groupOverlappingNotes clusters notes that overlap in time. generateGroupNotation emits either a simple NAME@duration or a bracketed list [ ... ]@bracketLength with internal rests/padding represented as ~@duration.
- Visualization and audio output
  - src/components/TimelineVisualization.tsx renders a piano-roll-like view:
    - Groups notes by octave; positions blocks along a fixed-width timeline; highlights blocks that are active at currentTime.
  - src/components/StrudelPlayer.tsx translates bracketNotation to Strudel code note(`...`).piano():
    - Dynamically imports @strudel/* modules; initializes audio on first user interaction; exposes evaluate() to play and stop() to silence via Pattern.silence(). Includes copy/download helpers for the notation.
- UI & utilities
  - src/components/MidiUpload.tsx uses react-dropzone; validates .mid/.midi/.mid.rtx; forwards the selected File.
  - shadcn-ui components live under src/components/ui; Tailwind styles are extended with a musical palette in tailwind.config.ts.
  - src/lib/utils.ts provides cn() for class merging.

## Tooling and configuration
- Vite (vite.config.ts)
  - React SWC plugin; lovable-tagger only in development mode.
  - Dev server host "::" (IPv6 all interfaces), port 8080.
  - Path alias: "@" -> ./src (also configured in tsconfig paths).
- TypeScript
  - tsconfig.json references tsconfig.app.json and tsconfig.node.json; baseUrl "." with "@/*" -> "./src/*".
- ESLint
  - eslint.config.js uses @eslint/js + typescript-eslint; react-hooks and react-refresh plugins enabled. Script: npm run lint.
- Tailwind CSS
  - tailwind.config.ts scans ./src/**/* and includes tailwindcss-animate; custom CSS variables define the musical palette used by the timeline.

## Notes for Warp
- Use npm for installs, scripts, and tooling (as used by this project). Do not switch package managers.
- Dev server is accessible at http://localhost:8080. Host "::" allows access from other devices on the network if needed.
- Imports frequently use the "@" alias for src/.
- Audio starts on first user interaction due to browser policies; the code initializes the audio context on first click automatically via @strudel/webaudio.

