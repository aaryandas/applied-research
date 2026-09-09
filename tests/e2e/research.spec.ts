import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { closeTestApplication } from './electron-lifecycle';

test('research component contract in Electron: keyboard, exact target, themes and failure states', async () => {
  test.setTimeout(90_000);
  const directory = mkdtempSync(join(tmpdir(), 'ar-research-contract-'));
  const server = await createServer({
    configFile: false,
    plugins: [react()],
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture server did not bind.');
  const url = `http://127.0.0.1:${address.port}/tests/e2e/research-harness.html`;
  const entry = join(directory, 'main.cjs');
  writeFileSync(
    entry,
    `const { app, BrowserWindow } = require('electron');
    app.whenReady().then(() => {
      const window = new BrowserWindow({ width: 1100, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.loadURL(${JSON.stringify(url)});
    });`,
  );
  const application = await electron.launch({ args: [entry] });
  try {
    const page = await application.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByLabel('Fixture disclosure')).toBeVisible();
    const question = page.getByRole('textbox', { name: 'Research question' });
    await question.focus();
    await question.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Find sources' }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Search results' }),
    ).toBeFocused();
    await expect(page.getByRole('status')).toContainText('Partial results');
    await expect(page.getByText('Catalog only', { exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('research-light-desktop.png'),
      fullPage: true,
    });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = 'dark'),
    );
    await page.screenshot({
      path: test.info().outputPath('research-dark-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 520, height: 820 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath('research-dark-narrow.png'),
      fullPage: true,
    });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = 'light'),
    );
    await page.screenshot({
      path: test.info().outputPath('research-light-narrow.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Acquire & read' }).click();
    const saved = page.getByRole('region', { name: 'Saved references' });
    await expect(saved).toContainText('local-original-v2');
    await expect(page.getByRole('status')).toContainText(
      'Save your current work',
    );
    const targetText = await page
      .getByLabel('Synthetic Reader target')
      .textContent();
    expect(JSON.parse(targetText ?? '{}')).toEqual({
      projectId: 'synthetic-project',
      sourceId: 'local-synthetic-paper',
      revisionId: 'local-original-v2',
      question:
        'How can I use retrieval practice while learning something new?',
      origin: {
        path: {
          pathId: 'synthetic-path',
          pathRevision: 1,
          topicId: 'synthetic-topic',
        },
      },
    });
    await question.fill('cancel this search');
    await page.getByRole('button', { name: 'Find sources' }).click();
    await page.getByRole('button', { name: 'Cancel search' }).click();
    await expect(question).toBeFocused();
    await expect(page.getByRole('status')).toHaveText(
      'The sourcing request was cancelled.',
    );
    for (const [query, message] of [
      ['unavailable', 'The sourcing operation is unavailable.'],
      ['no results', 'No source candidates were found.'],
    ]) {
      await question.fill(query!);
      await page.getByRole('button', { name: 'Find sources' }).click();
      await expect(page.getByRole('status')).toHaveText(message!);
    }
    await expect(saved).toContainText('local-original-v2');
    expect(errors).toEqual([]);
  } finally {
    await closeTestApplication(application);
    await server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
