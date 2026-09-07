import { _electron as electron, expect, test } from '@playwright/test';

test('starts the real desktop shell with an isolated, sandboxed renderer', async () => {
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const application = await electron.launch(
    executablePath ? { executablePath, args: [] } : { args: ['.'] },
  );
  try {
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A learning workbench for builders.',
    );
    await expect(page.getByText(/Electron \d/)).toBeVisible();
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'require')),
    ).toBe('undefined');
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'process')),
    ).toBe('undefined');
    await page.evaluate(() => window.open('https://example.com'));
    expect(application.windows()).toHaveLength(1);
    await page.screenshot({ path: test.info().outputPath('desktop.png') });
    expect(errors).toEqual([]);
  } finally {
    await application.close();
  }
});
