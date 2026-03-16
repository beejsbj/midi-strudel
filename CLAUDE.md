# CLAUDE.md

This file gives repository-specific guidance to coding agents working in `midi-strudel`.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
npm run typecheck
npm run lint
```

The dev server is configured for `http://localhost:3000`.

## Architecture

This is a React + TypeScript + Vite SPA for converting MIDI files into Strudel notation and previewing the generated result in an embedded Strudel editor/player.

### Main flow

1. A MIDI file is loaded from the drop zone, hidden file input, or an example asset.
2. `parseMidiFile` converts it into `Track[]` plus BPM/time signature metadata.
3. `detectKey` estimates a musical key and stores a normalized confidence score.
4. `useProjectState` persists `config` and `tracks`, and recomputes generated code with `StrudelNotation`.
5. The sidebar updates config/track overrides, and `CodeViewer` renders or plays the current Strudel output.

### Important files

- `App.tsx` wires the top-level shell and screen switching.
- `hooks/useProjectState.ts` owns project hydration, persistence, load/clear actions, and generated code.
- `services/projectStorage.ts` contains config sanitization and localStorage helpers.
- `services/StrudelNotation.ts` is the notation entry point.
- `services/notation/` contains focused notation helpers/renderers.
- `components/codeViewer/useStrudelEditor.ts` owns Strudel editor lifecycle and playback wiring.
- `components/Sidebar.tsx` plus `components/sidebar/` contain settings UI.

### Tests

Vitest covers the notation pipeline and project-storage/key-detection contracts.

Primary test areas:

- `services/notation/__tests__/`
- `services/__tests__/KeyDetector.test.ts`
- `services/__tests__/projectStorage.test.ts`

## Repo notes

- Keep historical markdown files in place unless explicitly asked to remove them.
- Prefer `npm` commands when documenting or verifying this repo, since the lockfile and current workflow are npm-based.
