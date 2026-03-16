import React from 'react';
import { StrudelConfig } from '../../types';

export type SetConfig = React.Dispatch<React.SetStateAction<StrudelConfig>>;

export function updateConfigValue<K extends keyof StrudelConfig>(
  setConfig: SetConfig,
  key: K,
  value: StrudelConfig[K],
): void {
  setConfig((prev) => ({ ...prev, [key]: value }));
}

export function patchConfig(setConfig: SetConfig, patch: Partial<StrudelConfig>): void {
  setConfig((prev) => ({ ...prev, ...patch }));
}
