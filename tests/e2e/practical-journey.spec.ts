import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { build } from 'vite';
import {
  closeTestApplication,
  useElectronCloseHandling,
} from './electron-lifecycle';
import { desktopE2EEnv } from './desktop-e2e-env';

test('Practical journey retains an accepted lesson activity, brief, imported evidence and exact origin', async () => {
  test.setTimeout(120_000);
  test.info().annotations.push({
    type: 'synthetic-fixture',
    description:
      'The retained brief is a synthetic CoursePracticeActivityBinding snapshot for this e2e. It is not a live or reviewed AR-52 producer result. Native file dialogs are stubbed. No paid AI calls.',
  });
  const directory = mkdtempSync(join(tmpdir(), 'ar50-journey-'));
  const harnessDirectory = mkdtempSync(
    join(process.cwd(), 'node_modules/.cache-ar50-'),
  );
  const evidencePath = join(directory, 'trial.txt');
  const exportPath = join(directory, 'exported-trial.txt');
  writeFileSync(evidencePath, 'trial-output=12\n');
  await build({
    configFile: false,
    logLevel: 'error',
    define: { 'import.meta.dirname': '__dirname' },
    build: {
      outDir: harnessDirectory,
      emptyOutDir: true,
      lib: {
        entry: join(process.cwd(), 'tests/e2e/practical-journey-harness.ts'),
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
      env: desktopE2EEnv(directory),
    });
  let application = await launch();
  try {
    let page = await application.firstWindow();
    useElectronCloseHandling(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page
      .getByLabel('What do you want to learn about?', { exact: true })
      .fill('Compare one changed input');
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(
      page.getByRole('heading', { name: 'Reading', exact: true }),
    ).toBeVisible();
    const created = await page.evaluate(async () => {
      const [project] = await window.desktop.listProjects();
      if (!project) throw new Error('Missing project');
      const topicId = crypto.randomUUID();
      const lessonId = crypto.randomUUID();
      const saved = await window.desktop.savePathRevision({
        projectId: project.id,
        expectedRevision: 0,
        title: 'Synthetic practical path',
        topics: [
          {
            id: topicId,
            title: 'Build a usable artifact',
            lessons: [
              {
                id: lessonId,
                title: 'Measure one change',
                objective: 'Return a comparable result from one changed input.',
                activity:
                  'Change one input in your own tool, save the output, and compare it with your prediction.',
                source: { state: 'pending' },
              },
            ],
          },
        ],
      });
      if (saved.status !== 'committed') throw new Error('Path fixture failed');
      return {
        projectId: project.id,
        pathId: saved.record.id,
        lessonId,
        topicId,
      };
    });
    const retained = await application.evaluate(
      (_electron, input) => {
        const { createRequire } = process.getBuiltinModule('module');
        const load = createRequire(input.harness);
        const harness: typeof import('./practical-journey-harness') = load(
          input.harness,
        );
        return harness.retainSyntheticBrief(input.databasePath, input.activity);
      },
      {
        harness: join(harnessDirectory, 'harness.cjs'),
        databasePath: join(directory, 'workspace.sqlite'),
        activity: {
          projectId: created.projectId,
          origin: {
            path: {
              pathId: created.pathId,
              pathRevision: 1,
              topicId: created.topicId,
              lessonId: created.lessonId,
            },
          },
          title: 'Measure one change',
          objective: 'Return a comparable result from one changed input.',
          instructions:
            'Change one input in your own tool, save the output, and compare it with your prediction.',
        },
      },
    );
    if (retained.status !== 'retained')
      throw new Error('Synthetic brief could not be retained');
    await page.getByRole('button', { name: 'Applied Research home' }).click();
    await page
      .getByRole('button', { name: /Compare one changed input/ })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Reading', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Measure one change' }).click();
    await page.getByRole('button', { name: 'Practical', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Measure one change' }),
    ).toBeVisible();
    await expect(
      page.getByText('Return a usable output from one changed input.'),
    ).toBeVisible();
    await page.getByLabel('Expected outcome').fill('The output should change.');
    await page
      .getByRole('combobox', { name: 'Tool for this attempt' })
      .selectOption('external:Own notebook');
    await expect(
      page.getByText(/External work does not auto-launch/),
    ).toBeVisible();
    await application.evaluate(async ({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path],
      });
    }, evidencePath);
    await page.getByRole('button', { name: 'Select a result file' }).click();
    await expect(
      page.getByText(
        'text/plain · 16 bytes · user-selected evidence, not an app measurement or source citation',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Produce the output evidence' }),
    ).toContainText('trial.txt');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByLabel('Retained file preview')).toContainText(
      'trial-output=12',
    );
    await page
      .getByRole('combobox', { name: /Produce the output status/ })
      .selectOption('user-reported-complete');
    await page.getByLabel('Produce the output note').fill('Imported the csv.');
    await page.getByRole('button', { name: 'Save checkpoint' }).click();
    await page.getByLabel('Your interpretation').fill('The result matched.');
    await page
      .locator('footer.practical-footer')
      .getByRole('button', { name: 'Save work' })
      .click();
    await expect(page.getByLabel('Save status')).toHaveText(/Saved/);
    await closeTestApplication(application);

    application = await launch();
    page = await application.firstWindow();
    useElectronCloseHandling(page);
    await page
      .getByRole('button', { name: /Compare one changed input/ })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Reading', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Measure one change' }).click();
    await page.getByRole('button', { name: 'Practical', exact: true }).click();
    await expect(page.getByLabel('Expected outcome')).toHaveValue(
      'The output should change.',
    );
    await expect(page.getByLabel('Your interpretation')).toHaveValue(
      'The result matched.',
    );
    await expect(
      page.getByRole('combobox', { name: /Produce the output status/ }),
    ).toHaveValue('user-reported-complete');
    await application.evaluate(async ({ dialog }, path) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: path,
      });
    }, exportPath);
    await page.getByRole('button', { name: 'Save a copy' }).click();
    await expect
      .poll(() => {
        try {
          return readFileSync(exportPath, 'utf8');
        } catch {
          return '';
        }
      })
      .toBe('trial-output=12\n');
    await page.getByRole('button', { name: 'Return to learning' }).click();
    await expect(
      page.getByRole('button', { name: 'Measure one change' }),
    ).toHaveAttribute('aria-current', 'page');
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
    rmSync(harnessDirectory, { recursive: true, force: true });
  }
});
