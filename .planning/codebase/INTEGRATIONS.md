# External Integrations

**Analysis Date:** 2026-03-27

## APIs & External Services

**Audio / Music Runtime:**
- Strudel browser runtime - the embedded editor, evaluator, and playback system are initialized in `components/codeViewer/useStrudelEditor.ts`.
  - SDK/Client: `@strudel/codemirror`, `@strudel/core`, `@strudel/draw`, `@strudel/mini`, `@strudel/tonal`, `@strudel/transpiler`, `@strudel/webaudio`, `@strudel/soundfonts`
  - Auth: Not applicable
- GitHub Raw sample manifests - `components/codeViewer/useStrudelEditor.ts` loads JSON sample definitions from `https://raw.githubusercontent.com/felixroos/dough-samples/main/`.
  - SDK/Client: dynamic `StrudelCore.samples(...)` usage in `components/codeViewer/useStrudelEditor.ts`
  - Auth: None detected

**External Web Sites:**
- Strudel website - documentation links are rendered in `components/app/EmptyStateScreen.tsx`, and generated code can be opened in a new tab from `components/CodeViewer.tsx`.
  - SDK/Client: browser anchors plus `window.open('https://strudel.cc/#...')`
  - Auth: None detected
- Online Sequencer - example source attribution links are defined in `components/app/examples.ts` and rendered in `components/app/EmptyStateScreen.tsx`.
  - SDK/Client: plain anchors
  - Auth: None detected

**Runtime UI Assets:**
- Tailwind Play CDN - utility styling is loaded from `https://cdn.tailwindcss.com` in `index.html`.
  - SDK/Client: global `tailwind` browser script configured inline in `index.html`
  - Auth: None detected
- Google Fonts - `IBM Plex Mono` and `Space Grotesk` are imported via `@import` in `index.html`.
  - SDK/Client: CSS font import
  - Auth: None detected

## Browser Platform Integrations

**File Handling:**
- Local MIDI upload uses a hidden file input in `App.tsx` plus drag-and-drop/file input handling in `components/DropZone.tsx`.
- Uploaded/example files stay in the browser. `services/MidiParser.ts` reads each `File` with `file.arrayBuffer()` and parses it locally with `@tonejs/midi`.
- Example MIDI loading uses `fetch`, `Response.blob()`, and `new File(...)` in `hooks/useProjectState.ts` to turn `public/examples/*.mid` assets into browser `File` objects.
- No `showOpenFilePicker`, `showSaveFilePicker`, or server-side file upload endpoint was detected.

**Browser APIs:**
- `localStorage` persists project config and tracks in `services/projectStorage.ts`.
- `localStorage` also stores sidebar collapse state in `components/Sidebar.tsx`.
- `navigator.clipboard.writeText(...)` copies generated code in `components/CodeViewer.tsx`.
- `window.open(...)` exports generated code to the hosted Strudel editor in `components/CodeViewer.tsx`.
- `window.location.reload()` is used as an error-boundary recovery action in `components/app/AppErrorBoundary.tsx`.
- `public/site.webmanifest` is linked from `index.html`, so the app exposes install metadata for standalone browser use.
- No service worker, `indexedDB`, `sessionStorage`, `BroadcastChannel`, `WebSocket`, or `EventSource` usage was detected.

## Audio & MIDI Integrations

**MIDI Parsing:**
- File-based MIDI parsing is implemented in `services/MidiParser.ts` with `@tonejs/midi`.
- The parser reads tempo, time signature, notes, instrument family, channel, and percussion flags from MIDI track metadata in `services/MidiParser.ts`.
- Internal note/key/drum processing then continues in `services/KeyDetector.ts`, `services/StrudelNotation.ts`, and `services/notation/*.ts`.

