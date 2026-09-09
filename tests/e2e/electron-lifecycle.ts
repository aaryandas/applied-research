import type { ElectronApplication, Page } from '@playwright/test';

/** Stay inside the 30s test bound so a capture reject is reported, not a close hang. */
const APPLICATION_CLOSE_MS = 4_000;

export function useElectronCloseHandling(page: Page): void {
  // Electron handles prevented beforeunload without a Chromium dialog to dismiss.
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'beforeunload') void dialog.dismiss();
  });
}

function withDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label));
    }, APPLICATION_CLOSE_MS);
    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function killLeftoverElectron(application: ElectronApplication): void {
  try {
    const child = application.process();
    if (child.pid && !child.killed) child.kill('SIGKILL');
  } catch {
    // Already gone. Bounded close must not replace the originating test error.
  }
}

export async function closeTestApplication(
  application: ElectronApplication,
): Promise<void> {
  // Save-on-close is asserted explicitly by shell.spec. Cleanup must also finish
  // when a failed assertion leaves a deliberately blocked draft in this window.
  // Guest capturePage UnknownVizError can reject Playwright's evaluate channel
  // in ~1ms; unbounded application.close() then masks that error with the 30s
  // test timeout and worker teardown.
  try {
    await withDeadline(
      application.evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      }),
      'electron-window-destroy-timeout',
    );
  } catch {
    killLeftoverElectron(application);
    return;
  }
  try {
    await withDeadline(application.close(), 'electron-close-timeout');
  } catch {
    killLeftoverElectron(application);
  }
}
