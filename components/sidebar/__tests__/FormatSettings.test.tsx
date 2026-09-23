// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../../types';
import { FormatSettings } from '../FormatSettings';

afterEach(cleanup);
it('changes the shared representation config through the existing format controls', () => {
  function Settings() {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    return <><FormatSettings config={config} setConfig={setConfig} /><output>{config.renderingMode}</output></>;
  }
  render(<Settings />);
  expect(screen.getByRole('status').textContent).toBe('expanded');
  fireEvent.click(screen.getByRole('button', { name: 'Structured' }));
  expect(screen.getByRole('status').textContent).toBe('structured');
  fireEvent.click(screen.getByRole('button', { name: 'Expanded' }));
  expect(screen.getByRole('status').textContent).toBe('expanded');
});
