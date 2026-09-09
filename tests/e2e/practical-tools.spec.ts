import {
  _electron as electron,
  expect,
  test,
  type Page,
} from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolState } from '../../src/contracts/workspace';
import { createPracticalToolAdapter } from '../../src/renderer/practical/tool-adapter';
import {
  closeTestApplication,
  useElectronCloseHandling,
} from './electron-lifecycle';

async function nativeBridge(page: Page) {
  let publish: (state: ToolState) => void = () => {};
  await page.exposeFunction('reportPracticalToolState', (state: ToolState) =>
    publish(state),
  );
  await page.evaluate(() => {
    window.desktop.onToolState((state) =>
      Reflect.get(window, 'reportPracticalToolState')(state),
    );
  });
  return {
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
    const image = await application.evaluate(async ({ webContents }) => {
      const guest = webContents
        .getAllWebContents()
        .find(
          (contents) =>
            contents.getURL() === 'https://www.desmos.com/calculator',
        );
      return (await guest?.capturePage())?.toPNG().toString('base64');
    });
    expect(image).toBeTruthy();
    writeFileSync(
      test.info().outputPath('practical-isolated-guest.png'),
      Buffer.from(image!, 'base64'),
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
