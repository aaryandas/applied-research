import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../../src/main/workspace-store';
import { syntheticAcceptedCourseBrief } from '../../src/contracts/practical-brief.fixture';
import {
  closeTestApplication,
  useElectronCloseHandling,
} from './electron-lifecycle';

test('Practical journey retains an accepted lesson activity, brief, imported evidence and exact origin', async () => {
  test.setTimeout(120_000);
  test.info().annotations.push({
    type: 'synthetic-fixture',
    description:
      'The retained brief is a synthetic CoursePracticeActivityBinding snapshot for this e2e. It is not a live or reviewed AR-52 producer result. Native file dialogs are stubbed. No paid AI calls.',
  });
  const directory = mkdtempSync(join(tmpdir(), 'ar50-journey-'));
  const evidencePath = join(directory, 'trial.txt');
  const exportPath = join(directory, 'exported-trial.txt');
  writeFileSync(evidencePath, 'trial-output=12\n');
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
    const store = new WorkspaceStore(join(directory, 'workspace.sqlite'));
    try {
      const activity = {
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
      };
      const retained = store.retainAcceptedBrief(
        syntheticAcceptedCourseBrief(activity),
      );
      if (retained.status !== 'retained')
        throw new Error('Synthetic brief could not be retained');
    } finally {
      store.close();
    }
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
    await expect(page.getByText('trial.txt')).toBeVisible();
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
    await page.getByRole('button', { name: 'Save work' }).click();
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
  }
});
