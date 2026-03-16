// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectState } from '../useProjectState';
import { DEFAULT_CONFIG, type Track } from '../../types';

const TEST_TRACKS: Track[] = [
  {
    id: 'track-1',
    name: 'Piano',
    notes: [{ note: 'C4', midi: 60, noteOn: 0, noteOff: 0.5, velocity: 0.8 }],
    isDrum: false,
    color: '120',
  },
];

interface HarnessProps {
  dependencies: NonNullable<Parameters<typeof useProjectState>[0]['dependencies']>;
}

function Harness({ dependencies }: HarnessProps) {
  const state = useProjectState({
    examples: [],
    dependencies,
  });

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          state.setConfig((prev) => ({
            ...prev,
            durationTagStyle: prev.durationTagStyle === 'sup' ? 'hover' : 'sup',
          }))
        }
      >
        toggle-duration-style
      </button>
      <button
        type="button"
        onClick={() =>
          state.setConfig((prev) => ({
            ...prev,
            bpm: prev.bpm + 1,
          }))
        }
      >
        increase-bpm
      </button>
      <button
        type="button"
        onClick={() =>
          state.setTracks((prev) =>
            prev.map((track) => ({
              ...track,
              color: String((parseInt(track.color ?? '0', 10) + 10) % 360),
            })),
          )
        }
      >
        nudge-track-color
      </button>
      <span>{state.code}</span>
    </div>
  );
}

describe('useProjectState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not regenerate notation for editor-only visual changes', () => {
    const generate = vi.fn(() => 'generated');
    const createNotation = vi.fn(() => ({ generate }));

    render(
      <Harness
        dependencies={{
          clearStorage: vi.fn(),
          createNotation,
          debounceMs: 40,
          detectKeySignature: vi.fn(() => null),
          loadConfig: vi.fn(() => DEFAULT_CONFIG),
          loadTracks: vi.fn(() => TEST_TRACKS),
          parseMidi: vi.fn(),
          saveConfig: vi.fn(),
          saveTracks: vi.fn(),
        }}
      />,
    );

    expect(generate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'toggle-duration-style' }));
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(generate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'increase-bpm' }));
    expect(generate).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('debounces config persistence during rapid updates', () => {
    const saveConfig = vi.fn();

    render(
      <Harness
        dependencies={{
          clearStorage: vi.fn(),
          createNotation: vi.fn(() => ({ generate: vi.fn(() => 'generated') })),
          debounceMs: 40,
          detectKeySignature: vi.fn(() => null),
          loadConfig: vi.fn(() => DEFAULT_CONFIG),
          loadTracks: vi.fn(() => TEST_TRACKS),
          parseMidi: vi.fn(),
          saveConfig,
          saveTracks: vi.fn(),
        }}
      />,
    );

    expect(saveConfig).toHaveBeenCalledTimes(1);
    saveConfig.mockClear();

    const bpmButton = screen.getByRole('button', { name: 'increase-bpm' });
    fireEvent.click(bpmButton);
    fireEvent.click(bpmButton);
    fireEvent.click(bpmButton);

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(saveConfig).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(saveConfig).toHaveBeenCalledTimes(1);
  });

  it('debounces track persistence during rapid updates', () => {
    const saveTracks = vi.fn();

    render(
      <Harness
        dependencies={{
          clearStorage: vi.fn(),
          createNotation: vi.fn(() => ({ generate: vi.fn(() => 'generated') })),
          debounceMs: 40,
          detectKeySignature: vi.fn(() => null),
          loadConfig: vi.fn(() => DEFAULT_CONFIG),
          loadTracks: vi.fn(() => TEST_TRACKS),
          parseMidi: vi.fn(),
          saveConfig: vi.fn(),
          saveTracks,
        }}
      />,
    );

    expect(saveTracks).toHaveBeenCalledTimes(1);
    saveTracks.mockClear();

    const colorButton = screen.getByRole('button', { name: 'nudge-track-color' });
    fireEvent.click(colorButton);
    fireEvent.click(colorButton);
    fireEvent.click(colorButton);

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(saveTracks).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(saveTracks).toHaveBeenCalledTimes(1);
  });
});
