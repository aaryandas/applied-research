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
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /I'm building/,
    );
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'require')),
    ).toBe('undefined');
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'process')),
    ).toBe('undefined');
    await page.evaluate(() => window.open('https://example.com'));
    expect(application.windows()).toHaveLength(1);
    await page.getByRole('button', { name: 'Start from a question' }).click();
    await page
      .getByLabel('Learning goal', { exact: true })
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
    await page.getByRole('button', { name: 'Start from a question' }).click();
    await page
      .getByLabel('Learning goal', { exact: true })
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

test('ports the approved opening and native dialog behavior at desktop sizes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'applied-electron-design-'));
  const application = await launch(directory);
  try {
    const page = await application.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /I'm building/,
    );
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
    for (const [width, height] of [
      [1440, 900],
      [1000, 680],
    ]) {
      await application.evaluate(
        ({ BrowserWindow }, size) =>
          BrowserWindow.getAllWindows()[0]?.setContentSize(
            size.width,
            size.height,
          ),
        { width: width!, height: height! },
      );
      await page.screenshot({
        path: test.info().outputPath(`opening-${width}.png`),
      });
    }
    await page.getByRole('button', { name: 'Start from a question' }).click();
    await expect(
      page.getByLabel('Learning goal', { exact: true }),
    ).toBeFocused();
    await page
      .getByLabel('Learning goal', { exact: true })
      .fill('Learn how a robot estimates its position');
    await page.screenshot({ path: test.info().outputPath('goal-dialog.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Start from a question' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Connect OpenRouter' }).click();
    await page.screenshot({
      path: test.info().outputPath('settings-daylight.png'),
    });
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Connect OpenRouter' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Use evening theme' }).click();
    await page.getByRole('button', { name: 'Connect OpenRouter' }).click();
    await page.screenshot({
      path: test.info().outputPath('settings-evening.png'),
    });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Start from a question' }).click();
    await expect(page.getByLabel('Learning goal', { exact: true })).toHaveValue(
      'Learn how a robot estimates its position',
    );
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Learn how a robot estimates its position',
    );
    await page.screenshot({
      path: test.info().outputPath('workspace-narrow-evening.png'),
    });
  } finally {
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
