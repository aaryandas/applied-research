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

import type { SceneLocalState } from '../../src/contracts/explanation-artifacts';
import {
  closeTestApplication,
  useElectronCloseHandling,
} from './electron-lifecycle';
import { desktopE2EEnv } from './desktop-e2e-env';
import {
  packagedDesktopRuntime,
  startLearningWorkspace,
} from './start-learning-workspace';

const evidence = process.env.AR24_EVIDENCE_DIR;
const ASSEMBLY_QUOTE = 'A beacon module stacks a base, board, core and cover.';
const ARM_QUOTE =
  'A planar two-link arm places the hand by composing two joint rotations.';
const SOURCE_TEXT = `${ASSEMBLY_QUOTE} ${ARM_QUOTE}`;

async function launchExplanationApplication(
  directory: string,
): Promise<ElectronApplication> {
  const requestedExecutablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const application = await electron.launch({
    ...(requestedExecutablePath
      ? { executablePath: requestedExecutablePath, args: [] }
      : { args: ['.'] }),
    env: desktopE2EEnv(directory),
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

async function openContextualWorkspace(
  application: ElectronApplication,
): Promise<Page> {
  const page = await application.firstWindow();
  useElectronCloseHandling(page);
  await startLearningWorkspace(page, 'Inspect an assembly and a robot arm');
  await expect(
    page.getByRole('button', { name: 'Add source', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add source', exact: true }).click();
  await page.getByLabel('Source title').fill('Planar arm and assembly notes');
  await page.getByLabel('Exact source text').fill(SOURCE_TEXT);
  await page
    .getByRole('button', { name: 'Import source', exact: true })
    .click();
  await expect(page.getByLabel('Source text')).toHaveText(SOURCE_TEXT);
  await expect(
    page.getByRole('button', { name: 'Ask about this' }),
  ).toBeVisible();
  return page;
}

async function selectSourceQuote(page: Page, quote: string): Promise<void> {
  const found = await page
    .getByLabel('Source text')
    .evaluate((element, text) => {
      const node = element.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) return false;
      const value = node.textContent ?? '';
      const start = value.indexOf(text);
      if (start < 0) return false;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return true;
    }, quote);
  expect(found).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Ask about this' }),
  ).toBeEnabled();
}

async function retainSelection(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Ask about this' }).click();
  await expect(
    page.getByRole('region', { name: 'Contextual explanation' }),
  ).toBeVisible();
}

async function requestVisual(page: Page, question?: string): Promise<void> {
  const panel = page.getByRole('region', { name: 'Contextual explanation' });
  if (question) {
    await panel.getByLabel('Your question').fill(question);
  }
  await panel.getByRole('button', { name: 'Visual explanation' }).click();
}

async function readTrustedCapture(
  page: Page,
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await page.getByLabel('Captured scene record').innerText(),
  ) as Record<string, unknown>;
}

async function currentVisualExplanationId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const [project] = await window.desktop.listProjects();
    if (!project) throw new Error('Start learning did not create a project.');
    const listed = await window.desktop.listRetainedExplanations({
      projectId: project.id,
    });
    const visual = listed.find((item) => item.intent === 'visual');
    if (!visual) throw new Error('No retained visual explanation.');
    return visual.explanationId;
  });
}

async function loadSceneState(
  page: Page,
  explanationId: string,
): Promise<SceneLocalState | null> {
  return page.evaluate(async (id) => {
    const [project] = await window.desktop.listProjects();
    if (!project) throw new Error('missing project');
    return window.desktop.loadExplanationSceneState({
      projectId: project.id,
      explanationId: id,
    });
  }, explanationId);
}

