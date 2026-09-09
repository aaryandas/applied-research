import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ToolState } from '../../src/contracts/workspace';
import {
  closeTestApplication,
  useElectronCloseHandling,
} from './electron-lifecycle';

function launch(directory: string, key = ''): Promise<ElectronApplication> {
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  return electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
    env: {
      ...process.env,
      APPLIED_RESEARCH_DATA_DIR: directory,
      APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR: key ? 'true' : 'false',
      OPENROUTER_API_KEY: key,
    },
  });
}

// scripts/test-packaged.mjs sets this to run the suite against the built app.
const PACKAGED = Boolean(process.env.ELECTRON_EXECUTABLE_PATH);
const MATRIX_LAB_URL = 'https://learning.test/';
const MATRIX_LAB_TITLE = 'Matrix Lab';
// Production tool adapter waits up to 30s for !loading && url. Packaged
// practical-tools committed an intercepted guest in 3.2s on the same binary
// (run 34345154082). This budget waits for that commit after loadURL, not a sleep.
const GUEST_COMMIT_TIMEOUT_MS = 10_000;

async function guestNavigationSnapshot(
  application: ElectronApplication,
  url: string,
): Promise<{ url: string; title: string; loading: boolean }> {
  return application.evaluate(({ webContents }, destination) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getURL() === destination);
    if (!contents) return { url: '', title: '', loading: true };
    return {
      url: contents.getURL(),
      title: contents.getTitle(),
      loading: contents.isLoading(),
    };
  }, url);
}

const OPENING_VIEWPORTS: ReadonlyArray<readonly [number, number]> = [
  [1280, 800],
  [1440, 900],
  [820, 620],
];

// Resizes the content area and waits for the renderer to see it. Returns false
// when the display cannot show that size (CI runners have small screens); the
// skipped size is recorded as a test annotation instead of a false failure.
async function resizeViewport(
  application: ElectronApplication,
  page: Page,
  width: number,
  height: number,
): Promise<boolean> {
  const fits = await application.evaluate(
    ({ BrowserWindow, screen }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) return false;
      window.setMinimumSize(820, 620);
      window.setContentSize(size.width, size.height);
      const area = screen.getPrimaryDisplay().workAreaSize;
      const frame = window.getSize();
      const content = window.getContentSize();
      const chrome = [frame[0]! - content[0]!, frame[1]! - content[1]!];
      return (
        size.width + chrome[0]! <= area.width &&
        size.height + chrome[1]! <= area.height
      );
    },
    { width, height },
  );
  if (!fits) {
    test.info().annotations.push({
      type: 'viewport-skipped',
      description: `${width}x${height} does not fit this display`,
    });
    return false;
  }
  await expect
    .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
    .toEqual([width, height]);
  return true;
}

