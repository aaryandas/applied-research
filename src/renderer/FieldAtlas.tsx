import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

export function BrandMark(): ReactElement {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 32 36"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 33V17a13 13 0 0 1 26 0v16M9 33V17a7 7 0 0 1 14 0v16M0 33h32"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

const iconPaths = {
  arrow: 'M5 19 19 5M5 5h14v14',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  send: 'M12 20V4m-6 6 6-6 6 6',
  stop: 'M6 6h12v12H6Z',
  canvas: 'M3 3h18v18H3ZM9 3v18M9 10h12',
  companion: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  grip: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
  settings: 'M4 7h16M4 17h16',
} as const;

export function Icon({ name }: { name: keyof typeof iconPaths }): ReactElement {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
      {name === 'settings' && (
        <>
          <circle cx="9" cy="7" r="3" fill="var(--paper)" />
          <circle cx="15" cy="17" r="3" fill="var(--paper)" />
        </>
      )}
    </svg>
  );
}

export function ThemeButton(): ReactElement {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('applied-research-theme') === 'dark'
        ? 'dark'
        : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('applied-research-theme', theme);
    } catch {
      /* Appearance still changes when preference storage is unavailable. */
    }
  }, [theme]);
  return (
    <button
      className="theme-button text-button"
      aria-label={
        theme === 'light' ? 'Use evening theme' : 'Use daylight theme'
      }
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
    >
      <svg
        className="ui-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" stroke="none" />
      </svg>
      <span>{theme === 'light' ? 'Evening' : 'Daylight'}</span>
    </button>
  );
}

export function Dialog({
  titleId,
  closeLabel,
  onDismiss,
  children,
}: {
  titleId: string;
  closeLabel: string;
  onDismiss: () => void;
  children: ReactNode;
}): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    element?.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="atlas-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <button
        className="dialog-close icon-button"
        aria-label={closeLabel}
        onClick={onDismiss}
      >
        <Icon name="close" />
      </button>
      {children}
    </dialog>
  );
}
