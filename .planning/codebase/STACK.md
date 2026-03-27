# Technology Stack

**Analysis Date:** 2026-03-27

## Languages

**Primary:**
- TypeScript `~5.8.2` - application code lives in `index.tsx`, `App.tsx`, `components/**/*.tsx`, `hooks/**/*.ts`, and `services/**/*.ts`.

**Secondary:**
- HTML - the app shell, runtime Tailwind setup, font imports, and global editor styles are defined in `index.html`.
- JSON - package and app metadata live in `package.json`, `tsconfig.json`, and `public/site.webmanifest`.
- CSS/Tailwind utility classes - styling is split between inline `<style>` rules in `index.html` and utility classes embedded directly in `App.tsx` and `components/**/*.tsx`.

## Runtime

**Environment:**
- Observed: the app targets a browser runtime. `tsconfig.json` includes `DOM` and `DOM.Iterable`, and browser APIs are used in `components/CodeViewer.tsx`, `components/DropZone.tsx`, `hooks/useProjectState.ts`, `services/projectStorage.ts`, and `components/codeViewer/useStrudelEditor.ts`.
- Observed: `package.json` sets `"type": "module"` and declares `"packageManager": "bun@1.2.17"`.
- Observed: no Node/Bun version pin file was detected. `.nvmrc`, `.node-version`, and `.tool-versions` are absent from the repository root.

**Package Manager:**
- Bun `1.2.17` is the declared package manager in `package.json`.
- npm commands are documented in `README.md` (`npm install`, `npm run dev`, `npm test`, `npm run build`, `npm run typecheck`, `npm run lint`).
- Lockfile: `bun.lock` and `package-lock.json` are both present.

## Frameworks

**Core:**
- React `^19.2.0` - the SPA is mounted in `index.tsx` and composed from `App.tsx` plus the `components/` tree.
- React DOM `^19.2.0` - browser rendering uses `ReactDOM.createRoot` in `index.tsx`.
- Vite `^6.2.0` - dev server and production bundler are configured in `vite.config.ts`.
- `@vitejs/plugin-react` `^5.0.0` - JSX/React support is enabled in `vite.config.ts`.
- Strudel `1.2.2` packages - the embedded live-coding editor and playback pipeline are assembled in `components/codeViewer/useStrudelEditor.ts`.

**Testing:**
- Vitest `^4.0.18` - test runner invoked by the `test` script in `package.json`.
- `@testing-library/react` `^16.3.2` - React component and hook tests live in `components/**/__tests__` and `hooks/__tests__`.
- `jsdom` `^24.1.3` - browser-like test runtime declared in `package.json`.

**Build/Dev:**
- TypeScript `~5.8.2` - type checking is run through `tsc --noEmit` from the `typecheck` script in `package.json`.
- ESLint `^9.39.4` - linting entry point is `eslint.config.mjs`, executed via the `lint` script in `package.json`.
- `typescript-eslint` `^8.57.0` - TypeScript lint rules are applied in `eslint.config.mjs`.
- `eslint-plugin-react-hooks` `^7.0.1` - React Hooks lint rules are enabled in `eslint.config.mjs`.
- Tailwind CSS Play CDN - runtime Tailwind is loaded from `<script src="https://cdn.tailwindcss.com"></script>` and configured inline in `index.html`; there is no local `tailwind.config.*` or Tailwind npm dependency.

## Key Dependencies

**Critical:**
- `@tonejs/midi` `^2.0.28` - parses uploaded/example MIDI data in `services/MidiParser.ts`.
- `@strudel/codemirror` `1.2.2` - provides the embedded Strudel editor in `components/codeViewer/useStrudelEditor.ts`.
- `@strudel/core` `1.2.2` - provides Strudel runtime helpers and sample loading in `components/codeViewer/useStrudelEditor.ts` and token helpers in `components/strudelPlaybackHighlight.ts`.
- `@strudel/draw` `1.2.2` - participates in Strudel evaluation/drawing in `components/codeViewer/useStrudelEditor.ts`.
- `@strudel/mini` `1.2.2` - mini-notation support is registered in `components/codeViewer/useStrudelEditor.ts`.
- `@strudel/tonal` `1.2.2` - tonal helpers are registered in `components/codeViewer/useStrudelEditor.ts`.
- `@strudel/transpiler` `1.2.2` - Strudel code compilation uses `transpiler` in `components/codeViewer/useStrudelEditor.ts`.
- `@strudel/webaudio` `1.2.2` - browser audio playback uses `getAudioContext`, `initAudioOnFirstClick`, and `webaudioOutput` in `components/codeViewer/useStrudelEditor.ts`.
- `@strudel/soundfonts` `1.2.2` - soundfont registration is performed in `components/codeViewer/useStrudelEditor.ts`.
- `react` and `react-dom` `^19.2.0` - UI rendering starts in `index.tsx`.

