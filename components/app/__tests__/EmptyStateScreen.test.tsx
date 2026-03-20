// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyStateScreen } from '../EmptyStateScreen';
import { DEFAULT_CONFIG } from '../../../types';

vi.mock('../../codeViewer/LazyCodeViewer', () => ({
  LazyCodeViewer: ({ playerLabel }: { playerLabel: string }) => (
    <div data-testid="live-player">{playerLabel}</div>
  ),
}));

describe('EmptyStateScreen', () => {
  it('renders the live example player immediately', () => {
    render(
      <EmptyStateScreen
        activeExampleId={null}
        config={DEFAULT_CONFIG}
        isProcessing={false}
        onExampleLoad={vi.fn()}
        onFileLoaded={vi.fn()}
      />,
    );

    expect(screen.getByTestId('live-player').textContent).toContain('Ruthlessness / first track');
  });
});