test('saves an offline learning space, edits and layout across a real Electron restart', async () => {
  test.setTimeout(60_000);
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-'));
  let application = await launch(directory);
  try {
    const page = await application.firstWindow();
    useElectronCloseHandling(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(
      page.getByLabel('What do you want to learn about?', { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'require')),
    ).toBe('undefined');
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'process')),
    ).toBe('undefined');
    await page.evaluate(() => window.open('https://example.com'));
    expect(application.windows()).toHaveLength(1);
    await page
      .getByLabel('What do you want to learn about?', { exact: true })
      .fill('Understand linear transformations');
    await page.getByRole('button', { name: 'Start learning' }).click();
    await page.getByRole('button', { name: 'Add source', exact: true }).click();
    await page.getByLabel('Source title').fill('Synthetic shear source');
    await page
      .getByLabel('Exact source text')
      .fill('A shear preserves area while changing angles.');
    await page
      .getByRole('button', { name: 'Import source', exact: true })
      .click();
    const prose = page.getByLabel('Source text', { exact: true });
    await expect(prose).toHaveText(
      'A shear preserves area while changing angles.',
    );
    await prose.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('My first prediction');
    await page
      .getByLabel('In your own words')
      .fill('A shear changes the square.');
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(
      page.getByText('A shear changes the square.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page
      .getByLabel('In your own words')
      .fill('A shear preserves the area of the square.');
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Expanded', exact: true }).click();
    const note = page
      .locator('.react-flow__node')
      .filter({ hasText: 'My first prediction' });
    await expect(note).toBeVisible();
    await note.focus();
    await note.press('Enter');
    await note.press('ArrowRight');
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const [project] = await window.desktop.listProjects();
          const workspace = await window.desktop.getLearningWorkspace(
            project!.id,
          );
          const entry = workspace.entries.find(
            (item) => item.current.title === 'My first prediction',
          )!;
          return workspace.placements.find(
            (item) => item.recordId === entry.id && item.view === 'expanded',
          )?.x;
        }),
      )
      .toBe(53);
    const beforeRestart = await page.evaluate(async () => {
      const [project] = await window.desktop.listProjects();
      // The standalone MVP experiment UI is retired; retain its real named
      // producer and result-storage checks alongside the current Reader UI.
      await window.desktop.addExperiment(project!.id);
      await window.desktop.saveEntry({
        projectId: project!.id,
        kind: 'result',
        title: 'Synthetic matrix capture',
        body: 'Matrix [[1.5, 0.5], [0, 1]]. The vector (1, 1) maps to (2, 1). Determinant: 1.50.',
        url: '',
      });
      return window.desktop.getLearningWorkspace(project!.id);
    });
    expect(beforeRestart.entries).toHaveLength(3);
    expect(
      beforeRestart.entries.find(
        (entry) => entry.current.title === 'My first prediction',
      )?.revisions,
    ).toHaveLength(2);
    await page.screenshot({ path: test.info().outputPath('workspace.png') });
    expect(errors).toEqual([]);
    await closeTestApplication(application);
    application = await launch(directory);
    const reopened = await application.firstWindow();
    useElectronCloseHandling(reopened);
    await reopened
      .getByRole('button', { name: /Understand linear transformations/ })
      .click();
    await expect(reopened.locator('.reader-project')).toHaveText(
      'Understand linear transformations',
    );
    await expect(
      reopened.getByText('A shear preserves the area of the square.', {
        exact: true,
      }),
    ).toBeVisible();
    const afterRestart = await reopened.evaluate(async () => {
      const [project] = await window.desktop.listProjects();
      return window.desktop.getLearningWorkspace(project!.id);
    });
    expect(afterRestart.entries).toEqual(beforeRestart.entries);
    expect(afterRestart.placements).toEqual(beforeRestart.placements);
    expect(afterRestart.sources).toEqual(beforeRestart.sources);
    expect(afterRestart.highlights).toEqual(beforeRestart.highlights);
    await reopened.getByRole('button', { name: 'Canvas', exact: true }).click();
    await reopened
      .getByRole('button', { name: 'Expanded', exact: true })
      .click();
    await expect(
      reopened
        .locator('.react-flow__node')
        .filter({ hasText: 'My first prediction' }),
    ).toHaveAttribute('style', /translate\(53px, 40px\)/);
    await expect(reopened.getByText(/Matrix \[\[1.5, 0.5/)).toBeVisible();
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('connects the real bridge, an isolated guest and recorded OpenRouter responses', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-ai-'));
  const application = await launch(directory, 'test-only-not-a-real-key');
  try {
    await application.evaluate(({ session }) => {
      session
        .fromPartition('persist:learning-tools')
        .protocol.handle(
          'https',
          () =>
            new Response(
              '<!doctype html><html><head><title>Matrix Lab</title></head><body><h1>Matrix Lab</h1><p>Change a matrix coefficient and observe the square.</p></body></html>',
              { headers: { 'content-type': 'text/html' } },
            ),
        );
      globalThis.fetch = async (_input, init) => {
        Reflect.set(
          globalThis,
          'lastTutorRequest',
          JSON.parse(String(init?.body)),
        );
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content:
                    'Predict how a shear changes the square [1]. Then compare your result.',
                  annotations: [
                    {
                      type: 'url_citation',
                      url_citation: {
                        title: 'Matrix Lab',
                        url: 'https://learning.test/',
                        start_index: 38,
                        end_index: 41,
                      },
                    },
                  ],
                },
              },
            ],
          }),
        );
      };
    });
    const page = await application.firstWindow();
    useElectronCloseHandling(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page
      .getByLabel('What do you want to learn about?', { exact: true })
      .fill('Build an intuition for linear algebra');
    await page.getByRole('button', { name: 'Start learning' }).click();
    // Guest and development tutor controls are no longer shell destinations.
    // Exercise their supported named preload operations against real main and SQLite.
    // The direct OpenRouter path exists only in development; the packaged app
    // must refuse it (production AI is app-managed through the backend).
    const askFirstStep = async () => {
      const [project] = await window.desktop.listProjects();
      await window.desktop.saveEntry({
        projectId: project!.id,
        kind: 'note',
        title: 'My prediction',
        body: 'A shear will change the angles but preserve the area. I want to check why.',
        url: '',
      });
      return window.desktop.askTutor({
        projectId: project!.id,
        prompt: 'Suggest a practical first step.',
        includePage: false,
      });
    };
    if (PACKAGED) {
      await expect(page.evaluate(askFirstStep)).rejects.toThrow(
        'The development tutor is disabled.',
      );
    } else {
      const initialAnswer = await page.evaluate(askFirstStep);
      const assistant = initialAnswer.entries.find(
        (entry) => entry.kind === 'assistant',
      );
      expect(assistant?.body).toContain(
        'Predict how a shear changes the square [1].',
      );
      expect(assistant?.citations).toEqual([
        {
          title: 'Matrix Lab',
          url: 'https://learning.test/',
          start: 38,
          end: 41,
        },
      ]);
    }
    // Subscribe before openTool, matching ToolHost/practical-tools. Combining
    // subscribe+open+resize in one evaluate left packaged CI with only the
    // did-start-loading snapshot after loadURL resolved.
    const recordedToolStates: ToolState[] = [];
    await page.exposeFunction('reportDesktopToolState', (state: ToolState) => {
      recordedToolStates.push(state);
    });
    await page.evaluate(() => {
      Reflect.set(window, 'toolStates', []);
      window.desktop.onToolState((state) => {
        Reflect.get(window, 'toolStates').push(state);
        void Reflect.get(window, 'reportDesktopToolState')(state);
      });
    });
    await page.evaluate(() =>
      window.desktop.openTool('https://learning.test/'),
    );
    await expect
      .poll(
        async () => {
          const guest = await guestNavigationSnapshot(
            application,
            MATRIX_LAB_URL,
          );
          return {
            guest,
            recorded: JSON.stringify(recordedToolStates),
            renderer: await page.evaluate(() =>
              JSON.stringify(Reflect.get(window, 'toolStates')),
            ),
          };
        },
        {
          timeout: GUEST_COMMIT_TIMEOUT_MS,
          message:
            'Wait until persist:learning-tools webContents commits https://learning.test/ with title Matrix Lab and loading false, and both the preload listener and Playwright bridge have recorded that title.',
        },
      )
      .toEqual({
        guest: {
          url: MATRIX_LAB_URL,
          title: MATRIX_LAB_TITLE,
          loading: false,
        },
        recorded: expect.stringContaining(MATRIX_LAB_TITLE),
        renderer: expect.stringContaining(MATRIX_LAB_TITLE),
      });
    await page.evaluate(() =>
      window.desktop.resizeTool({
        x: 320,
        y: 80,
        width: 480,
        height: 500,
      }),
    );
    const isolation = await application.evaluate(async ({ webContents }) => {
      const guest = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'https://learning.test/');
      return guest?.executeJavaScript(
        '({ node: typeof process, bridge: typeof window.desktop })',
      );
    });
    expect(isolation).toEqual({ node: 'undefined', bridge: 'undefined' });
    const guestBounds = await application.evaluate(
      ({ BrowserWindow, WebContentsView }) =>
        BrowserWindow.getAllWindows()[0]
          ?.contentView.children.find(
            (view) =>
              view instanceof WebContentsView &&
              view.webContents.getURL() === 'https://learning.test/',
          )
          ?.getBounds(),
    );
    expect(guestBounds).toEqual({ x: 320, y: 80, width: 480, height: 500 });
    const guestImage = await application.evaluate(async ({ webContents }) => {
      const guest = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === 'https://learning.test/');
      return (await guest?.capturePage())?.toPNG().toString('base64');
    });
    expect(guestImage).toBeTruthy();
    writeFileSync(
      test.info().outputPath('embedded-page.png'),
      Buffer.from(guestImage ?? '', 'base64'),
    );
    const askGuided = async () => {
      const [project] = await window.desktop.listProjects();
      return window.desktop.askTutor({
        projectId: project!.id,
        prompt: 'Guide this activity using the open page.',
        includePage: true,
      });
    };
    if (PACKAGED) {
      await expect(page.evaluate(askGuided)).rejects.toThrow(
        'The development tutor is disabled.',
      );
      expect(
        await application.evaluate(() =>
          Reflect.has(globalThis, 'lastTutorRequest'),
        ),
      ).toBe(false);
    } else {
      const guided = await page.evaluate(askGuided);
      expect(
        guided.entries.filter((entry) => entry.kind === 'assistant'),
      ).toHaveLength(2);
      const request = await application.evaluate(() =>
        JSON.stringify(Reflect.get(globalThis, 'lastTutorRequest')),
      );
      expect(request).toContain('Change a matrix coefficient');
      expect(request).toContain(
        'A shear will change the angles but preserve the area.',
      );
    }
    await page.evaluate(() => window.desktop.stopTutor());
    await page.screenshot({
      path: test.info().outputPath('guided-workspace.png'),
    });
    // Keep the previous guest hide/restore assertions now that explanations live in Reader.
    await page.evaluate(() =>
      window.desktop.resizeTool({ x: 0, y: 0, width: 0, height: 0 }),
    );
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.contentView.children.some(
          (view) =>
            view.getBounds().width === 0 && view.getBounds().height === 0,
        ),
      ),
    ).toBe(true);
    await page.evaluate(() =>
      window.desktop.resizeTool({ x: 320, y: 80, width: 480, height: 500 }),
    );
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.contentView.children.some(
          (view) =>
            view.getBounds().width === 480 && view.getBounds().height === 500,
        ),
      ),
    ).toBe(true);
    await page.evaluate(() => window.desktop.closeTool());
    expect(
      await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.contentView.children.length,
      ),
    ).toBe(0);
    await page.getByRole('button', { name: 'Applied Research home' }).click();
    await page
      .getByRole('button', { name: /Build an intuition for linear algebra/ })
      .click();
    await expect(
      page.getByText(
        'A shear will change the angles but preserve the area. I want to check why.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Expanded', exact: true }).click();
    const aiRecords = page.locator(
      '.workspace-canvas-node[data-author="assistant"]',
    );
    // The packaged app refused both tutor calls, so no assistant records exist.
    await expect(aiRecords).toHaveCount(PACKAGED ? 0 : 2);
    if (!PACKAGED) {
      await expect(aiRecords.first()).toContainText(
        'Predict how a shear changes the square',
      );
      const aiNode = page
        .locator('.react-flow__node')
        .filter({ has: aiRecords })
        .first();
      await aiNode.focus();
      await aiNode.press('F2');
      await expect(
        page.getByRole('region', { name: 'Learning canvas', exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel('In your own words')).toHaveCount(0);
    }
    await page
      .getByRole('button', { name: 'Profile and settings', exact: true })
      .click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.getByRole('button', { name: 'Back to work' }).click();
    await page.screenshot({
      path: test.info().outputPath('voices-daylight.png'),
    });
    await page
      .getByRole('button', { name: 'Profile and settings', exact: true })
      .click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.getByRole('button', { name: 'Back to work' }).click();
    await page.screenshot({
      path: test.info().outputPath('voices-evening.png'),
    });
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('ports the accepted Opening with live entry, saved rows, fonts and keyboard focus', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-design-'));
  const application = await launch(directory);
  try {
    const page = await application.firstWindow();
    useElectronCloseHandling(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const input = page.getByLabel('What do you want to learn about?', {
      exact: true,
    });
    await expect(input).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await expect
      .poll(() =>
        page
          .locator('.world-art')
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await expect(
      page.getByRole('button', { name: 'Start from a source' }),
    ).toBeDisabled();
    await expect(
      page.getByText('Source import is not available yet.'),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const fonts = await page.evaluate(async () => {
      const families = [
        'Newsreader',
        'Familjen Grotesk',
        'Martian Mono',
        'Fraunces',
      ];
      return Promise.all(
        families.map(async (family) => ({
          family,
          loaded:
            (await document.fonts.load(`400 18px "${family}"`)).length > 0,
        })),
      );
    });
    expect(fonts.every((font) => font.loaded)).toBe(true);
    for (const [width, height] of OPENING_VIEWPORTS) {
      if (!(await resizeViewport(application, page, width!, height!))) continue;
      await page.screenshot({
        path: test.info().outputPath(`opening-empty-${width}x${height}.png`),
      });
    }
    await page.getByRole('button', { name: 'Build something' }).click();
    await expect(input).toBeFocused();
    await input.fill('A robot that can find its way');
    await input.press('Enter');
    await expect(page.locator('.reader-project')).toHaveText(
      'A robot that can find its way',
    );
    await page.getByRole('button', { name: 'Applied Research home' }).click();
    const savedRow = page.getByRole('button', {
      name: /A robot that can find its way/,
    });
    await expect(savedRow).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Your projects' })
        .getByRole('button'),
    ).toHaveCount(1);
    for (const [width, height] of OPENING_VIEWPORTS) {
      if (!(await resizeViewport(application, page, width!, height!))) continue;
      await page.screenshot({
        path: test.info().outputPath(`opening-saved-${width}x${height}.png`),
      });
    }
    await page.getByRole('button', { name: 'Build something' }).focus();
    await page.keyboard.press('Tab');
    await expect(savedRow).toBeFocused();
    await expect(savedRow).toHaveCSS('outline-color', 'rgb(123, 199, 201)');
    await expect(savedRow).toHaveCSS('outline-width', '2px');
    await expect(savedRow).toHaveCSS('outline-style', 'solid');
    await page.screenshot({
      path: test.info().outputPath('opening-row-focus.png'),
    });
    await savedRow.press('Enter');
    await expect(page.locator('.reader-project')).toHaveText(
      'A robot that can find its way',
    );
    await page.getByRole('button', { name: 'Applied Research home' }).click();
    await page.getByRole('button', { name: 'Explore a topic' }).click();
    await expect(input).toBeFocused();
    for (const theme of ['light', 'dark']) {
      await page
        .getByRole('button', {
          name: theme === 'light' ? 'Use daylight theme' : 'Use evening theme',
        })
        .click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await input.focus();
      await expect(input).toHaveCSS('outline-style', 'none');
      await expect(page.locator('.learning-input')).toHaveCSS(
        'transform',
        'matrix(1, 0, 0, 1, 0, -2)',
      );
      expect(
        await page.locator('.learning-input').evaluate((field) => {
          const underline = getComputedStyle(field, '::after');
          return {
            transform: underline.transform,
            opacity: underline.opacity,
            height: underline.height,
          };
        }),
      ).toEqual({
        transform: 'matrix(1, 0, 0, 1, 0, 0)',
        opacity: '1',
        height: '2px',
      });
      await page.screenshot({
        path: test.info().outputPath(`opening-input-focus-${theme}.png`),
      });
      await input.press('Tab');
      const topicButton = page.getByRole('button', { name: 'Explore a topic' });
      await expect(topicButton).toBeFocused();
      await expect(topicButton).toHaveCSS(
        'outline-color',
        'rgb(123, 199, 201)',
      );
      await expect(topicButton).toHaveCSS('outline-width', '2px');
      await expect(topicButton).toHaveCSS('outline-style', 'solid');
      await expect(page.locator('.learning-input')).toHaveCSS(
        'transform',
        'none',
      );
      expect(
        await page.locator('.learning-input').evaluate((field) => {
          const underline = getComputedStyle(field, '::after');
          return {
            transform: underline.transform,
            opacity: underline.opacity,
            height: underline.height,
          };
        }),
      ).toEqual({
        transform: 'matrix(0.84, 0, 0, 1, 0, 0)',
        opacity: '0.52',
        height: '1px',
      });
      await page.screenshot({
        path: test.info().outputPath(`opening-button-focus-${theme}.png`),
      });
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Settings', exact: true }),
    ).toBeVisible();
    await expect(input).toBeHidden();
    await page
      .getByRole('button', { name: 'Back to work', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Settings', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Settings', exact: true }),
    ).toBeFocused();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await input.fill('Observe the placeholder exit');
    await expect(page.locator('.learning-placeholder')).toHaveCSS(
      'filter',
      'blur(3px)',
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.learning-placeholder')).toHaveCSS(
      'filter',
      'none',
    );
    await expect(page.locator('.learning-placeholder')).toHaveCSS(
      'transition-duration',
      '0s',
    );
    await expect(input).toHaveCSS('font-size', '32px');
    const longTopic = 'Robot perception, mapping and uncertainty. '
      .repeat(30)
      .slice(0, 1000);
    await input.fill(longTopic);
    await input.press('End');
    await input.press('x');
    await expect(input).toHaveValue(longTopic);
    const bounds = await input.boundingBox();
    expect(bounds?.height).toBeLessThanOrEqual(240);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath('opening-long-input-820x620.png'),
    });
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page.locator('.reader-project')).toHaveText(longTopic.trim());
    await page.getByRole('button', { name: 'Applied Research home' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Your projects' })
        .getByRole('button'),
    ).toHaveCount(2);
    await page
      .getByRole('button', { name: /A robot that can find its way/ })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath('opening-long-saved-820x620.png'),
    });
    await page
      .getByRole('button', { name: /A robot that can find its way/ })
      .click();
    await expect(page.locator('.reader-project')).toHaveText(
      'A robot that can find its way',
    );
    const projects = await page.evaluate(() => window.desktop.listProjects());
    expect(projects.map((project) => project.goal)).toEqual(
      expect.arrayContaining([
        'A robot that can find its way',
        longTopic.trim(),
      ]),
    );
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('retains the topic and focus after real bridge creation failures and suppresses duplicate submits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-failure-'));
  const application = await launch(directory);
  try {
    const page = await application.firstWindow();
    useElectronCloseHandling(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const input = page.getByLabel('What do you want to learn about?', {
      exact: true,
    });
    await expect(input).toBeVisible();
    // The isolated main-process handler is a fault injection; success/persistence use the real store above.
    await application.evaluate(({ ipcMain }) => {
      Reflect.set(globalThis, 'creationAttempts', 0);
      ipcMain.removeHandler('workspace:create');
      ipcMain.handle('workspace:create', async () => {
        Reflect.set(
          globalThis,
          'creationAttempts',
          Number(Reflect.get(globalThis, 'creationAttempts')) + 1,
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
        throw new Error('Test storage unavailable');
      });
    });
    await input.fill('Learn how robots localize');
    await page.getByRole('form', { name: 'New project' }).evaluate((form) => {
      if (form instanceof HTMLFormElement) {
        form.requestSubmit();
        form.requestSubmit();
      }
    });
    await expect(page.getByRole('alert')).toContainText(
      'Test storage unavailable',
    );
    expect(
      await application.evaluate(() =>
        Reflect.get(globalThis, 'creationAttempts'),
      ),
    ).toBe(1);
    await expect(input).toHaveValue('Learn how robots localize');
    await expect(input).toBeFocused();
    await expect(page.getByRole('alert').locator('p').first()).toHaveText(
      'Test storage unavailable',
    );
    await expect(page.getByRole('alert').locator('p').last()).toHaveText(
      'Your topic is still here. Try again.',
    );
    await expect(input).toHaveCSS('outline-style', 'none');
    for (const [width, height] of OPENING_VIEWPORTS) {
      if (!(await resizeViewport(application, page, width!, height!))) continue;
      await page.screenshot({
        path: test
          .info()
          .outputPath(`opening-creation-failure-${width}x${height}.png`),
      });
    }
    await input.fill('Learn how robots map a room');
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Your topic is still here. Try again.',
    );
    expect(
      await application.evaluate(() =>
        Reflect.get(globalThis, 'creationAttempts'),
      ),
    ).toBe(2);
    await expect(input).toHaveValue('Learn how robots map a room');
    expect(await page.evaluate(() => window.desktop.listProjects())).toEqual(
      [],
    );
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});
