import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { build } from 'vite';
import {
  closeTestApplication,
  useElectronCloseHandling,
} from './electron-lifecycle';

test('reads main-adopted synthetic evidence and generated text with exact human origins after restart', async () => {
  test.setTimeout(90_000);
  const directory = mkdtempSync(join(tmpdir(), 'ar37-electron-'));
  const harnessDirectory = mkdtempSync(
    join(process.cwd(), 'node_modules/.cache-ar37-'),
  );
  await build({
    configFile: false,
    logLevel: 'error',
    define: { 'import.meta.dirname': '__dirname' },
    build: {
      outDir: harnessDirectory,
      emptyOutDir: true,
      lib: {
        entry: join(process.cwd(), 'tests/e2e/source-adoption-harness.ts'),
        formats: ['cjs'],
        fileName: () => 'harness.cjs',
      },
      rollupOptions: {
        external: (id) => !id.startsWith('.') && !isAbsolute(id),
      },
    },
  });
  const launch = () =>
    electron.launch({
      args: ['.'],
      env: {
        ...process.env,
        APPLIED_RESEARCH_DATA_DIR: directory,
        APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR: 'false',
        OPENROUTER_API_KEY: '',
      },
    });
  let application = await launch();
  try {
    let page = await application.firstWindow();
    useElectronCloseHandling(page);
    const projectId = await application.evaluate(
      (_electron, input) => {
        const { createRequire } = process.getBuiltinModule('module');
        const load = createRequire(input.harness);
        const harness: typeof import('./source-adoption-harness') = load(
          input.harness,
        );
        return harness.saveTrustedExamples(input.databasePath);
      },
      {
        harness: join(harnessDirectory, 'harness.cjs'),
        databasePath: join(directory, 'workspace.sqlite'),
      },
    );
    await page.reload();
    await page.getByRole('button', { name: /Read acquired evidence/ }).click();
    await page.getByRole('button', { name: /Read teaching text/ }).click();
    await expect(page.getByLabel('Source text', { exact: true })).toHaveText(
      'A generated explanation with evidence.',
    );
    await page.getByRole('tab', { name: 'Sources', exact: true }).click();
    await page
      .getByRole('button', { name: 'Synthetic paper', exact: true })
      .click();
    const prose = page.getByLabel('Source text', { exact: true });
    await expect(prose).toHaveText('hello');
    await expect(
      page.getByText('https://example.org/paper', { exact: true }),
    ).toBeVisible();
    await prose.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await page.getByLabel('In your own words').fill(' My exact human note 🧭 ');
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await page.screenshot({
      path: test.info().outputPath('adopted-canvas.png'),
    });
    const saved = await page.evaluate(
      (id) => window.desktop.getLearningWorkspace(id),
      projectId,
    );
    expect(
      saved.sources.map((item) => item.currentVersion.provenance.kind),
    ).toEqual(['discovered', 'generated']);
    expect(saved.entries[0]?.current).toMatchObject({
      body: ' My exact human note 🧭 ',
      authorKind: 'human',
      origin: { sourceRevisionId: saved.sources[0]?.currentVersionId },
    });
    expect(
      await page.evaluate(() =>
        ['acceptAcquiredSource', 'acceptGeneratedLesson', 'invoke', 'sql'].some(
          (name) => name in window.desktop,
        ),
      ),
    ).toBe(false);
    await closeTestApplication(application);
    application = await launch();
    page = await application.firstWindow();
    useElectronCloseHandling(page);
    await page.getByRole('button', { name: /Read acquired evidence/ }).click();
    expect(
      await page.evaluate(
        (id) => window.desktop.getLearningWorkspace(id),
        projectId,
      ),
    ).toEqual(saved);
    await page.getByRole('button', { name: /Read teaching text/ }).click();
    await expect(page.getByLabel('Source text', { exact: true })).toHaveText(
      'A generated explanation with evidence.',
    );
    await page.screenshot({
      path: test.info().outputPath('adopted-reader.png'),
    });
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
    rmSync(harnessDirectory, { recursive: true, force: true });
  }
});
