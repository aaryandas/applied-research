import { useCallback, useEffect, useState } from 'react';
import type {
  SettingsAppearance,
  SettingsAppearanceControl,
} from './settings/types';

const THEME_KEY = 'applied-research-theme';

export function useAppearance(): SettingsAppearanceControl {
  const [value, setValue] = useState<SettingsAppearance>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = value;
  }, [value]);
  const onChange = useCallback(
    async (next: SettingsAppearance): Promise<void> => {
      document.documentElement.dataset.theme = next;
      setValue(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // A blocked preference store must not prevent changing this session's palette.
      }
    },
    [],
  );
  return { value, onChange };
}
