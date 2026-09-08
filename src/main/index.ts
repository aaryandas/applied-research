import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
  WebContentsView,
} from 'electron';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isAllowedNavigation } from './navigation';
import {
  entryDraft,
  entryPosition,
  identifier,
  text,
  toolBounds,
  tutorRequest,
  webUrl,
} from './validation';
import { WorkspaceStore } from './workspace-store';
import { askTutor, DEFAULT_MODEL } from './tutor';
import {
  handleWorkspaceStartupFailure,
  workspaceStartupDiagnostic,
} from './startup-error';
import {
  CHANNELS,
  type PageContext,
  type ProviderStatus,
} from '../contracts/workspace';
import { LEARNING_CHANNELS } from '../contracts/learning-records';

if (process.env.APPLIED_RESEARCH_DATA_DIR)
  app.setPath('userData', process.env.APPLIED_RESEARCH_DATA_DIR);
else if (!app.isPackaged)
  app.setPath(
    'userData',
    join(app.getPath('appData'), 'Applied Research Development'),
  );

let store: WorkspaceStore;
let apiKey = process.env.OPENROUTER_API_KEY ?? '';
let model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

function providerStatus(): ProviderStatus {
  return { connected: Boolean(apiKey), model };
}

function restoreProvider(): void {
  const directory = app.getPath('userData');
  const keyFile = join(directory, 'openrouter.enc');
  if (!apiKey && existsSync(keyFile) && safeStorage.isEncryptionAvailable()) {
    try {
      apiKey = safeStorage.decryptString(readFileSync(keyFile));
    } catch {
      apiKey = '';
    }
  }
  const modelFile = join(directory, 'model.txt');
  if (!process.env.OPENROUTER_MODEL && existsSync(modelFile))
    model = readFileSync(modelFile, 'utf8').trim();
}

