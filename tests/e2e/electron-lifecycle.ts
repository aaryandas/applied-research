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

/**
 * Launch options shared by every Electron spec: video for ticket evidence, and
 * software GL when APPLIED_RESEARCH_SOFTWARE_GL=1 so WebGL scenes run on
 * headless Linux verifiers (xvfb) that have no GPU.
 */
export function electronLaunchExtras(): {
  recordVideo: { dir: string; size: { width: number; height: number } };
  args: string[];
} {
  const softwareGl = process.env.APPLIED_RESEARCH_SOFTWARE_GL === '1';
  return {
    recordVideo: {
      dir: 'test-results/video',
      size: { width: 1280, height: 800 },
    },
    args: softwareGl
      ? [
          '--use-gl=angle',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--ignore-gpu-blocklist',
        ]
      : [],
  };
}
