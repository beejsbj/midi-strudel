// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStrudelEditor } from '../useStrudelEditor';

const dispatchSpy = vi.fn();
const evaluateSpy = vi.fn();
const stopSpy = vi.fn();
const updateSettingsSpy = vi.fn();

type MockMirrorInstance = {
  options: Record<string, unknown>;
};

let latestMirror: MockMirrorInstance | null = null;

vi.mock('@strudel/codemirror', () => ({
  StrudelMirror: class MockStrudelMirror {
    editor = {
      state: {
        doc: {
          toString: () => 'note("c4")',
          length: 'note("c4")'.length,
        },
      },
      dispatch: dispatchSpy,
    };

    view = this.editor;
    drawContext = {};
    drawTime: [number, number] = [0, 0];
    options: Record<string, unknown>;
    updateSettings = updateSettingsSpy;
    getCode = () => 'note("c4")';
    setCode = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      latestMirror = { options };
    }

    evaluate = async () => {
      evaluateSpy();
      const onToggle = this.options.onToggle as ((started: boolean) => void) | undefined;
      onToggle?.(true);
    };

    stop = async () => {
      stopSpy();
      const onToggle = this.options.onToggle as ((started: boolean) => void) | undefined;
      onToggle?.(false);
    };
  },
}));

vi.mock('@strudel/core', () => ({
  evalScope: vi.fn(() => Promise.resolve()),
  samples: vi.fn(() => Promise.resolve()),
}));

vi.mock('@strudel/draw', () => ({}));
vi.mock('@strudel/mini', () => ({}));
vi.mock('@strudel/tonal', () => ({}));
vi.mock('@strudel/transpiler', () => ({
  transpiler: {},
}));

vi.mock('@strudel/webaudio', () => ({
  getAudioContext: () => ({ currentTime: 0 }),
  initAudioOnFirstClick: vi.fn(),
  registerSynthSounds: vi.fn(() => Promise.resolve()),
  webaudioOutput: {},
}));

vi.mock('@strudel/soundfonts', () => ({
  registerSoundfonts: vi.fn(() => Promise.resolve()),
}));

function Harness() {
  const { editorContainerRef, togglePlay } = useStrudelEditor({
    code: 'note("c4")',
    isNoteColoringEnabled: true,
    isProgressiveFillEnabled: true,
    isPatternTextColoringEnabled: true,
  });

  return (
    <div>
      <button type="button" onClick={togglePlay}>
        toggle
      </button>
      <div ref={editorContainerRef} />
    </div>
  );
}

async function flushPlaybackToggle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useStrudelEditor', () => {
  beforeEach(() => {
    latestMirror = null;
    dispatchSpy.mockReset();
    evaluateSpy.mockReset();
    stopSpy.mockReset();
    updateSettingsSpy.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Strudel pattern highlighting enabled while playback is active', async () => {
    render(<Harness />);

    expect(updateSettingsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isPatternHighlightingEnabled: true }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await flushPlaybackToggle();

    expect(evaluateSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await flushPlaybackToggle();

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(updateSettingsSpy).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate playback dispatches for equivalent active frames', async () => {
    render(<Harness />);

    const mirror = latestMirror;
    expect(mirror).not.toBeNull();

    dispatchSpy.mockClear();

    const onDraw = mirror?.options.onDraw as
      | ((haps: unknown[], time: number) => void)
      | undefined;
    expect(onDraw).toBeTypeOf('function');

    const hap = {
      isActive: () => true,
      context: {
        locations: [{ start: 6, end: 8 }],
      },
      whole: {
        begin: 0,
        duration: 1,
      },
    };

    act(() => {
      onDraw?.([hap], 0.1);
    });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    act(() => {
      onDraw?.([hap], 0.101);
    });
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });
});
