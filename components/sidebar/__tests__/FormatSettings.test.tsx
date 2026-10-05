// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type StrudelConfig } from '../../../types';
import { FormatSettings } from '../FormatSettings';
import { GeneralOptions } from '../GeneralOptions';
import { PlaybackSettings } from '../PlaybackSettings';

afterEach(cleanup);

function Settings({ initialConfig = DEFAULT_CONFIG }: { initialConfig?: StrudelConfig }) {
  const [config, setConfig] = useState(initialConfig);
  return <>
    <FormatSettings config={config} setConfig={setConfig} />
    <GeneralOptions config={config} setConfig={setConfig} />
    <PlaybackSettings config={config} setConfig={setConfig} />
    <output data-testid="config">{JSON.stringify(config)}</output>
  </>;
}

const configValue = (): StrudelConfig => JSON.parse(screen.getByTestId('config').textContent!);

it('offers pitch, cycle and wrapping controls without retired rendering modes', () => {
  render(<Settings />);
  for (const label of ['Expanded', 'Structured', 'Duration', 'Division']) {
    expect(screen.queryByRole('button', { name: label })).toBeNull();
  }
  expect(screen.queryByRole('spinbutton', { name: 'Duration precision' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Relative' }));
  fireEvent.click(screen.getByRole('button', { name: 'Beat' }));
  expect(configValue()).toMatchObject({ notationType: 'relative', cycleUnit: 'beat' });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Measures per line' }), { target: { value: '8' } });
  expect(configValue()).toMatchObject({ measuresPerLine: 8 });
  // Notes-per-line is retired: wrapping is always by measure.
  expect(screen.queryByRole('button', { name: /Groups/ })).toBeNull();
  expect(configValue()).not.toHaveProperty('formatPerLineBy');
});

it('rounds tempo labels while retaining exact source and playback BPM through edits and reset', () => {
  const exactBpm = 135.000135000135;
  render(<Settings initialConfig={{ ...DEFAULT_CONFIG, bpm: exactBpm, sourceBpm: exactBpm }} />);
  expect(screen.getByText('Orig: 135')).toBeTruthy();
  expect(screen.getByText('135', { exact: true })).toBeTruthy();
  const tempoSlider = screen.getByRole('slider', { name: 'Tempo 135 BPM' });
  expect(configValue()).toMatchObject({ bpm: exactBpm, sourceBpm: exactBpm });
  fireEvent.click(screen.getByRole('button', { name: 'Beat' }));
  expect(configValue().bpm).toBe(exactBpm);
  fireEvent.change(tempoSlider, { target: { value: '120' } });
  expect(configValue()).toMatchObject({ bpm: 120, sourceBpm: exactBpm });
  fireEvent.click(screen.getByRole('button', { name: 'Reset to source BPM' }));
  expect(configValue()).toMatchObject({ bpm: exactBpm, sourceBpm: exactBpm });
});
