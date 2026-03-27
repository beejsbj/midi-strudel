# Codebase Structure

**Analysis Date:** 2026-03-27

Observed facts below cite concrete files. Items labeled `Inference` are placement rules derived from the current file layout.

## Directory Layout

```text
midi-strudel/
├── .planning/codebase/     # Generated architecture and planning maps
├── components/             # React UI modules, grouped by UI surface
│   ├── app/                # Top-level screens, example metadata, error UI
│   ├── codeViewer/         # Embedded Strudel editor/player helpers
│   ├── sidebar/            # Sidebar sections and shared form primitives
│   └── __tests__/          # Component tests near the feature area
├── hooks/                  # Reusable React hooks, including app orchestration
│   └── __tests__/          # Hook tests
├── public/                 # Static assets served by Vite
│   └── examples/           # Example `.mid` files fetched by the empty state
├── services/               # MIDI parsing, key detection, storage, notation facade
│   ├── notation/           # Notation rendering pipeline internals
│   └── __tests__/          # Service tests near the feature area
├── App.tsx                 # Root app component
├── index.tsx               # Browser bootstrap
├── types.ts                # Shared domain and config types
├── constants.ts            # Shared musical and instrument constants
├── index.html              # Vite HTML shell and global CSS
└── *.md / *.config.*       # Project references and tool configuration
```

## Directory Purposes

**`components/`:**
- Purpose: UI modules that render the app shell, player, upload flow, and controls.
- Contains: root-level reusable UI like `components/CodeViewer.tsx`, `components/Sidebar.tsx`, `components/DropZone.tsx`, and `components/strudelPlaybackHighlight.ts`.
- Key files: `components/CodeViewer.tsx`, `components/Sidebar.tsx`, `components/DropZone.tsx`, `components/strudelPlaybackHighlight.ts`

**`components/app/`:**
- Purpose: top-level screen composition and app-specific UI states.
- Contains: workspace and empty-state screens, error boundary and banner, example metadata.
- Key files: `components/app/WorkspaceScreen.tsx`, `components/app/EmptyStateScreen.tsx`, `components/app/AppErrorBoundary.tsx`, `components/app/examples.ts`

**`components/codeViewer/`:**
- Purpose: internal helpers for the embedded Strudel editor/player.
- Contains: lazy bundle loader, editor hook, toolbar, alerts.
- Key files: `components/codeViewer/LazyCodeViewer.tsx`, `components/codeViewer/useStrudelEditor.ts`, `components/codeViewer/CodeViewerToolbar.tsx`, `components/codeViewer/CodeViewerAlerts.tsx`

**`components/sidebar/`:**
- Purpose: configuration panels and shared sidebar form primitives.
- Contains: playback, format, quantization, visuals, track controls, and helper components for consistent controls.
- Key files: `components/sidebar/PlaybackSettings.tsx`, `components/sidebar/TrackList.tsx`, `components/sidebar/SidebarShared.tsx`, `components/sidebar/configUpdates.ts`

**`hooks/`:**
- Purpose: reusable React hooks.
- Contains: the main orchestration hook plus a generic debounce hook.
- Key files: `hooks/useProjectState.ts`, `hooks/useDebouncedValue.ts`

**`services/`:**
- Purpose: non-UI logic for parsing, analysis, persistence, and notation generation.
- Contains: MIDI parser, key detector, storage helpers, notation facade.
- Key files: `services/MidiParser.ts`, `services/KeyDetector.ts`, `services/projectStorage.ts`, `services/StrudelNotation.ts`

**`services/notation/`:**
- Purpose: internal modules behind `services/StrudelNotation.ts`.
- Contains: renderers and helpers for note preparation, grid building, melodic and drum formatting.
- Key files: `services/notation/NotationUtils.ts`, `services/notation/GridBuilder.ts`, `services/notation/MelodicRenderer.ts`, `services/notation/DrumRenderer.ts`

**`public/`:**
- Purpose: static assets that Vite serves directly.
- Contains: icons, manifest files, OG images, and example MIDI files.
- Key files: `public/examples/ruthlessness-epic-the-musical.mid`, `public/examples/warrior-of-the-mind-epic-the-musical.mid`, `public/site.webmanifest`

## Key File Locations

**Entry Points:**
- `index.tsx`: browser bootstrap that mounts the React app.
- `App.tsx`: root component that wires `hooks/useProjectState.ts` into the two screen modes.
- `components/app/WorkspaceScreen.tsx`: loaded-project workspace shell.
- `components/app/EmptyStateScreen.tsx`: landing and upload shell before any track exists.

**Configuration:**
- `package.json`: scripts and runtime dependencies.
- `vite.config.ts`: React plugin, dev server config, bundle chunking, `@` alias.
- `tsconfig.json`: TypeScript compiler settings and matching `@/*` path alias.
- `eslint.config.mjs`: lint rules for TypeScript and React hooks.
- `index.html`: Vite HTML template, metadata, fonts, Tailwind CDN config, and global editor CSS.

