# Coding Conventions

**Analysis Date:** 2026-03-27

## Naming Patterns

**Files:**
- Use `PascalCase` for React component files and domain modules such as `App.tsx`, `components/CodeViewer.tsx`, `components/app/WorkspaceScreen.tsx`, `services/KeyDetector.ts`, and `services/StrudelNotation.ts`.
- Use `camelCase` with a `use` prefix for hooks such as `hooks/useProjectState.ts`, `hooks/useDebouncedValue.ts`, and `components/codeViewer/useStrudelEditor.ts`.
- Use lower camel or descriptive utility names for small helper modules such as `components/sidebar/configUpdates.ts` and `components/strudelPlaybackHighlight.ts`.
- Test files mirror the source name with `.test.ts` or `.test.tsx` in adjacent `__tests__` folders, for example `services/notation/__tests__/GridBuilder.test.ts`.

**Functions:**
- Use `camelCase` for functions and helpers such as `detectKey`, `parseMidiFile`, `loadConfigFromStorage`, `updateConfigValue`, and `getNotationConfigKey`.
- Prefix React event handlers with `handle` when they wrap UI events, as in `handleFileInputChange` and `handleExampleLoad` in `hooks/useProjectState.ts`.
- Prefix mutation helpers with `set`, `update`, `patch`, `load`, `save`, `clear`, or `get` to make intent explicit, as in `setTracks`, `updateTrackSound`, `patchConfig`, and `clearProjectStorage`.

**Variables:**
- Use `camelCase` for local values and refs, for example `fileInputRef`, `collapsedSections`, `audioReadyPromiseRef`, and `playbackSignatureRef`.
- Use `is*`, `has*`, and `active*` prefixes for booleans and status fields such as `isProcessing`, `isReady`, `hasError`, and `activeExampleId`.
- Use `UPPER_SNAKE_CASE` for exported constants such as `DEFAULT_CONFIG`, `CONFIG_STORAGE_KEY`, `TRACKS_STORAGE_KEY`, `DEFAULT_DEBOUNCE_MS`, and `PLAYBACK_PROGRESS_BUCKETS`.

**Types:**
- Use `PascalCase` interfaces for shared data shapes in `types.ts`, such as `Note`, `Track`, `KeySignature`, and `StrudelConfig`.
- Use local `Props` interfaces for component props, as seen across `components/Sidebar.tsx`, `components/sidebar/TrackList.tsx`, and `components/app/WorkspaceScreen.tsx`.
- Use small type aliases for narrow roles such as `SetConfig` in `components/sidebar/configUpdates.ts` and `InlineMetaToken` in `components/codeViewer/useStrudelEditor.ts`.

## Code Style

**Formatting:**
- TypeScript is the default style everywhere under `components/`, `hooks/`, and `services/`.
- Semicolons are used consistently.
- Single quotes are the dominant string style in files such as `App.tsx`, `hooks/useProjectState.ts`, and `services/projectStorage.ts`.
- Formatting is not mechanically standardized. Indentation and wrapping vary between files such as `vite.config.ts`, `services/MidiParser.ts`, and `components/sidebar/TrackList.tsx`.
- Not detected: `Prettier`, `Biome`, or another dedicated formatter config.

**Linting:**
- `eslint.config.mjs` is the only lint config. It composes `@eslint/js`, `typescript-eslint`, and `eslint-plugin-react-hooks`.
- The configured rules are lightweight: recommended JS rules, recommended TypeScript rules, React Hooks recommended rules, and `@typescript-eslint/no-unused-vars` with `_`-prefixed argument exemptions.
- No import-order rule, JSX a11y rule set, naming-convention rule, or formatter integration is configured in `eslint.config.mjs`.
- Observed fact: `npm run lint` is defined in `package.json`.
- Observed fact: lint could not be executed in this workspace because `node_modules/` is absent and the shell could not find `eslint`.

## Import Organization

**Order:**
1. React or React hooks are usually first, as in `App.tsx`, `components/Sidebar.tsx`, and `components/codeViewer/useStrudelEditor.ts`.
2. Third-party packages and local modules are mixed rather than strictly grouped. `components/Sidebar.tsx` imports `../types` before `lucide-react`, while `components/app/WorkspaceScreen.tsx` imports `lucide-react` before local modules.
3. Sibling and parent-relative imports dominate. Examples include `../services/projectStorage` in `hooks/useProjectState.ts` and `../../types` in `components/sidebar/TrackList.tsx`.

