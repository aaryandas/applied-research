import { expect, type Page } from '@playwright/test';

/** Unpackaged Playwright uses the main-admitted desktop-e2e Opening skip. */
export function packagedDesktopRuntime(): boolean {
  return Boolean(process.env.ELECTRON_EXECUTABLE_PATH);
}

/**
 * Open a fresh project for automated Electron tests.
 * Packaged production cannot enable the fixture from environment; it uses the
 * named `createProject` bridge and reopens from Opening. Not journey acceptance.
 */
export async function startLearningWorkspace(
  page: Page,
  goal: string,
): Promise<void> {
  if (packagedDesktopRuntime()) {
    await page.evaluate(async (topic) => {
      await window.desktop.createProject(topic);
    }, goal);
    await page.reload();
    await expect(
      page.getByRole('navigation', { name: 'All saved work' }),
    ).toBeVisible();
    await page.getByRole('button', { name: goal }).click();
    return;
  }
  await page
    .getByLabel('What do you want to learn about?', { exact: true })
    .fill(goal);
  await page.getByRole('button', { name: 'Start learning' }).click();
}
