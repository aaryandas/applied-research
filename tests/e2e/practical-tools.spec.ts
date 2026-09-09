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
import { createPracticalToolAdapter } from '../../src/renderer/practical/tool-adapter';
import { createPracticalContextResolver } from '../../src/renderer/practical/context-resolver';
import { createPracticalSaveSession } from '../../src/renderer/practical/save-session';
import type { RecordPracticalResultInput } from '../../src/contracts/practical-work';
import {
  closeTestApplication,
  useElectronCloseHandling,
} from './electron-lifecycle';

async function captureIsolatedGuestPng(
  application: ElectronApplication,
  url: string,
): Promise<string> {
  const diagnostics: string[] = [];
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await application.evaluate(
      async ({ webContents, BrowserWindow }, destination) => {
        const guest = webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === destination);
        if (!guest) return { ok: false as const, error: 'missing-guest' };
        if (guest.isDestroyed())
          return { ok: false as const, error: 'destroyed' };
        if (guest.isLoading()) return { ok: false as const, error: 'loading' };
        const view = BrowserWindow.getAllWindows()
          .flatMap((window) => window.contentView.children)
          .find((child) => {
            const contents = (child as { webContents?: { id: number } })
              .webContents;
            return contents?.id === guest.id;
          });
        if (!view || !('getBounds' in view) || !('getVisible' in view))
          return { ok: false as const, error: 'missing-view' };
        const bounds = view.getBounds();
        if (bounds.width < 1 || bounds.height < 1)
          return {
            ok: false as const,
            error: `zero-bounds:${bounds.width}x${bounds.height}`,
          };
        if (!view.getVisible())
          return { ok: false as const, error: 'not-visible' };
        try {
          guest.invalidate();
          const image = await guest.capturePage();
          const png = image.toPNG();
          if (image.isEmpty() || png.length < 32)
            return {
              ok: false as const,
              error: image.isEmpty() ? 'empty-image' : `tiny-png:${png.length}`,
            };
          return { ok: true as const, png: png.toString('base64') };
        } catch (error_) {
          const message =
            error_ instanceof Error ? error_.message : String(error_);
          return { ok: false as const, error: message };
        }
      },
      url,
    );
    if (result.ok) return result.png;
    diagnostics.push(result.error);
    if (
      !/UnknownVizError|Unable to capture|loading|tiny-png|missing-guest|missing-view|zero-bounds|not-visible|empty-image/i.test(
        result.error,
      )
    )
      throw new Error(`Guest capture failed: ${result.error}`);
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  throw new Error(
    `Guest capture did not produce a real image. ${diagnostics.join(' | ')}`,
  );
}

async function nativeBridge(page: Page) {
  let currentState: ToolState | null = null;
  let publish: (state: ToolState) => void = () => {};
  await page.exposeFunction('reportPracticalToolState', (state: ToolState) => {
    currentState = state;
    publish(state);
  });
  await page.evaluate(() => {
    window.desktop.onToolState((state) =>
      Reflect.get(window, 'reportPracticalToolState')(state),
    );
  });
  return {
    getState: () => currentState,
    onToolState: (listener: (state: ToolState) => void) => {
      publish = listener;
      return () => {
        publish = () => {};
      };
    },
    openTool: (url: string) =>
      page.evaluate((value) => window.desktop.openTool(value), url),
    closeTool: () => page.evaluate(() => window.desktop.closeTool()),
    openExternal: (url: string) =>
      page.evaluate((value) => window.desktop.openExternal(value), url),
  };
}

