# Testing Patterns

**Analysis Date:** 2026-03-27

## Test Framework

**Runner:**
- `Vitest` `^4.0.18`
- Config: no standalone `vitest.config.*` or `jest.config.*` file is present; tests rely on defaults plus the Vite base config in `vite.config.ts`

**Assertion Library:**
- `Vitest` `expect`
- `@testing-library/react` for DOM rendering, queries, events, and `act`, as seen in `hooks/__tests__/useProjectState.test.tsx`, `components/codeViewer/__tests__/useStrudelEditor.test.tsx`, and `components/app/__tests__/EmptyStateScreen.test.tsx`

**Run Commands:**
```bash
npm test                     # Runs `vitest run` from `package.json`
npx vitest                   # Watch mode is not scripted, but this is the default local command
npx vitest run --coverage    # Coverage command is not scripted or configured in package.json
```

**Workspace verification:**
- Observed fact: `npm test`, `npm run lint`, and `npm run typecheck` all fail in this workspace because `node_modules/` is absent and the shell cannot find `vitest`, `eslint`, or `tsc`.
- Inference: install dependencies before relying on any scripted quality checks in this worktree.

## Test File Organization

**Location:**
- Tests are colocated beside features in `__tests__` folders.
- Observed locations:
  `components/__tests__/`
  `components/app/__tests__/`
  `components/codeViewer/__tests__/`
  `hooks/__tests__/`
  `services/__tests__/`
  `services/notation/__tests__/`

**Naming:**
- Use `*.test.ts` for non-DOM code, for example `services/__tests__/projectStorage.test.ts`.
- Use `*.test.tsx` for DOM or hook rendering tests, for example `hooks/__tests__/useProjectState.test.tsx`.

**Structure:**
```text
components/
  __tests__/strudelPlaybackHighlight.test.ts
  app/__tests__/EmptyStateScreen.test.tsx
  codeViewer/__tests__/useStrudelEditor.test.tsx
hooks/
  __tests__/useProjectState.test.tsx
services/
  __tests__/KeyDetector.test.ts
  __tests__/projectStorage.test.ts
  notation/__tests__/DrumRenderer.test.ts
  notation/__tests__/GridBuilder.test.ts
  notation/__tests__/MelodicRenderer.test.ts
  notation/__tests__/NotationUtils.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('useProjectState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('debounces config persistence during rapid updates', () => {
    const saveConfig = vi.fn();

    render(<Harness dependencies={{ ... }} />);

    fireEvent.click(screen.getByRole('button', { name: 'increase-bpm' }));
    act(() => {
      vi.advanceTimersByTime(30);
    });

    expect(saveConfig).toHaveBeenCalledTimes(1);
  });
});
```

**Patterns:**
- Use `describe` blocks per module or behavior cluster, then narrow `it(...)` names to one observable behavior.
- Use local harness components for hooks and complex component hooks, as in `hooks/__tests__/useProjectState.test.tsx` and `components/codeViewer/__tests__/useStrudelEditor.test.tsx`.
- Use `beforeEach` and `afterEach` for timer setup, DOM cleanup, and mock resets only when needed.
- Keep most assertions behavior-first with `toEqual`, `toContain`, `toMatchObject`, `toHaveBeenCalledTimes`, and `not.toHaveBeenCalled`.

## Mocking

**Framework:** `vi.mock`, `vi.fn`, `vi.spyOn`

**Patterns:**
```typescript
vi.mock('@strudel/codemirror', () => ({
  StrudelMirror: class MockStrudelMirror {
    updateSettings = updateSettingsSpy;
    evaluate = async () => {
      evaluateSpy();
    };
  },
}));

const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
try {
  renderDrumTrack(track, beatDur, config);
  expect(warnSpy).toHaveBeenCalledOnce();
} finally {
  warnSpy.mockRestore();
}
```

**What to Mock:**
- Browser-heavy or third-party runtime integrations such as `@strudel/codemirror`, `@strudel/core`, `@strudel/webaudio`, and lazy editor components in `components/codeViewer/__tests__/useStrudelEditor.test.tsx` and `components/app/__tests__/EmptyStateScreen.test.tsx`.
- Console side effects that are part of the contract, as in `services/notation/__tests__/DrumRenderer.test.ts`.
- Time-dependent behavior with `vi.useFakeTimers()` and `vi.advanceTimersByTime(...)` in `hooks/__tests__/useProjectState.test.tsx`.

**What NOT to Mock:**
- Pure logic under `services/notation/` and `services/projectStorage.ts` is usually tested directly without module mocking.
- Algorithmic output is generally asserted from real function calls in `services/notation/__tests__/GridBuilder.test.ts`, `services/notation/__tests__/MelodicRenderer.test.ts`, `services/notation/__tests__/NotationUtils.test.ts`, and `services/__tests__/KeyDetector.test.ts`.

