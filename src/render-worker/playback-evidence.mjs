/* global window */
import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const evidence = resolve(process.argv[2] ?? '/private/tmp/ar-manim-evidence');
await mkdir(join(evidence, 'playback'), { recursive: true });
const data = await mkdtemp(join(evidence, 'electron-data-'));
const application = await electron.launch({
  args: [
    fileURLToPath(new URL('./playback-harness/main.mjs', import.meta.url)),
  ],
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    AR_MANIM_HARNESS_DATA: data,
  },
  recordVideo: {
    dir: join(evidence, 'playback'),
    size: { width: 1340, height: 940 },
  },
});
const records = [];
try {
  const page = await application.firstWindow();
  await page.waitForFunction(
    () => typeof window.loadExplanation === 'function',
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const name of [
    'linear-shear',
    'weighted-shares',
    'linear-right-angle',
    'linear-collapse',
    'weighted-zero-share',
    'weighted-zero-result',
  ]) {
    const artifact = JSON.parse(
      await readFile(join(evidence, 'renders', `${name}.json`), 'utf8'),
    );
    const source = pathToFileURL(join(evidence, 'renders', `${name}.mp4`)).href;
    await page.evaluate(
      ({ source, artifact }) => window.loadExplanation(source, artifact),
      { source, artifact },
    );
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.readyState))
      .toBeGreaterThanOrEqual(1);
    const metadata = await page.locator('video').evaluate((video) => ({
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      paused: video.paused,
      initialTime: video.currentTime,
    }));
    assert.deepEqual(metadata, {
      duration: 10,
      width: 1280,
      height: 720,
      paused: true,
      initialTime: 0,
    });
    await page.locator('video').focus();
    // Exercise the actual Chromium media controls using keyboard play/pause.
    await page.keyboard.press('Space');
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.currentTime))
      .toBeGreaterThan(1);
    await page.keyboard.press('Space');
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.paused))
      .toBe(true);
    const pausedAt = await page
      .locator('video')
      .evaluate((video) => video.currentTime);
    await page.waitForTimeout(250);
    assert.equal(
      await page.locator('video').evaluate((video) => video.currentTime),
      pausedAt,
    );
    const lastStage = artifact.stages.at(-1);
    await page
      .getByRole('button', { name: lastStage.name, exact: true })
      .click();
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.currentTime))
      .toBe(lastStage.seconds);
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.seeking))
      .toBe(false);
    await page.screenshot({
      path: join(evidence, 'playback', `${name}-stage.png`),
    });
    // Native media keyboard seek and resume from the existing position.
    await page.locator('video').focus();
    await page.keyboard.press('ArrowLeft');
    const scrubbedAt = await page
      .locator('video')
      .evaluate((video) => video.currentTime);
    assert.ok(scrubbedAt < lastStage.seconds);
    await page.keyboard.press('Space');
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.currentTime))
      .toBeGreaterThan(scrubbedAt + 0.2);
    await page.locator('video').evaluate((video) => video.pause());
    records.push({
      name,
      metadata,
      pausedAt,
      namedStage: lastStage,
      keyboardScrubbedAt: scrubbedAt,
    });
  }
  // Record an uninterrupted real playback of both families for motion review.
  for (const name of ['linear-shear', 'weighted-shares']) {
    const artifact = JSON.parse(
      await readFile(join(evidence, 'renders', `${name}.json`), 'utf8'),
    );
    const source = pathToFileURL(join(evidence, 'renders', `${name}.mp4`)).href;
    await page.evaluate(
      ({ source, artifact }) => window.loadExplanation(source, artifact),
      { source, artifact },
    );
    await page.locator('video').evaluate((video) => video.play());
    await expect
      .poll(() => page.locator('video').evaluate((video) => video.ended), {
        timeout: 15_000,
      })
      .toBe(true);
  }
  assert.deepEqual(errors, []);
  await writeFile(
    join(evidence, 'playback-receipt.json'),
    JSON.stringify(
      {
        electron: await application.evaluate(() => process.versions.electron),
        playbackVideo: await page.video()?.path(),
        records,
        errors,
        reducedMotion: 'no autoplay; explicit playback only',
        limitation:
          'Automated isolated Electron harness. No claim of manual minimize behavior, production Reader integration or native-user review.',
      },
      null,
      2,
    ),
  );
  console.log(
    'Playback passed: six files, metadata, keyboard play/pause/seek, named stages, resume and two complete clips.',
  );
} finally {
  await application.close();
  await rm(data, { recursive: true, force: true });
}