**Path Aliases:**
- `tsconfig.json` and `vite.config.ts` define the `@/*` alias.
- Observed fact: no source file under `App.tsx`, `components/`, `hooks/`, or `services/` currently uses the `@` alias. Relative imports are the working convention.

## Type Usage

**Observed facts:**
- Shared application types live centrally in `types.ts`.
- Components often import runtime values and types together, for example `import { StrudelConfig, Track } from '../../types';` in `components/sidebar/TrackList.tsx`.
- Type-only imports are used selectively, for example `import type { ChangeEvent } from 'react';` in `hooks/useProjectState.ts` and `import type { Track } from '../../types';` in `services/__tests__/KeyDetector.test.ts`.
- Generic helpers are used when mutating typed config fields, as in `updateConfigValue<K extends keyof StrudelConfig>` in `components/sidebar/configUpdates.ts`.

**Inference:**
- Extend `types.ts` first for shared domain models and keep ad hoc inline object types localized to one file. That matches the current split between shared models in `types.ts` and file-local support types in files like `components/codeViewer/useStrudelEditor.ts`.

## Error Handling

**Patterns:**
- Convert recoverable UI failures into user-facing string state. `hooks/useProjectState.ts` catches async errors, logs them, and sets `error` with a friendly fallback message.
- Fail fast for missing boot prerequisites. `index.tsx` throws when `#root` is missing.
- Swallow storage failures and return safe defaults in `services/projectStorage.ts`. `load*` functions fall back to `DEFAULT_CONFIG` or `[]`, and `save*` functions no-op on storage errors.
- Throw explicit `Error` objects from low-level parsing flows when a caller should surface the failure, as in `services/MidiParser.ts`.
- Use a React class error boundary for render crashes. `components/app/AppErrorBoundary.tsx` logs through `componentDidCatch` and renders a full-screen fallback.

## Logging

**Framework:** `console`

**Patterns:**
- Use `console.error` for unexpected failures in async or integration-heavy code, for example in `hooks/useProjectState.ts`, `components/codeViewer/useStrudelEditor.ts`, `components/CodeViewer.tsx`, and `components/app/AppErrorBoundary.tsx`.
- Use `console.warn` for tolerated but noteworthy domain issues, specifically unmapped drum notes in `services/notation/DrumRenderer.ts`.
- Not detected: centralized logger, log levels abstraction, analytics hook, or error reporting SDK.

## Comments

**When to Comment:**
- Comments are sparse in UI code such as `App.tsx`, `components/app/WorkspaceScreen.tsx`, and most files under `components/sidebar/`.
- Comments are used where domain reasoning would otherwise be opaque, especially in `services/MidiParser.ts`, `services/KeyDetector.ts`, and `services/StrudelNotation.ts`.
- Use comments to explain notation rules, timing math, and MIDI-specific heuristics rather than obvious control flow.

**JSDoc/TSDoc:**
- Rare. The clearest example is the file-level block in `services/StrudelNotation.ts`.
- Most exported functions and components rely on type signatures rather than docblocks.

## Function Design

**Size:** 
- Keep render-only components small and prop-driven, as in `components/app/WorkspaceScreen.tsx` and `components/app/AppErrorBanner.tsx`.
- Put orchestration and side effects into hooks or services. The main examples are `hooks/useProjectState.ts` and `components/codeViewer/useStrudelEditor.ts`.
- Keep reusable mutation helpers tiny and pure, as in `components/sidebar/configUpdates.ts` and `hooks/useDebouncedValue.ts`.

**Parameters:** 
- Use object parameters for hooks and complex APIs, as in `useProjectState({ examples, dependencies })` and `useStrudelEditor({ code, durationTagStyle, ... })`.
- Use positional parameters for math and renderer helpers in `services/notation/` and persistence helpers in `services/projectStorage.ts`.

**Return Values:** 
- Hooks return object bags of state, setters, refs, and commands, as in `useProjectState` and `useStrudelEditor`.
- Pure service helpers return typed primitives or typed objects, such as `detectKey`, `sanitizeConfig`, and `createPlaybackFrame`.
- Persistence helpers return defaults instead of `Result` or `Either` wrappers.