async function createWindow(): Promise<void> {
  const rendererFile = join(import.meta.dirname, '../renderer/index.html');
  const rendererUrl =
    (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) ||
    pathToFileURL(rendererFile).href;
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 680,
    show: false,
    backgroundColor: '#f7f4ed',
    title: 'Applied Research',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });
  let guest: WebContentsView | null = null;
  let pending: AbortController | null = null;
  let guestError = '';
  const toolSession = session.fromPartition('persist:learning-tools');
  toolSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  toolSession.setPermissionCheckHandler(() => false);
  toolSession.on('will-download', (event) => event.preventDefault());

  function sendToolState(): void {
    if (window.isDestroyed() || !guest || guest.webContents.isDestroyed())
      return;
    window.webContents.send(CHANNELS.toolState, {
      url: guest.webContents.getURL(),
      title: guest.webContents.getTitle(),
      loading: guest.webContents.isLoading(),
      error: guestError,
    });
  }
  function closeTool(): void {
    if (!guest) return;
    window.contentView.removeChildView(guest);
    guest.webContents.close();
    guest = null;
  }
  async function capturePage(): Promise<PageContext | null> {
    if (!guest) throw new Error('Open a source or tool first.');
    const contents = guest.webContents;
    const url = contents.getURL();
    webUrl(url);
    const pageText: unknown = await contents.executeJavaScript(
      'document.body ? document.body.innerText.slice(0, 12000) : ""',
    );
    if (contents.isDestroyed() || contents.getURL() !== url)
      throw new Error('The page changed. Ask again with the current page.');
    return {
      url,
      title: contents.getTitle().slice(0, 200),
      text: text(pageText, 12_000),
    };
  }
  function handle(
    channel: string,
    operation: (value: unknown) => unknown,
  ): void {
    ipcMain.handle(channel, (event, value: unknown) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame
      )
        throw new Error('Untrusted application request.');
      return operation(value);
    });
  }
  handle(CHANNELS.list, () => {
    const listing = store.listWithDiagnostics();
    for (const unreadable of listing.unreadableProjects) {
      console.error('Unreadable local learning space.', unreadable);
    }
    return listing.projects;
  });
  handle(CHANNELS.create, (value) => store.create(text(value, 1000)));
  handle(CHANNELS.saveEntry, (value) => store.saveEntry(entryDraft(value)));
  handle(CHANNELS.moveEntry, (value) => store.moveEntry(entryPosition(value)));
  handle(LEARNING_CHANNELS.getWorkspace, (value) => {
    const workspace = store.getLearningWorkspace(value);
    for (const unreadable of workspace.unreadableProjects) {
      console.error('Unreadable local learning space.', unreadable);
    }
    return workspace;
  });
  handle(LEARNING_CHANNELS.importTextSource, (value) =>
    store.importTextSource(value),
  );
  handle(LEARNING_CHANNELS.saveHighlight, (value) =>
    store.saveHighlight(value),
  );
  handle(LEARNING_CHANNELS.saveReadingNote, (value) =>
    store.saveReadingNote(value),
  );
  handle(LEARNING_CHANNELS.saveQuestion, (value) => store.saveQuestion(value));
  handle(LEARNING_CHANNELS.saveInsight, (value) => store.saveInsight(value));
  handle(LEARNING_CHANNELS.savePathRevision, (value) =>
    store.savePathRevision(value),
  );
  handle(LEARNING_CHANNELS.moveRecord, (value) =>
    store.moveLearningRecord(value),
  );
  handle(CHANNELS.experiment, (value) =>
    store.addExperiment(identifier(value)),
  );
  handle(CHANNELS.provider, providerStatus);
  handle(CHANNELS.model, (value) => {
    const candidate = text(value, 200).trim();
    if (!/^[a-zA-Z0-9._:/-]+$/.test(candidate))
      throw new Error('Enter an OpenRouter model ID.');
    writeFileSync(join(app.getPath('userData'), 'model.txt'), candidate);
    model = candidate;
    return providerStatus();
  });
  handle(CHANNELS.connect, async () => {
    const selection = await dialog.showOpenDialog(window, {
      title: 'Choose a file containing your OpenRouter API key',
      properties: ['openFile'],
    });
    const selected = selection.filePaths[0];
    if (selection.canceled || !selected) return providerStatus();
    const contents = readFileSync(selected, 'utf8');
    if (contents.length > 8192)
      throw new Error(
        'Choose a small text file containing only your API key or OPENROUTER_API_KEY=…',
      );
    const candidate =
      contents.match(/^OPENROUTER_API_KEY\s*=\s*["']?([^\s"']+)/m)?.[1] ??
      contents.trim();
    if (!/^sk-or-[a-zA-Z0-9-]{20,400}$/.test(candidate))
      throw new Error('That file does not contain an OpenRouter API key.');
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
      throw new Error(
        'OS credential encryption is unavailable. Configure OPENROUTER_API_KEY in your environment instead.',
      );
    writeFileSync(
      join(app.getPath('userData'), 'openrouter.enc'),
      safeStorage.encryptString(candidate),
      { mode: 0o600 },
    );
    apiKey = candidate;
    return providerStatus();
  });
  handle(CHANNELS.ask, async (value) => {
    if (pending)
      throw new Error('Let the current answer finish, or stop it first.');
    const request = tutorRequest(value);
    const controller = new AbortController();
    pending = controller;
    try {
      const page = request.includePage ? await capturePage() : null;
      const answer = await askTutor({
        apiKey,
        model,
        project: store.get(request.projectId),
        prompt: request.prompt,
        page,
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      return store.addAssistant({
        projectId: request.projectId,
        prompt: request.prompt,
        ...answer,
      });
    } catch (error_) {
      if (controller.signal.aborted)
        throw new Error('Stopped. Your saved work is unchanged.', {
          cause: error_,
        });
      if (
        error_ instanceof Error &&
        (error_.name === 'TimeoutError' || error_.name === 'TypeError')
      )
        throw new Error(
          'The AI connection did not finish. Check your connection and try again.',
          { cause: error_ },
        );
      throw error_;
    } finally {
      if (pending === controller) pending = null;
    }
  });
  handle(CHANNELS.stop, () => pending?.abort());
  handle(CHANNELS.external, (value) => shell.openExternal(webUrl(value)));
  handle(CHANNELS.closeTool, closeTool);
  handle(CHANNELS.resizeTool, (value) => {
    const bounds = toolBounds(value);
    const { width, height } = window.getContentBounds();
    if (
      bounds.x + bounds.width > width + 1 ||
      bounds.y + bounds.height > height + 1
    )
      throw new Error('Tool panel is outside the window.');
    guest?.setBounds(bounds);
  });
  handle(CHANNELS.openTool, async (value) => {
    const url = webUrl(value);
    if (!guest) {
      guest = new WebContentsView({
        webPreferences: {
          session: toolSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.contentView.addChildView(guest);
      guest.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      guest.webContents.setWindowOpenHandler(() => {
        guestError =
          'This site needs a separate window. Use Open externally to continue.';
        sendToolState();
        return { action: 'deny' };
      });
      const restrictNavigation = (
        event: Electron.Event,
        destination: string,
      ): void => {
        try {
          webUrl(destination);
        } catch {
          event.preventDefault();
          guestError =
            'This navigation is unavailable here. Open the tool externally.';
          sendToolState();
        }
      };
      guest.webContents.on('will-navigate', restrictNavigation);
      guest.webContents.on('will-redirect', restrictNavigation);
      guest.webContents.on('did-start-loading', sendToolState);
      guest.webContents.on('did-stop-loading', sendToolState);
      guest.webContents.on('did-navigate', sendToolState);
      guest.webContents.on('did-navigate-in-page', sendToolState);
      guest.webContents.on('page-title-updated', sendToolState);
      guest.webContents.on(
        'did-fail-load',
        (_event, code, _description, _url, mainFrame) => {
          if (mainFrame && code !== -3) {
            guestError = 'This page could not load here. Try Open externally.';
            sendToolState();
          }
        },
      );
    }
    guestError = '';
    try {
      await guest.webContents.loadURL(url);
    } catch {
      guestError = 'This page could not load here. Try Open externally.';
      sendToolState();
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, rendererUrl)) event.preventDefault();
  });
  window.on('closed', () => {
    pending?.abort();
    if (guest && !guest.webContents.isDestroyed()) guest.webContents.close();
    for (const channel of Object.values(CHANNELS))
      ipcMain.removeHandler(channel);
    for (const channel of Object.values(LEARNING_CHANNELS))
      ipcMain.removeHandler(channel);
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(rendererUrl);
}

async function startApplication(): Promise<void> {
  try {
    await app.whenReady();
    mkdirSync(app.getPath('userData'), { recursive: true });
    try {
      store = new WorkspaceStore(
        join(app.getPath('userData'), 'workspace.sqlite'),
      );
    } catch (error_) {
      handleWorkspaceStartupFailure(error_, {
        log: (message) =>
          console.error(
            'Unable to open the Applied Research workspace.',
            message,
          ),
        showErrorBox: (title, message) => dialog.showErrorBox(title, message),
        exit: (code) => app.exit(code),
      });
      return;
    }
    restoreProvider();
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    await createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  } catch (error_: unknown) {
    console.error(
      'Unable to start Applied Research.',
      workspaceStartupDiagnostic(error_),
    );
    app.exit(1);
  }
}

// Bundled CommonJS deadlocks when Electron readiness is awaited at module scope.
void startApplication();
app.on('will-quit', () => store?.close());
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
