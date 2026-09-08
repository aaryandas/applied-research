import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { cpus, platform, release, tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  closeTestApplication,
  useElectronCloseHandling,
  electronLaunchArgs,
} from './electron-lifecycle';

const evidence = process.env.AR24_EVIDENCE_DIR;
async function launchExplanationApplication(
  directory: string,
): Promise<ElectronApplication> {
  const requestedExecutablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const extraArgs = electronLaunchArgs();
  const application = await electron.launch({
    ...(requestedExecutablePath
      ? { executablePath: requestedExecutablePath, args: extraArgs }
      : { args: ['.', ...extraArgs] }),
    env: {
      ...process.env,
      APPLIED_RESEARCH_DATA_DIR: directory,
      OPENROUTER_API_KEY: '',
    },
  });
  if (!requestedExecutablePath) return application;
  try {
    const actual = await application.evaluate(({ app }) => ({
      executablePath: app.getPath('exe'),
      isPackaged: app.isPackaged,
    }));
    expect(actual.isPackaged).toBe(true);
    expect(realpathSync(actual.executablePath)).toBe(
      realpathSync(requestedExecutablePath),
    );
    return application;
  } catch (error) {
    await closeTestApplication(application);
    throw error;
  }
}
function artifact(name: string): string {
  return evidence ? join(evidence, name) : test.info().outputPath(name);
}
async function openExplanations(
  application: ElectronApplication,
): Promise<Page> {
  const page = await application.firstWindow();
  useElectronCloseHandling(page);
  await page
    .getByLabel('What do you want to learn about?', { exact: true })
    .fill('Inspect an assembly and a robot arm');
  await page.getByRole('button', { name: 'Start learning' }).click();
  await expect(
    page.getByRole('region', { name: 'Interactive explanations' }),
  ).toBeVisible();
  return page;
}
async function captureRecord(page: Page): Promise<Record<string, unknown>> {
  const section = page.locator('.explanation-experience:visible');
  await section.getByText('Recipe and origin', { exact: true }).click();
  const data = JSON.parse(
    await section.getByLabel('Captured scene record').innerText(),
  ) as Record<string, unknown>;
  await section.getByText('Recipe and origin', { exact: true }).click();
  return data;
}

