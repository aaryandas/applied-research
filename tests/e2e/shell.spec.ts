import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('wires a real saved source through Reader, Canvas, Settings and restart', async () => {
  test.setTimeout(90_000);
  const directory = mkdtempSync(join(tmpdir(), 'applied-shell-'));
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
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page
      .getByLabel('What do you want to learn about?', { exact: true })
      .fill('Understand planar robot motion');
    await page.getByRole('button', { name: 'Start learning' }).click();
    await expect(
      page.getByRole('heading', { name: 'Reading', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add source', exact: true }).click();
    await page.getByLabel('Source title').fill('Synthetic planar arm source');
    const text =
      'A rotation affects every downstream link. The hand position depends on both joint angles.';
    await page.getByLabel('Exact source text').fill(text);
    await page
      .getByRole('button', { name: 'Import source', exact: true })
      .click();
    const prose = page.getByLabel('Source text', { exact: true });
    await expect(prose).toHaveText(text);
    await prose.evaluate((element) => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 0);
      range.setEnd(element.firstChild!, 40);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await page
      .getByLabel('In your own words')
      .fill('Moving the shoulder changes the whole arm.');
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await expect(
      page.getByRole('region', { name: 'Learning canvas', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.reader-sidebar')).toHaveClass(
      /shell-icon-rail/,
    );
    await expect(
      page
        .getByRole('region', { name: 'Learning canvas', exact: true })
        .getByText('Moving the shoulder changes the whole arm.', {
          exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Expanded', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Expanded', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: test.info().outputPath('canvas.png') });
    const node = page
      .locator('.react-flow__node')
      .filter({ hasText: 'Moving the shoulder changes the whole arm.' })
      .first();
    const before = await node.boundingBox();
    if (!before) throw new Error('Saved note is not laid out.');
    await node.focus();
    await node.press('Enter');
    await node.press('ArrowRight');
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const [project] = await window.desktop.listProjects();
          return (
            await window.desktop.getLearningWorkspace(project!.id)
          ).placements.some((placement) => placement.view === 'expanded');
        }),
      )
      .toBe(true);
    const committed = await page.evaluate(async () => {
      const [project] = await window.desktop.listProjects();
      return (
        await window.desktop.getLearningWorkspace(project!.id)
      ).placements.filter((placement) => placement.view === 'expanded');
    });
    const savedTransform = await node.evaluate(
      (element) => element.style.transform,
    );
    await node.getByRole('button', { name: /Open exact highlight/ }).click();
    await expect(prose).toBeVisible();
    await expect(prose.locator('mark')).toHaveText(text.slice(0, 40));
    await page.screenshot({ path: test.info().outputPath('reader.png') });
    await page.getByRole('button', { name: 'Canvas', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Expanded', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    const reopenedPlacement = await page.evaluate(async () => {
      const [project] = await window.desktop.listProjects();
      return (
        await window.desktop.getLearningWorkspace(project!.id)
      ).placements.filter((placement) => placement.view === 'expanded');
    });
    expect(reopenedPlacement).toEqual(committed);
    await expect
      .poll(() => node.evaluate((element) => element.style.transform))
      .toBe(savedTransform);
    await page
      .getByRole('button', { name: 'Profile and settings', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Settings', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: test.info().outputPath('settings.png') });
    await page
      .getByRole('button', { name: 'Back to work', exact: true })
      .click();
    await expect(
      page.getByRole('region', { name: 'Learning canvas', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Practical', exact: true }).click();
    await expect(
      page.getByText(/Choose a lesson with an activity/),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('practical-empty.png'),
    });
    expect(errors).toEqual([]);
    await application.close();
    application = await launch();
    page = await application.firstWindow();
    await page
      .getByRole('button', { name: /Understand planar robot motion/ })
      .click();
    await expect(page.getByLabel('Source text', { exact: true })).toHaveText(
      text,
    );
    await expect(
      page.getByText('Moving the shoulder changes the whole arm.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'require')),
    ).toBe('undefined');
    expect(
      await page.evaluate(() => typeof Reflect.get(globalThis, 'process')),
    ).toBe('undefined');
  } finally {
    await application.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