**Audio Playback:**
- Browser audio output is driven by `@strudel/webaudio` in `components/codeViewer/useStrudelEditor.ts`.
- Playback initialization explicitly waits for a user gesture through `initAudioOnFirstClick()` in `components/codeViewer/useStrudelEditor.ts`.
- Sound sources are registered with `registerSynthSounds()` and `registerSoundfonts()` in `components/codeViewer/useStrudelEditor.ts`.
- The editor syncs playback highlighting to current audio time using `getAudioContext().currentTime` in `components/codeViewer/useStrudelEditor.ts`.

**Not Detected:**
- No live MIDI device integration. There is no `navigator.requestMIDIAccess` usage anywhere in the repo.
- No microphone/media capture. There is no `navigator.mediaDevices` or recording pipeline.
- No backend audio rendering, offline export service, or remote transcription API.

## Data Storage

**Databases:**
- Not detected.
  - Connection: Not applicable
  - Client: Not applicable

**File Storage:**
- Static bundled assets live under `public/`, including `public/examples/ruthlessness-epic-the-musical.mid`, `public/examples/warrior-of-the-mind-epic-the-musical.mid`, icons, and `public/site.webmanifest`.
- User-provided MIDI files are transient browser `File` objects handled in `components/DropZone.tsx`, `App.tsx`, and `hooks/useProjectState.ts`.

**Caching:**
- Browser `localStorage` only, via `services/projectStorage.ts` and `components/Sidebar.tsx`.
- No `indexedDB`, service-worker cache, Redis, or external cache service was detected.

## Authentication & Identity

**Auth Provider:**
- None.
  - Implementation: no login flow, session state, token storage, OAuth client, or auth SDK references were found in `package.json`, `hooks/`, `services/`, or `components/`.

## Monitoring & Observability

**Error Tracking:**
- None detected.

**Logs:**
- Browser console logging only.
  - `console.error(...)` appears in `hooks/useProjectState.ts`, `components/CodeViewer.tsx`, and `components/codeViewer/useStrudelEditor.ts`.
  - `console.warn(...)` appears in `services/notation/DrumRenderer.ts`.

## CI/CD & Deployment

**Hosting:**
- Observed: no hosting configuration files were detected. `vercel.json`, `netlify.toml`, `wrangler.toml`, `Dockerfile*`, `Procfile`, and `.github/workflows/*` are absent.
- Inference: any static host that can serve a Vite build should work, because `package.json` exposes `vite build` and no backend runtime exists in the repository.

**CI Pipeline:**
- None detected in-repo.

## Environment Configuration

**Required env vars:**
- None detected. No `.env` files, `import.meta.env`, `process.env`, or `VITE_*` lookups were observed.

**Secrets location:**
- Not applicable.

## Webhooks & Callbacks

**Incoming:**
- None.

**Outgoing:**
- Local static asset fetches: `hooks/useProjectState.ts` requests example MIDI files from `/examples/*.mid`.
- Remote sample-manifest fetches: `components/codeViewer/useStrudelEditor.ts` loads JSON sample definitions from GitHub Raw.
- Browser navigations/new tabs: `components/CodeViewer.tsx` opens `https://strudel.cc/` with encoded code; `components/app/EmptyStateScreen.tsx` links to `https://strudel.cc/`, Strudel docs, and `https://onlinesequencer.net/...`.
- No webhook sender, signed callback flow, or server-to-server integration was detected.

## Application Boundary

**Observed Absences:**
- No backend/API layer: no Express, Hono, Koa, Fastify, server routes, or server entry files were detected.
- No database layer: no Prisma, Drizzle, SQLite, Postgres, MySQL, MongoDB, or ORM client references were detected.
- No auth layer: no Clerk, Auth0, NextAuth, JWT, session, or OAuth references were detected.
- No webhook layer: no inbound webhook handlers or outbound webhook clients were detected.
- The repository is a browser-only Vite application rooted at `index.tsx`, `App.tsx`, `components/`, `hooks/`, and `services/`.

---

*Integration audit: 2026-03-27*