**Infrastructure:**
- `lucide-react` `^0.554.0` - icon set used throughout `components/Sidebar.tsx`, `components/DropZone.tsx`, `components/app/*.tsx`, and `components/codeViewer/*.tsx`.
- Vite manual chunking - `vite.config.ts` splits `@strudel/soundfonts`, `@strudel/*`/`@codemirror/*`, and `react`/`scheduler` into dedicated output chunks.
- Root alias `@` - `vite.config.ts` and `tsconfig.json` map `@/*` to the repository root because the project does not use a `src/` directory.

## Configuration

**Environment:**
- Observed: no `.env`, `.env.*`, or other environment config files were detected in the repository root.
- Observed: no `import.meta.env`, `process.env`, or `VITE_` references were found in application code.
- Use uploaded MIDI files plus browser-local state only; no runtime secret or service configuration is required by `hooks/useProjectState.ts` or `services/projectStorage.ts`.

**Build:**
- `package.json` defines the operational scripts: `dev`, `build`, `preview`, `lint`, `test`, and `typecheck`.
- `vite.config.ts` sets the dev server to `0.0.0.0:3000`, enables React, defines the `@` alias, and customizes Rollup chunks for Strudel-heavy bundles.
- `tsconfig.json` targets `ES2022`, uses `moduleResolution: "bundler"`, enables `react-jsx`, and includes all `**/*.ts` and `**/*.tsx` files outside `dist/` and `node_modules/`.
- `eslint.config.mjs` combines `@eslint/js`, `typescript-eslint`, browser/node globals, and React Hooks rules.
- `index.html` bootstraps Tailwind via CDN, imports Google Fonts, defines global CSS variables, and applies CodeMirror/Strudel-specific overrides.
- `public/site.webmanifest` provides standalone install metadata for the browser app.

## Important Entry And Config Files

**Entrypoints:**
- `index.tsx` - browser mount point.
- `App.tsx` - top-level stateful application shell.
- `components/app/WorkspaceScreen.tsx` - loaded workspace UI.
- `components/app/EmptyStateScreen.tsx` - first-run/upload landing screen.

**Core Services:**
- `hooks/useProjectState.ts` - orchestrates file loading, example fetching, storage persistence, and code generation.
- `services/MidiParser.ts` - converts MIDI files to internal track/note data.
- `services/StrudelNotation.ts` - converts tracks into Strudel-ish output.
- `components/codeViewer/useStrudelEditor.ts` - embeds and controls the Strudel editor/audio engine.

**Configuration Files:**
- `package.json`
- `vite.config.ts`
- `tsconfig.json`
- `eslint.config.mjs`
- `index.html`
- `public/site.webmanifest`

## Platform Requirements

**Development:**
- Observed: a Node.js-compatible package runtime or Bun is required to run the scripts in `package.json`.
- Observed: local development expects a modern browser with support for `File`, `Blob`, `fetch`, `localStorage`, `navigator.clipboard`, and Web Audio APIs used in `components/CodeViewer.tsx`, `hooks/useProjectState.ts`, `services/projectStorage.ts`, and `components/codeViewer/useStrudelEditor.ts`.

**Production:**
- Observed: the build target is a static client bundle produced by `vite build` from `package.json`.
- Inference: static hosting or CDN delivery is the intended deployment model because the repository contains no server framework, API routes, background jobs, or backend runtime files.

---

*Stack analysis: 2026-03-27*
