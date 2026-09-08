import type { ElectronApplication, Page } from '@playwright/test';

export function useElectronCloseHandling(page: Page): void {
  // Electron handles prevented beforeunload without a Chromium dialog to dismiss.
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'beforeunload') void dialog.dismiss();
  });
}

export async function closeTestApplication(
  application: ElectronApplication,
): Promise<void> {
  // Save-on-close is asserted explicitly by shell.spec. Cleanup must also finish
  // when a failed assertion leaves a deliberately blocked draft in this window.
  await application.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
  });
  await application.close();
}
