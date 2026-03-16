<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# midi-strudel

`midi-strudel` converts MIDI files into [Strudel](https://strudel.cc/) live-coding notation, lets you preview the generated code in an embedded Strudel player, and gives you a fast path into the Strudel REPL for further tweaking.

Version `1.0.0` is the first cleanup-and-release pass: the app behavior is largely the same, but the repo structure, tests, tooling, and docs are now meant to be stable enough to maintain.

> Complex MIDI files still need human taste. Treat the generated output as a strong starting point, not a final score.

## What It Does

- Parses `.mid` and `.midi` files in the browser
- Detects tempo, time signature, drum tracks, and a likely musical key
- Converts tracks into Strudel-friendly melody/harmony output
- Supports absolute notes or relative scale-degree notation
- Lets you tune playback, quantization, formatting, visuals, and per-track mapping
- Embeds a Strudel editor/player so you can hear and inspect the result immediately

## Getting Started

### Local development

```bash
npm install
npm run dev
```

The Vite dev server runs on [http://localhost:3000](http://localhost:3000).

### Quality checks

```bash
npm test
npm run build
npm run typecheck
npm run lint
```

## Project Structure

- `App.tsx` handles the top-level app shell and screen orchestration.
- `hooks/useProjectState.ts` owns project loading, persistence, and generated-code recomputation.
- `components/Sidebar.tsx` and `components/sidebar/` contain the settings UI.
- `components/CodeViewer.tsx` and `components/codeViewer/` contain the embedded Strudel editor/player.
- `services/StrudelNotation.ts` is the public notation entry point; detailed rendering lives under `services/notation/`.

## Notes On Output

The converter is built around Strudel’s cycle-based timing model.

- `@0.25` means one quarter of a cycle
- `~` is a rest
- melody and harmony are emitted as separate patterns when overlap requires it
- relative mode uses `n(...).scale(...)`
- absolute mode uses `.as("note")`

The historical markdown files in the repo are still intentionally kept:

- `Working out strudel notation and prompt.md` is the original notation-history/workshopping document.
- `strudel-reference.md` is a Strudel syntax/reference note used during development.

## Known Limitations

- Dense polyphony can still need manual cleanup after conversion
- Drum mapping is intentionally conservative and only covers known mappings
- Multi-tempo MIDI files are flattened to a single playback tempo
- Quantization is useful, but aggressive settings can make output feel less musical
- The embedded Strudel/audio bundle is still heavy relative to the rest of the app

## v1.0.0 Release Notes

- Normalized key-confidence handling and removed duplicate persisted key state
- Split the top-level app flow into smaller screen/state pieces
- Split the Strudel editor into a hook plus smaller UI components
- Replaced the CDN-style MIDI parser import with a package-managed dependency
- Added `lint` and `typecheck` scripts and refreshed the repo docs
