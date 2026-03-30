// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyStateScreen } from '../EmptyStateScreen';
import { DEFAULT_CONFIG } from '../../../types';

vi.mock('../../codeViewer/LazyCodeViewer', () => ({
  LazyCodeViewer: ({ playerLabel }: { playerLabel: string }) => (
    <div data-testid="live-player">{playerLabel}</div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe('EmptyStateScreen', () => {
  it('renders the top bar, preview, and example actions', () => {
    render(
      <EmptyStateScreen
        activeExampleId={null}
        config={DEFAULT_CONFIG}
        isProcessing={false}
        onExampleLoad={vi.fn()}
        onFileLoaded={vi.fn()}
      />,
    );

    expect(
      screen
        .getAllByRole('link', { name: /strudel.cc/i })
        .some((link) => link.getAttribute('href') === 'https://strudel.cc'),
    ).toBe(true);
    expect(
      screen
        .getAllByRole('link', { name: /docs/i })
        .some((link) => link.getAttribute('href') === 'https://strudel.cc/learn/getting-started/'),
    ).toBe(true);
    expect(screen.getByTestId('live-player').textContent).toContain('Ruthlessness / first track');
    expect(screen.getByRole('heading', { name: /durations/i })).toBeTruthy();
    expect(screen.getByText(/C4@0.25/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /load example/i })).toHaveLength(2);
  });

  it("reveals and hides the what's a MIDI file explainer", () => {
    render(
      <EmptyStateScreen
        activeExampleId={null}
        config={DEFAULT_CONFIG}
        isProcessing={false}
        onExampleLoad={vi.fn()}
        onFileLoaded={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('button', { name: /what's a midi file/i });

    expect(screen.queryByText(/MIDI doesn't contain audio/i)).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText(/MIDI doesn't contain audio/i)).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByText(/MIDI doesn't contain audio/i)).toBeNull();
  });
});
