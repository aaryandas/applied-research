import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

test('saves an offline learning space, edits and layout across a real Electron restart', async () => {
  test.setTimeout(60_000);
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-'));
  let application = await launch(directory);
  try {
    const page = await application.firstWindow();
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
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await page.getByLabel('note title').fill('My first prediction');
    await page
      .getByLabel('note text')
      .fill('A shear preserves the area of the square.');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'Move My first prediction' })
      .press('ArrowRight');
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.desktop.listProjects()))[0]
            ?.entries[0]?.x,
      )
      .toBe(72);
    await page.getByRole('button', { name: 'Experiment', exact: true }).click();
    await page.getByLabel('Matrix a').fill('1.5');
    await page.getByRole('button', { name: 'Capture result' }).click();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.desktop.listProjects()))[0]?.entries
            .length,
      )
      .toBe(3);
    await expect(page.locator('.entry-count')).toContainText('3');
    await page
      .locator('.canvas-scroll')
      .evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: test.info().outputPath('workspace.png') });
    expect(errors).toEqual([]);
    await application.close();
    application = await launch(directory);
    const reopened = await application.firstWindow();
    await reopened
      .getByRole('button', { name: /Understand linear transformations/ })
      .click();
    await expect(reopened.getByRole('heading', { level: 1 })).toHaveText(
      'Understand linear transformations',
    );
    await expect(reopened.getByLabel('note text')).toHaveValue(
      'A shear preserves the area of the square.',
    );
    await expect(reopened.getByLabel('result text')).toHaveValue(/Matrix/);
    const projects = await reopened.evaluate(() =>
      window.desktop.listProjects(),
    );
    expect(
      projects[0]?.entries.find((entry) => entry.kind === 'result')?.body,
    ).toContain('Matrix [[1.5, 0.5]');
  } finally {
    await application.close();
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
              '<html><head><title>Matrix Lab</title></head><body><h1>Matrix Lab</h1><p>Change a matrix coefficient and observe the square.</p></body></html>',
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page
      .getByLabel('What do you want to learn about?', { exact: true })
      .fill('Build an intuition for linear algebra');
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page.getByText('AI · source-led guidance')).toBeVisible();
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await page.getByLabel('note title').fill('My prediction');
    await page
      .getByLabel('note text')
      .fill(
        'A shear will change the angles but preserve the area. I want to check why.',
      );
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Matrix Lab/ }).click();
    await expect(
      page.getByRole('complementary', { name: 'Embedded source or tool' }),
    ).toBeVisible();
    await expect(
      page.getByText('Matrix Lab', { exact: true }).last(),
    ).toBeVisible();
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
    expect(guestBounds?.width).toBeGreaterThan(300);
    expect(guestBounds?.height).toBeGreaterThan(400);
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
    await page.getByRole('button', { name: 'Guide me' }).click();
    await expect(page.getByText('Guiding this activity')).toBeVisible();
    await expect
      .poll(async () =>
        application.evaluate(() =>
          JSON.stringify(Reflect.get(globalThis, 'lastTutorRequest')),
        ),
      )
      .toContain('Change a matrix coefficient');
    await page.getByRole('button', { name: 'Stop guidance' }).click();
    await page
      .locator('.canvas-scroll')
      .evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath('guided-workspace.png'),
    });
    await page.getByRole('button', { name: 'Close tool' }).click();
    await expect(
      page.getByRole('complementary', { name: 'Embedded source or tool' }),
    ).toHaveCount(0);
    await page
      .locator('.canvas-scroll')
      .evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath('voices-daylight.png'),
    });
    await page.getByRole('button', { name: 'Use evening theme' }).click();
    await page.screenshot({
      path: test.info().outputPath('voices-evening.png'),
    });
  } finally {
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('ports the accepted Opening with live entry, saved rows, fonts and keyboard focus', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-design-'));
  const application = await launch(directory);
  try {
    const page = await application.firstWindow();
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
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [820, 620],
    ]) {
      await application.evaluate(
        ({ BrowserWindow }, size) => {
          const window = BrowserWindow.getAllWindows()[0];
          window?.setMinimumSize(820, 620);
          window?.setContentSize(size.width, size.height);
        },
        { width: width!, height: height! },
      );
      await expect
        .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([width, height]);
      await page.screenshot({
        path: test.info().outputPath(`opening-empty-${width}x${height}.png`),
      });
    }
    await page.getByRole('button', { name: 'Build something' }).click();
    await expect(input).toBeFocused();
    await input.fill('A robot that can find its way');
    await input.press('Enter');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
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
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [820, 620],
    ]) {
      await application.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0]?.setContentSize(
            size.width,
            size.height,
          ),
        { width: width!, height: height! },
      );
      await expect
        .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([width, height]);
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'A robot that can find its way',
    );
    await page.getByRole('button', { name: 'Applied Research home' }).click();
    await page.getByRole('button', { name: 'Explore a topic' }).click();
    await expect(input).toBeFocused();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark')
        await page.getByRole('button', { name: 'Use evening theme' }).click();
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
    await page.getByRole('button', { name: 'Connect OpenRouter' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Connect OpenRouter' }),
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      longTopic.trim(),
    );
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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
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
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('retains the topic and focus after real bridge creation failures and suppresses duplicate submits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-failure-'));
  const application = await launch(directory);
  try {
    const page = await application.firstWindow();
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
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [820, 620],
    ]) {
      await application.evaluate(
        ({ BrowserWindow }, size) => {
          const window = BrowserWindow.getAllWindows()[0];
          window?.setMinimumSize(820, 620);
          window?.setContentSize(size.width, size.height);
        },
        { width: width!, height: height! },
      );
      await expect
        .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
        .toEqual([width, height]);
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
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