test('manipulates actual local scenes, measures endpoints, pauses, and recovers context loss', async () => {
  test.skip(
    packagedDesktopRuntime(),
    'Visual persist is unpackaged test-transport only; packaged production requires authenticated planner.',
  );
  test.skip(
    process.platform !== 'darwin',
    'Capture stays disabled without a real GPU (xvfb / Windows CI).',
  );
  test.info().annotations.push({
    type: 'not-acceptance',
    description:
      'Automated Electron evidence for the mounted contextual scene path. Root/mac CI owns platform proof. This is not MP4 or live-provider acceptance.',
  });
  test.setTimeout(90_000);
  if (evidence) mkdirSync(evidence, { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'ar24-scenes-'));
  const application = await launchExplanationApplication(directory);
  try {
    const page = await openContextualWorkspace(application);
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
    await selectSourceQuote(page, ASSEMBLY_QUOTE);
    await retainSelection(page);
    const launchStart = performance.now();
    await requestVisual(page);
    await expect(
      page.getByRole('region', { name: 'Beacon module explanation' }),
    ).toBeVisible();
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
    const assemblyRecord = await readTrustedCapture(page);
    expect(assemblyRecord).toMatchObject({
      kind: 'app-measured',
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
    expect(await readTrustedCapture(page)).toMatchObject({
      measurement: { positions: { cover: { y: 0.94 } } },
    });
    await page.getByRole('button', { name: 'Base plate', exact: true }).click();
    await canvas.click();
    await expect(
      page.getByRole('button', { name: 'Beacon core', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Capture assembly' }).click();
    const assemblyExplanationId = await currentVisualExplanationId(page);
    const beforeDrag = await loadSceneState(page, assemblyExplanationId);
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
    await expect
      .poll(async () => {
        const next = await loadSceneState(page, assemblyExplanationId);
        return JSON.stringify(next?.camera);
      })
      .not.toBe(JSON.stringify(beforeDrag?.camera));
    const afterDrag = await loadSceneState(page, assemblyExplanationId);
    expect(afterDrag?.parameters).toEqual(beforeDrag?.parameters);
    await selectSourceQuote(page, ARM_QUOTE);
    await retainSelection(page);
    await requestVisual(page, 'Show a two-link arm');
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
      const record = await readTrustedCapture(page);
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
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(
      page.getByRole('region', { name: 'Learning canvas' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reading' }).click();
    await expect(
      page.getByRole('button', { name: 'Capture endpoint' }),
    ).toBeEnabled();
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
            'Actual Electron on this machine through the mounted contextual help path and desktop-e2e test transport. Playwright inclusive wall times; no SLA, live-provider, or MP4 claim.',
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
  test.skip(
    packagedDesktopRuntime(),
    'Visual persist is unpackaged test-transport only; packaged production requires authenticated planner.',
  );
  test.info().annotations.push({
    type: 'not-acceptance',
    description:
      'Automated Electron evidence for honest WebGL fallback on the mounted contextual scene. Not MP4 acceptance.',
  });
  const directory = mkdtempSync(join(tmpdir(), 'ar24-no-webgl-'));
  const application = await launchExplanationApplication(directory);
  try {
    const page = await openContextualWorkspace(application);
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
    await selectSourceQuote(page, ARM_QUOTE);
    await retainSelection(page);
    await requestVisual(page, 'Show a two-link arm');
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
  test.skip(
    packagedDesktopRuntime(),
    'Visual persist is unpackaged test-transport only; packaged production requires authenticated planner.',
  );
  test.skip(
    process.platform !== 'darwin',
    'Capture stays disabled without a real GPU (xvfb / Windows CI).',
  );
  test.info().annotations.push({
    type: 'not-acceptance',
    description:
      'Automated Electron evidence for retained arm drafts through the mounted contextual scene. Not MP4 acceptance.',
  });
  if (evidence) mkdirSync(evidence, { recursive: true });
  const directory = mkdtempSync(join(tmpdir(), 'ar24-repair-'));
  const application = await launchExplanationApplication(directory);
  try {
    const page = await openContextualWorkspace(application);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await selectSourceQuote(page, ARM_QUOTE);
    await retainSelection(page);
    await requestVisual(page, 'Show a two-link arm');
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
    await page.getByRole('button', { name: 'Canvas' }).click();
    await expect(
      page.getByRole('region', { name: 'Learning canvas' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reading' }).click();
    await expect(length).toHaveValue('0.');
    await expect(capture).toBeDisabled();
    await length.focus();
    await length.press('End');
    await length.pressSequentially('7');
    await expect(length).toHaveValue('0.7');
    await expect(capture).toBeEnabled();
    await capture.click();
    const typedRecord = await readTrustedCapture(page);
    const explanationId = await currentVisualExplanationId(page);
    const typedScene = await loadSceneState(page, explanationId);
    expect(typedScene?.parameters).toMatchObject({
      firstLength: 0.7,
      secondLength: 1.5,
      shoulderDegrees: -45,
      elbowDegrees: 60,
    });
    const measured = (
      typedRecord.measurement as { endpoint: { x: number; y: number } }
    ).endpoint;
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
    expect(await readTrustedCapture(page)).toEqual(typedRecord);
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
    const beforeBlur = await loadSceneState(page, explanationId);
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
    const afterFocus = await loadSceneState(page, explanationId);
    expect(afterFocus?.camera).toEqual(beforeBlur?.camera);
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
            'Synthetic window blur/focus reproduces the reviewed listener path in actual Electron through the mounted contextual scene. Playwright focus emulation prevents claims about manual native minimize behavior.',
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