**Core Logic:**
- `hooks/useProjectState.ts`: app-level state orchestration, parsing, persistence, and code generation.
- `services/MidiParser.ts`: file-to-track normalization.
- `services/KeyDetector.ts`: key estimation from parsed notes.
- `services/StrudelNotation.ts`: public notation generation entry point.
- `services/notation/*.ts`: conversion internals for timing, grids, melodic rendering, and drum rendering.
- `components/codeViewer/useStrudelEditor.ts`: embedded editor and playback runtime.
- `components/strudelPlaybackHighlight.ts`: CodeMirror playback decoration logic.
- `types.ts`: shared `Note`, `Track`, `KeySignature`, and `StrudelConfig` contracts.
- `constants.ts`: musical constants, drum mappings, and instrument auto-mapping helpers.

**Testing:**
- `components/__tests__/strudelPlaybackHighlight.test.ts`: playback highlight behavior.
- `components/app/__tests__/EmptyStateScreen.test.tsx`: empty-state rendering.
- `components/codeViewer/__tests__/useStrudelEditor.test.tsx`: editor hook behavior.
- `hooks/__tests__/useProjectState.test.tsx`: orchestration hook behavior.
- `services/__tests__/projectStorage.test.ts`, `services/__tests__/KeyDetector.test.ts`: service-level tests.
- `services/notation/__tests__/*.test.ts`: notation pipeline tests.

**Project References:**
- `README.md`: project overview and local development commands.
- `strudel-notation-history.md`: notation exploration history.
- `strudel-notation-project-prompt.md`: extracted project spec or prompt.
- `strudel-reference.md`: Strudel reference material kept in-repo.

## Naming Conventions

**Files:**
- Use `PascalCase.tsx` for React components and screen modules, such as `App.tsx`, `components/Sidebar.tsx`, and `components/sidebar/PlaybackSettings.tsx`.
- Use `camelCase.ts` for hooks, utilities, and service modules, such as `hooks/useProjectState.ts`, `services/projectStorage.ts`, and `components/sidebar/configUpdates.ts`.
- Use `use*.ts` for hooks and hook-adjacent helpers, such as `hooks/useDebouncedValue.ts` and `components/codeViewer/useStrudelEditor.ts`.
- Use descriptive suffixes for notation internals, such as `*Renderer.ts`, `*Builder.ts`, and `*Utils.ts` under `services/notation/`.
- Put tests in `__tests__` directories and mirror the source module name, such as `services/notation/__tests__/MelodicRenderer.test.ts`.

**Directories:**
- Group UI by surface under `components/` rather than by generic type: `components/app/`, `components/codeViewer/`, and `components/sidebar/`.
- Keep notation-specific logic under `services/notation/` instead of spreading it across general-purpose utility folders.
- Keep shared app-wide domain files at the repo root: `types.ts` and `constants.ts`.

## Notable Quirks

- Observed: there is no `src/` directory; runtime source files live at the repository root in `App.tsx`, `index.tsx`, `components/`, `hooks/`, and `services/`.
- Observed: `vite.config.ts` and `tsconfig.json` define an `@` alias to the repo root, but the current source files mostly use relative imports.
- Observed: `types.ts` and `constants.ts` are root-level shared modules imported by both the UI and service layers.
- Observed: the heavy Strudel player bundle is split with `components/codeViewer/LazyCodeViewer.tsx` instead of loading the editor eagerly.
- `Inference`: placement is feature-oriented inside `components/`, but root-level shared files mean some cross-area imports remain broad.

## Where To Add New Code

**New Feature:**
- Primary code: add top-level screen flow in `components/app/`, sidebar controls in `components/sidebar/`, editor behavior in `components/codeViewer/`, and conversion logic in `services/` or `services/notation/`.
- Tests: add the test in the nearest matching `__tests__` directory, keeping the filename aligned with the implementation name.

**New Component Or Module:**
- Implementation: colocate by UI surface instead of creating a generic shared folder. Use `components/app/` for screen-only pieces, `components/sidebar/` for control panels and control primitives, and `components/codeViewer/` for player/editor subparts.

**Utilities:**
- Shared helpers: keep notation helpers in `services/notation/`, sidebar control primitives in `components/sidebar/SidebarShared.tsx`, and config mutation helpers in `components/sidebar/configUpdates.ts`.
- `Inference`: if a helper serves only one area, create it beside that area instead of introducing a new top-level `utils/` directory, because the current repo does not use a general utility folder.

**Shared Contracts And Constants:**
- Types that need to cross UI and services belong in `types.ts`.
- Musical dictionaries or auto-mapping tables that need to cross UI and services belong in `constants.ts`.

## Special Directories

**`public/examples/`:**
- Purpose: bundled example MIDI files referenced by `components/app/examples.ts`.
- Generated: No
- Committed: Yes

**`services/notation/`:**
- Purpose: internal conversion pipeline behind `services/StrudelNotation.ts`.
- Generated: No
- Committed: Yes

**`components/**/__tests__/`, `hooks/__tests__/`, `services/**/__tests__/`:**
- Purpose: colocated test coverage by feature area rather than one central test root.
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-03-27*
