import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { SettingsAppearance, SettingsAppearanceControl } from './types';

export function AppearanceControl({
  value,
  onChange,
}: SettingsAppearanceControl): ReactElement {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  // The ref rejects same-tick clicks before React commits the pending state.
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function change(next: SettingsAppearance): Promise<void> {
    if (busy.current || next === value) return;
    busy.current = true;
    setPending(true);
    setMessage('Applying appearance…');
    try {
      await onChange(next);
      if (mounted.current) setMessage('');
    } catch {
      if (mounted.current)
        setMessage('Could not change appearance. Please try again.');
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return (
    <div className="settings-appearance">
      <fieldset className="settings-theme-options" aria-label="Appearance">
        {(['light', 'dark'] as const).map((theme) => (
          <button
            key={theme}
            type="button"
            aria-pressed={value === theme}
            aria-disabled={pending}
            onClick={() => {
              void change(theme);
            }}
          >
            {theme === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </fieldset>
      <p className="settings-feedback" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