## Fixtures and Factories

**Test Data:**
```typescript
function makeNote(midi: number, noteOn: number, noteOff: number): Note {
  return { note: 'C4', midi, noteOn, noteOff, velocity: 0.8 };
}

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}
```

**Location:**
- Fixtures are defined inline inside each test file rather than shared globally.
- Representative examples:
  `TEST_TRACKS` in `hooks/__tests__/useProjectState.test.tsx`
  `createMemoryStorage` in `services/__tests__/projectStorage.test.ts`
  `makeNote` and `makeTrack` in `services/notation/__tests__/DrumRenderer.test.ts` and `services/notation/__tests__/MelodicRenderer.test.ts`

## Coverage

**Requirements:** 
- None enforced. No coverage threshold, no coverage provider config, and no coverage script were detected in `package.json`, `vite.config.ts`, or a dedicated Vitest config file.

**View Coverage:**
```bash
npx vitest run --coverage
```

**Observed limitations:**
- This command is not wired into `package.json`.
- Coverage could not be verified in this workspace because dependencies are not installed.

## Test Types

**Unit Tests:**
- Pure logic receives the most coverage.
- Strongly covered areas:
  `services/notation/__tests__/NotationUtils.test.ts`
  `services/notation/__tests__/GridBuilder.test.ts`
  `services/notation/__tests__/DrumRenderer.test.ts`
  `services/notation/__tests__/MelodicRenderer.test.ts`
  `services/__tests__/KeyDetector.test.ts`
  `services/__tests__/projectStorage.test.ts`
  `components/__tests__/strudelPlaybackHighlight.test.ts`

**Integration Tests:**
- Lightweight integration tests exist for hooks and browser-facing logic.
- Examples:
  `hooks/__tests__/useProjectState.test.tsx` exercises debounced persistence and notation regeneration boundaries through a render harness.
  `components/codeViewer/__tests__/useStrudelEditor.test.tsx` verifies editor playback coordination by mocking Strudel SDK dependencies.
  `components/app/__tests__/EmptyStateScreen.test.tsx` verifies the screen renders the lazy player placeholder immediately.

**E2E Tests:**
- Not used. No Playwright, Cypress, or browser automation config was detected.

## Common Patterns

**Async Testing:**
```typescript
await act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

act(() => {
  vi.advanceTimersByTime(50);
});
```

**Error Testing:**
```typescript
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
try {
  renderDrumTrack(track, beatDur, config);
  expect(warnSpy).toHaveBeenCalledOnce();
} finally {
  warnSpy.mockRestore();
}
```

## Coverage Patterns

**Observed strengths:**
- Pure musical notation logic is well represented through direct output assertions in `services/notation/__tests__/`.
- Hook behavior is tested through dependency injection rather than brittle global stubbing in `hooks/__tests__/useProjectState.test.tsx`.
- Expensive or browser-specific integrations are isolated behind mocks in `components/codeViewer/__tests__/useStrudelEditor.test.tsx`.

**Observed gaps:**
- No tests cover the app bootstrap in `index.tsx` or the top-level composition in `App.tsx`.
- The main shell UI is mostly untested: `components/Sidebar.tsx`, `components/CodeViewer.tsx`, `components/DropZone.tsx`, `components/app/WorkspaceScreen.tsx`, `components/app/AppErrorBanner.tsx`, and `components/app/AppErrorBoundary.tsx`.
- Most sidebar sections have no direct tests: `components/sidebar/FormatSettings.tsx`, `components/sidebar/GeneralOptions.tsx`, `components/sidebar/PlaybackSettings.tsx`, `components/sidebar/QuantizationSettings.tsx`, `components/sidebar/TrackList.tsx`, `components/sidebar/VisualsSection.tsx`, and `components/sidebar/SidebarShared.tsx`.
- `services/MidiParser.ts` and `services/StrudelNotation.ts` have no direct tests even though they sit on key file-parsing and orchestration paths.
- `hooks/useDebouncedValue.ts` and `components/sidebar/configUpdates.ts` are small and stable but currently untested.

## Notable Absences and Inconsistencies

- No shared `vitest.setup.ts`, custom matcher setup, or global test utilities file is present.
- DOM tests opt into `jsdom` per file with `// @vitest-environment jsdom` rather than through a centralized config.
- No snapshot tests are present.
- No CI or pre-commit quality gate configuration is present in the inspected files.
- Test depth is uneven: the notation engine is covered well, while the user-facing React shell is covered lightly.

---

*Testing analysis: 2026-03-27*