test('manipulates actual local scenes, measures endpoints, pauses, and recovers context loss', async () => {
  test.setTimeout(90_000);
  if (evidence) mkdirSync(evidence, { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'ar24-scenes-'));
  const application = await launchExplanationApplication(directory);
  try {
    const page = await openExplanations(application);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      const metrics = {
        drawCalls: 0,
        pendingInputAt: 0,
        inputToDrawMs: [] as number[],
      };
      Reflect.set(window, 'ar24Metrics', metrics);
      document.addEventListener('input', (event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.closest('.explanation-parameters')
        )
          metrics.pendingInputAt = performance.now();
      });
      const draw = WebGL2RenderingContext.prototype.drawElements;
      WebGL2RenderingContext.prototype.drawElements = function (...args) {
        metrics.drawCalls++;
        if (metrics.pendingInputAt) {
          metrics.inputToDrawMs.push(
            performance.now() - metrics.pendingInputAt,
          );
          metrics.pendingInputAt = 0;
        }
        return Reflect.apply(draw, this, args);
      };
    });
    const launchStart = performance.now();
    await page.getByRole('button', { name: 'Explore an assembly' }).click();
    await expect(
      page.getByRole('button', { name: 'Capture assembly' }),
    ).toBeEnabled();
    const usableMs = performance.now() - launchStart;
    await expect(page.locator('.explanation-viewport canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Explode', exact: true }).click();
    await page
      .getByRole('button', { name: 'Upper shell', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Upper shell', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    const canvas = page.locator('.explanation-viewport canvas');
    await canvas.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await expect(canvas).toBeFocused();
    await page.getByRole('button', { name: 'Capture assembly' }).click();
    const assemblyRecord = await captureRecord(page);
    expect(assemblyRecord).toMatchObject({
      attribution: 'app-measured',
      retention: 'session-only',
      explanation: {
        recipe: 'spatial-assembly',
        version: 1,
        origin: null,
        parameters: { separation: 1, selectedPart: 'cover' },
      },
      measurement: { positions: { cover: { y: 2.34 } } },
    });
    await canvas.focus();
    await page.keyboard.press('Home');
    await page
      .locator('.reader-main')
      .evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: artifact('assembly-exploded.png') });
    await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
    await page.getByRole('button', { name: 'Capture assembly' }).click();
    expect(await captureRecord(page)).toMatchObject({
      measurement: { positions: { cover: { y: 0.94 } } },
    });
    await page.getByRole('button', { name: 'Base plate', exact: true }).click();
    await canvas.click();
    await expect(
      page.getByRole('button', { name: 'Beacon core', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Capture assembly' }).click();
    const beforeDrag = await captureRecord(page);
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Scene viewport missing');
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 60,
      bounds.y + bounds.height / 2 + 20,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.getByRole('button', { name: 'Capture assembly' }).click();
    const afterDrag = await captureRecord(page);
    expect(afterDrag.camera).not.toEqual(beforeDrag.camera);
    expect(afterDrag.explanation).toEqual(beforeDrag.explanation);
    await page
      .getByRole('button', { name: 'Explore a two-link arm', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeEnabled();
    await expect(page.locator('.explanation-viewport canvas')).toHaveCount(1);
    const timings: number[] = [];
    for (const [shoulder, elbow, expectedX, expectedY] of [
      [0, 0, 3.5, 0],
      [90, 0, 0, 3.5],
      [0, 90, 2, 1.5],
      [90, 90, -1.5, 2],
    ]) {
      const start = performance.now();
      await page.getByLabel('Shoulder angle (°)').fill(String(shoulder));
      await page.getByLabel('Elbow angle (°)').fill(String(elbow));
      await page.getByRole('button', { name: 'Capture endpoint' }).click();
      timings.push(performance.now() - start);
      const record = await captureRecord(page);
      const endpoint = (
        record.measurement as { endpoint: { x: number; y: number; z: number } }
      ).endpoint;
      expect(endpoint.x).toBeCloseTo(expectedX!, 10);
      expect(endpoint.y).toBeCloseTo(expectedY!, 10);
      expect(endpoint.z).toBe(0);
      writeFileSync(
        artifact(`arm-${shoulder}-${elbow}.json`),
        JSON.stringify(record, null, 2),
      );
    }
    await page.getByLabel('First link length').fill('4');
    await expect(page.getByRole('alert')).toContainText('between 0.5 and 3');
    await page.getByLabel('First link length').fill('2');
    await page.getByLabel('Elbow angle (°)').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByLabel('Elbow angle (°)')).toHaveValue('91');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByLabel('Elbow angle (°)')).toHaveValue('60');
    for (const [width, height] of [
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
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      await page
        .locator('.reader-main')
        .evaluate((element) => element.scrollTo(0, 0));
      await expect(page.locator('.explanation-viewport:visible')).toBeVisible();
      const overflow = await page
        .locator('.reader-main')
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      const widths = await page.locator('.reader-main').evaluate((element) => {
        const edge = element.getBoundingClientRect().right;
        return Array.from(element.querySelectorAll('*'))
          .filter((child) => child.getBoundingClientRect().right > edge)
          .map((child) => ({
            tag: child.tagName,
            class: child.className,
            width: child.getBoundingClientRect().width,
          }));
      });
      expect(overflow, JSON.stringify({ width, widths })).toBe(false);
      await page.screenshot({ path: artifact(`arm-${width}x${height}.png`) });
    }
    const stationaryDraws = await page.evaluate(async () => {
      const metrics = Reflect.get(window, 'ar24Metrics') as {
        drawCalls: number;
      };
      await new Promise((resolve) => setTimeout(resolve, 150));
      const before = metrics.drawCalls;
      await new Promise((resolve) => setTimeout(resolve, 250));
      return metrics.drawCalls - before;
    });
    expect(stationaryDraws).toBe(0);
    const context = await canvas.evaluate((element) => {
      const gl = (element as HTMLCanvasElement).getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_lose_context');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer: unknown = debug
        ? gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : 'unavailable';
      if (!extension)
        throw new Error('WEBGL_lose_context unavailable on actual runtime');
      extension.loseContext();
      return { renderer };
    });
    await expect(page.getByText(/3D view unavailable/)).toBeVisible();
    await expect(page.locator('.explanation-axis')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeDisabled();
    await expect(page.locator('.explanation-viewport canvas')).toHaveCount(0);
    await page.getByLabel('Shoulder angle (°)').fill('0');
    await page.screenshot({ path: artifact('context-loss-fallback.png') });
    await page.getByRole('button', { name: 'Retry 3D view' }).click();
    await expect(
      page.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeEnabled();
    await expect(page.getByLabel('Shoulder angle (°)')).toHaveValue('0');
    await application.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0]?.focus();
    });
    await expect
      .poll(() => page.evaluate(() => document.hasFocus()))
      .toBe(true);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.minimize(),
    );
    await expect
      .poll(() =>
        application.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.isMinimized(),
        ),
      )
      .toBe(true);
    const minimizedVisibility = await page.evaluate(async () => {
      const metrics = Reflect.get(window, 'ar24Metrics') as {
        drawCalls: number;
      };
      const before = metrics.drawCalls;
      await new Promise((resolve) => setTimeout(resolve, 250));
      return {
        hidden: document.hidden,
        focused: document.hasFocus(),
        drawCallsOver250Ms: metrics.drawCalls - before,
      };
    });
    expect(minimizedVisibility.drawCallsOver250Ms).toBe(0);
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.restore();
      window?.show();
    });
    await expect(
      page.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Close explanation', exact: true })
      .click();
    await expect(page.locator('.explanation-viewport canvas')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Interactive explanations' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Explore an assembly' }).click();
    await expect(
      page
        .getByRole('region', { name: 'Beacon module explanation' })
        .getByText('Captured · app-measured'),
    ).toBeVisible();
    expect(errors).toEqual([]);
    writeFileSync(
      artifact('responsiveness.json'),
      JSON.stringify(
        {
          machine: {
            platform: platform(),
            release: release(),
            cpu: cpus()[0]?.model,
          },
          gpu: context,
          minimizedVisibility,
          focusAutomationLimitation:
            'Playwright emulates page focus. These minimized-window observations do not establish manual native visibility behavior.',
          renderMetrics: await page.evaluate(
            () => Reflect.get(window, 'ar24Metrics') as unknown,
          ),
          stationaryDrawsOver250Ms: stationaryDraws,
          assemblyLaunchToEnabledCaptureMs: usableMs,
          twoParameterEditsAndCaptureMs: timings,
          scope:
            'Actual Electron on this machine, Playwright inclusive wall times; no SLA or remote-render claim.',
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('offers usable text and parameters when WebGL context creation is unavailable', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ar24-no-webgl-'));
  const application = await launchExplanationApplication(directory);
  try {
    const page = await openExplanations(application);
    // Fault injection at the browser boundary: exercise real Three initialization failure.
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: function (
          this: HTMLCanvasElement,
          type: string,
          ...options: unknown[]
        ) {
          if (
            type === 'webgl2' ||
            type === 'webgl' ||
            type === 'experimental-webgl'
          )
            return null;
          return Reflect.apply(original, this, [type, ...options]);
        },
      });
    });
    await page.getByRole('button', { name: 'Explore a two-link arm' }).click();
    await expect(page.getByText(/3D view unavailable/)).toBeVisible();
    await expect(page.locator('.explanation-axis')).toHaveCount(0);
    await page.getByLabel('Shoulder angle (°)').fill('0');
    await page.getByLabel('Elbow angle (°)').fill('0');
    await expect(
      page.getByText('Endpoint · X 3.500 · Y 0.000 · Z 0.000', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeDisabled();
    await page.screenshot({ path: artifact('webgl-unavailable.png') });
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('preserves typed arm drafts and exact camera pose across blur and focus', async () => {
  if (evidence) mkdirSync(evidence, { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'ar24-repair-'));
  const application = await launchExplanationApplication(directory);
  try {
    const page = await openExplanations(application);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: 'Explore a two-link arm' }).click();
    const capture = page.getByRole('button', { name: 'Capture endpoint' });
    await expect(capture).toBeEnabled();
    const shoulder = page.getByLabel('Shoulder angle (°)');
    const length = page.getByLabel('First link length');
    const endpoint = page.locator('.explanation-measurement:visible');
    const initialEndpoint = await endpoint.textContent();
    await shoulder.focus();
    await shoulder.press('ControlOrMeta+A');
    await shoulder.press('Backspace');
    await expect(shoulder).toHaveValue('');
    await expect(capture).toBeDisabled();
    await shoulder.pressSequentially('-');
    await expect(shoulder).toHaveValue('-');
    await expect(endpoint).toHaveText(initialEndpoint!);
    await expect(capture).toBeDisabled();
    await shoulder.pressSequentially('45');
    await expect(shoulder).toHaveValue('-45');
    await expect(capture).toBeEnabled();
    const angleEndpoint = await endpoint.textContent();
    await length.focus();
    await length.press('ControlOrMeta+A');
    await length.press('Backspace');
    for (const [character, expected] of [
      ['0', '0'],
      ['.', '0.'],
    ]) {
      await length.pressSequentially(character!);
      await expect(length).toHaveValue(expected!);
      await expect(endpoint).toHaveText(angleEndpoint!);
      await expect(capture).toBeDisabled();
    }
    await page
      .getByRole('button', { name: 'Close explanation', exact: true })
      .click();
    await expect(page.locator('.explanation-viewport canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Explore a two-link arm' }).click();
    await expect(length).toHaveValue('0.');
    await expect(capture).toBeDisabled();
    await length.focus();
    await length.press('End');
    await length.pressSequentially('7');
    await expect(length).toHaveValue('0.7');
    await expect(capture).toBeEnabled();
    await capture.click();
    const typedRecord = await captureRecord(page);
    expect(typedRecord).toMatchObject({
      explanation: {
        parameters: {
          firstLength: 0.7,
          secondLength: 1.5,
          shoulderDegrees: -45,
          elbowDegrees: 60,
        },
      },
    });
    const measured = (
      typedRecord.measurement as { endpoint: { x: number; y: number } }
    ).endpoint;
    // Independent special-angle identities: cos(-45), sin(-45), cos(15), sin(15).
    expect(measured.x).toBeCloseTo(
      0.7 * Math.SQRT1_2 + (1.5 * (Math.sqrt(6) + Math.sqrt(2))) / 4,
      10,
    );
    expect(measured.y).toBeCloseTo(
      -0.7 * Math.SQRT1_2 + (1.5 * (Math.sqrt(6) - Math.sqrt(2))) / 4,
      10,
    );
    await length.focus();
    await length.press('ControlOrMeta+A');
    await length.pressSequentially('4');
    await expect(length).toHaveValue('4');
    await expect(capture).toBeDisabled();
    expect(await captureRecord(page)).toEqual(typedRecord);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(length).toHaveValue('2');
    await expect(shoulder).toHaveValue('30');
    await expect(capture).toBeEnabled();
    await shoulder.focus();
    await shoulder.press('ControlOrMeta+A');
    await shoulder.pressSequentially('-');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(shoulder).toHaveValue('30');
    await expect(capture).toBeEnabled();
    const canvas = page.locator('.explanation-viewport canvas');
    await canvas.focus();
    await canvas.press('ArrowRight');
    await canvas.press('+');
    await capture.click();
    const beforeBlur = await captureRecord(page);
    await page.evaluate(() => {
      Reflect.set(
        window,
        'ar24CanvasBeforeBlur',
        document.querySelector('.explanation-viewport canvas'),
      );
      window.dispatchEvent(new Event('blur'));
    });
    await expect(capture).toBeEnabled();
    await expect(canvas).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await capture.click();
    const afterFocus = await captureRecord(page);
    expect(afterFocus.camera).toEqual(beforeBlur.camera);
    expect(
      await page.evaluate(
        () =>
          Reflect.get(window, 'ar24CanvasBeforeBlur') ===
          document.querySelector('.explanation-viewport canvas'),
      ),
    ).toBe(true);
    writeFileSync(
      artifact('repair-regressions.json'),
      JSON.stringify(
        {
          typedRecord,
          beforeBlur,
          afterFocus,
          sameCanvasAcrossBlur: true,
          focusCoverage:
            'Synthetic window blur/focus reproduces the reviewed listener path in actual Electron. Playwright focus emulation prevents claims about manual native minimize behavior.',
        },
        null,
        2,
      ),
    );
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});