test('Practical tool adapter uses an isolated real guest and reports blocked, failed and cancelled loads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ar19-guest-'));
  const executablePath = process.env.ELECTRON_EXECUTABLE_PATH;
  const application = await electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }),
    env: {
      ...process.env,
      APPLIED_RESEARCH_DATA_DIR: directory,
      OPENROUTER_API_KEY: '',
      APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR: 'false',
    },
  });
  try {
    test.info().annotations.push({
      type: 'network-fixture',
      description:
        'HTTPS is intercepted with synthetic tool content. This proves native isolation and adapter outcomes, not live third-party compatibility.',
    });
    await application.evaluate(async ({ session }) => {
      await session.defaultSession.cookies.set({
        url: 'https://www.desmos.com',
        name: 'application-only',
        value: 'synthetic-cookie',
      });
      session
        .fromPartition('persist:learning-tools')
        .protocol.handle(
          'https',
          () =>
            new Response(
              '<!doctype html><html><head><title>Synthetic practical tool</title></head><body><h1>Synthetic practical tool</h1><label>Input <input id="input" type="number" value="1"></label><output id="result">2</output><script>document.getElementById("input").addEventListener("input",e=>document.getElementById("result").textContent=String(Number(e.target.value)*2))</script></body></html>',
              { headers: { 'content-type': 'text/html' } },
            ),
        );
    });
    const page = await application.firstWindow();
    useElectronCloseHandling(page);
    const initialContents = await application.evaluate(
      ({ webContents }) => webContents.getAllWebContents().length,
    );
    const bridge = await nativeBridge(page);
    const adapter = createPracticalToolAdapter({
      bridge,
      toolId: 'desmos-graphing',
      stopGuidance: async () => {},
    });
    await adapter.openEmbedded();
    await page.evaluate(() =>
      window.desktop.resizeTool({ x: 320, y: 80, width: 480, height: 400 }),
    );
    const sessionId = await application.evaluate(({ webContents }) =>
      String(
        webContents
          .getAllWebContents()
          .find(
            (contents) =>
              contents.getURL() === 'https://www.desmos.com/calculator',
          )?.id,
      ),
    );
    expect(sessionId).not.toBe('undefined');
    const input: RecordPracticalResultInput = {
      activity: {
        projectId: '11111111-1111-1111-1111-111111111111',
        origin: {
          path: {
            pathId: '22222222-2222-2222-2222-222222222222',
            pathRevision: 1,
            topicId: '33333333-3333-3333-3333-333333333333',
            lessonId: '44444444-4444-4444-4444-444444444444',
          },
        },
        title: 'Synthetic guest isolation activity',
        instructions: 'Inspect the supported tool.',
        objective: 'Keep host metadata separate from guest content.',
      },
      attemptId: '55555555-5555-5555-5555-555555555555',
      expectedRevision: 0,
      draft: {
        prediction: '',
        attempt: '',
        reportedResult: { kind: 'user-reported-text', text: '' },
        selectedEvidence: null,
        reflection: { authorKind: 'human', text: '' },
      },
    };
    const save = createPracticalSaveSession({ input, onChange: () => {} });
    const context = createPracticalContextResolver({
      identity: input,
      getSnapshot: save.getContextSnapshot,
      toolSessionId: sessionId,
      getToolState: () => {
        const state = bridge.getState();
        return state
          ? {
              ...state,
              error: state.error || null,
              sessionId,
              controls: [
                {
                  name: 'Open externally',
                  description:
                    'Stop guidance and open the chosen tool externally.',
                },
              ],
            }
          : null;
      },
    });
    const target = {
      trigger: 'explicit-action' as const,
      target: {
        scope: 'applied-research' as const,
        surface: 'practical-work' as const,
        activity: input.activity,
        attemptId: input.attemptId,
        target: 'tool-controls' as const,
      },
    };
    const resolved = await context.resolveTarget(
      target,
      new AbortController().signal,
    );
    expect(resolved).toMatchObject({
      status: 'available',
      context: {
        guest: { sessionId, url: 'https://www.desmos.com/calculator' },
        controls: [{ name: 'Open externally' }],
      },
    });
    expect(JSON.stringify(resolved)).not.toContain('Input <input');
    context.dispose();
    expect(
      await context.resolveTarget(target, new AbortController().signal),
    ).toMatchObject({ status: 'cancelled' });
    const isolation = await application.evaluate(async ({ webContents }) => {
      const guest = webContents
        .getAllWebContents()
        .find(
          (contents) =>
            contents.getURL() === 'https://www.desmos.com/calculator',
        );
      return guest?.executeJavaScript(
        '(async () => ({node:typeof process,bridge:typeof window.desktop,cookies:document.cookie,permission:(await navigator.permissions.query({name:"geolocation"})).state,popup:window.open("https://www.desmos.com/calculator")==null}))()',
      );
    });
    expect(isolation).toEqual({
      node: 'undefined',
      bridge: 'undefined',
      cookies: '',
      permission: 'denied',
      popup: true,
    });
    // Playwright includes the WebContentsView as a Page; count native windows.
    expect(
      await application.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
      ),
    ).toBe(1);
    expect(
      await application.evaluate(
        ({ webContents }) => webContents.getAllWebContents().length,
      ),
    ).toBe(initialContents + 1);
    await expect(
      bridge.openTool('file:///tmp/private-result.txt'),
    ).rejects.toThrow();
    const image = await captureIsolatedGuestPng(
      application,
      'https://www.desmos.com/calculator',
    );
    expect(Buffer.from(image, 'base64').length).toBeGreaterThan(32);
    writeFileSync(
      test.info().outputPath('practical-isolated-guest.png'),
      Buffer.from(image, 'base64'),
    );
    await adapter.close();
    await application.evaluate(({ session }) => {
      const partition = session.fromPartition('persist:learning-tools');
      partition.protocol.unhandle('https');
      partition.protocol.handle('https', () => Response.error());
    });
    await expect(adapter.openEmbedded()).rejects.toThrow('could not load');
    await application.evaluate(({ session }) => {
      const partition = session.fromPartition('persist:learning-tools');
      partition.protocol.unhandle('https');
      partition.protocol.handle('https', () => new Promise<Response>(() => {}));
    });
    const opening = adapter.openEmbedded();
    const cancelled = expect(opening).rejects.toThrow('stopped');
    await adapter.close();
    await cancelled;
    await expect
      .poll(() =>
        application.evaluate(
          ({ webContents }) => webContents.getAllWebContents().length,
        ),
      )
      .toBe(initialContents);
  } finally {
    await closeTestApplication(application);
    rmSync(directory, { recursive: true, force: true });
  }
});