## Component Patterns

**Observed facts:**
- Components are mostly function components typed as `React.FC<Props>`, for example `components/Sidebar.tsx`, `components/CodeViewer.tsx`, and `components/sidebar/GeneralOptions.tsx`.
- The main exception is the class-based `AppErrorBoundary` in `components/app/AppErrorBoundary.tsx`.
- Props interfaces are file-local and usually named `Props`.
- Shared setter props are passed through the tree as `React.Dispatch<React.SetStateAction<...>>`, especially from `App.tsx` to `components/app/WorkspaceScreen.tsx` to `components/Sidebar.tsx` and then into sidebar subsections.
- Shared UI primitives for the sidebar live in `components/sidebar/SidebarShared.tsx`.
- Large or browser-heavy UI is lazily loaded rather than mounted directly, as seen in `components/codeViewer/LazyCodeViewer.tsx` and `components/app/WorkspaceScreen.tsx`.

**Inference:**
- Add new app-facing UI as a focused component with a local `Props` interface and keep shared controls inside `components/sidebar/SidebarShared.tsx` when the same interaction appears in multiple sidebar sections.

## Service Patterns

**Observed facts:**
- Domain logic is split by concern under `services/` and `services/notation/`.
- Pure helpers dominate the notation stack in files such as `services/notation/NotationUtils.ts`, `services/notation/GridBuilder.ts`, `services/notation/DrumRenderer.ts`, and `services/notation/MelodicRenderer.ts`.
- `services/StrudelNotation.ts` is the main class wrapper that coordinates the lower-level renderers.
- `hooks/useProjectState.ts` uses dependency injection through its `dependencies` option to make storage, parsing, and notation generation replaceable in tests.

**Inference:**
- Prefer adding pure helpers under `services/notation/` or `services/` and keep class wrappers thin. That is the current shape of the codebase, and the existing tests target pure helpers more heavily than wrappers.

## State Management

**Observed facts:**
- No external state library is used. Searches found no `createContext`, `useContext`, Redux, Zustand, Jotai, MobX, or Recoil usage in `App.tsx`, `components/`, `hooks/`, or `services/`.
- App-level state is centered in `hooks/useProjectState.ts`, which owns `config`, `tracks`, `error`, `activeExampleId`, and file-upload flow.
- Derived values are memoized with `useMemo`, and persistence is debounced through `useDebouncedValue` plus `useEffect` in `hooks/useProjectState.ts`.
- Component-local UI state stays local with `useState`, for example `isMobileSidebarOpen` in `App.tsx`, `confirmingClear` and `collapsedSections` in `components/Sidebar.tsx`, and copy/playback flags in `components/CodeViewer.tsx` and `components/codeViewer/useStrudelEditor.ts`.
- State is propagated via props instead of context. The clearest chain is `App.tsx` -> `components/app/WorkspaceScreen.tsx` -> `components/Sidebar.tsx` -> `components/sidebar/*`.

**Inference:**
- Extend `useProjectState` for new cross-screen state before introducing a second global mechanism. That aligns with the existing design and avoids splitting ownership across multiple stores.
- Be cautious about adding more prop drilling through the sidebar stack. The current approach is workable at this size but already pushes `setConfig`, `setTracks`, and `config` through several layers.

## Module Design

**Exports:** 
- Named exports are the default style across `components/`, `hooks/`, and `services/`.
- The only default export in the main source tree is `AppWithBoundary` from `App.tsx`.
- Utilities often export multiple helpers from a single file, as in `services/projectStorage.ts` and `components/sidebar/configUpdates.ts`.

**Barrel Files:** 
- Not detected. Imports target concrete files directly.

## Notable Inconsistencies

- Import grouping is not consistent between files such as `components/Sidebar.tsx` and `components/app/WorkspaceScreen.tsx`.
- String quoting and layout are mostly consistent, but spacing and wrapping vary in `vite.config.ts`, `services/MidiParser.ts`, and `components/sidebar/TrackList.tsx`.
- Type-only imports are used in some places, such as `hooks/useProjectState.ts`, but not consistently across the component tree.
- The `@` alias is configured in `tsconfig.json` and `vite.config.ts` but unused in source code.

---

*Convention analysis: 2026-03-27*
