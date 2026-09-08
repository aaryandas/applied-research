import { useCallback, useEffect, useRef, useState } from 'react';
import type { RegisterPracticalFlush } from '../contracts/practical-work';

type Flush = () => Promise<boolean>;

/** One save barrier for view changes, project replacement and native window close. */
export function useWorkspaceFlush() {
  const reader = useRef<Flush | null>(null);
  const canvas = useRef<Flush | null>(null);
  const practical = useRef<Flush | null>(null);
  const pending = useRef<Promise<boolean> | null>(null);
  const navigating = useRef(false);
  const [message, setMessage] = useState('');
  const registerReaderFlush = useCallback((flush: Flush | null) => {
    reader.current = flush;
  }, []);
  const registerCanvasFlush = useCallback((flush: Flush | null) => {
    canvas.current = flush;
  }, []);
  const registerPracticalFlush: RegisterPracticalFlush = useCallback(
    (flush) => {
      const adapter = async (): Promise<boolean> =>
        (await flush()).status === 'ready';
      practical.current = adapter;
      return () => {
        if (practical.current === adapter) practical.current = null;
      };
    },
    [],
  );
  const flush = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      try {
        for (const callback of [
          reader.current,
          canvas.current,
          practical.current,
        ]) {
          if (callback && !(await callback())) {
            setMessage(
              'Your work is still open. Finish saving or resolve the unsaved draft before leaving.',
            );
            return false;
          }
        }
        setMessage('Work saved.');
        return true;
      } catch {
        setMessage(
          'Could not save your work. Keep this workspace open and try saving again.',
        );
        return false;
      } finally {
        pending.current = null;
      }
    })();
    return pending.current;
  }, []);
  const navigate = useCallback(
    async (action: () => void): Promise<void> => {
      if (navigating.current) return;
      navigating.current = true;
      try {
        if (await flush()) {
          setMessage('');
          action();
        }
      } finally {
        navigating.current = false;
      }
    },
    [flush],
  );
  useEffect(() => {
    let allowClose = false;
    let closing = false;
    let active = true;
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (allowClose) return;
      event.preventDefault();
      event.returnValue = '';
      if (closing) return;
      closing = true;
      void flush().then((ready) => {
        closing = false;
        if (ready && active) {
          allowClose = true;
          window.close();
        }
      });
    };
    const saveShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', saveShortcut);
    return () => {
      active = false;
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', saveShortcut);
    };
  }, [flush]);
  return {
    registerReaderFlush,
    registerCanvasFlush,
    registerPracticalFlush,
    flush,
    navigate,
    message,
  };
}
