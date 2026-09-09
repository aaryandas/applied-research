import { SourceDesktopOperations } from './source-desktop';
import { makeAuthenticatedSourceTransport } from './source-transport';
import { SOURCE_CHANNELS } from '../contracts/source-desktop';
import { PracticalDesktopOperations } from './practical-operations';
import { RECORD_PRACTICAL_RESULT_CHANNEL } from '../contracts/practical-work';
import {
  LOAD_PRACTICAL_ATTEMPT_CHANNEL,
  SELECT_PRACTICAL_FILE_CHANNEL,
  CANCEL_PRACTICAL_FILE_CHANNEL,
  LIST_PRACTICAL_ATTEMPTS_CHANNEL,
  PREVIEW_PRACTICAL_FILE_CHANNEL,
  EXPORT_PRACTICAL_FILE_CHANNEL,
  CANCEL_PRACTICAL_EXPORT_CHANNEL,
  LOAD_PRACTICAL_JOURNEY_CHANNEL,
  RECORD_PRACTICAL_PROGRESS_CHANNEL,
  RECORD_PRACTICAL_WORK_CHOICE_CHANNEL,
  SAVE_PRACTICAL_HUMAN_PLAN_CHANNEL,
  PRACTICAL_FILE_EXTENSIONS,
} from '../contracts/practical-records';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
  session,
  shell,
  WebContentsView,
} from 'electron';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
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
import { AUTH_CHANNELS } from '../contracts/desktop-auth';
import { consoleDesktopAuthDiagnostics } from './auth-diagnostics';
import {
  desktopAuthCallbackArgument,
  registerDesktopAuthProtocol,
  registerDesktopAuthScheme,
} from './auth-protocol';
import { createDesktopAuthSdk, electronOauthStateRegistry } from './auth-sdk';
import { createAuthStorage } from './auth-storage';
import { makeBackendAccountTransport } from './auth-transport';
import { createDesktopAuthController } from './desktop-auth';
import { LEARNING_CHANNELS } from '../contracts/learning-records';

if (process.env.APPLIED_RESEARCH_DATA_DIR)
  app.setPath('userData', process.env.APPLIED_RESEARCH_DATA_DIR);
else if (!app.isPackaged)
  app.setPath(
    'userData',
    join(app.getPath('appData'), 'Applied Research Development'),
  );

registerDesktopAuthScheme(protocol);

let store: WorkspaceStore;
let mainWindow: BrowserWindow | null = null;
const developmentTutorEnabled =
  !app.isPackaged &&
  process.env.APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR === 'true';
const apiKey = developmentTutorEnabled
  ? (process.env.OPENROUTER_API_KEY ?? '')
  : '';
let model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
const authStorage = createAuthStorage(
  join(app.getPath('userData'), 'auth', 'session.json'),
  consoleDesktopAuthDiagnostics,
);
const authSdk = createDesktopAuthSdk(authStorage);
const authController = createDesktopAuthController({
  sdk: authSdk,
  storage: authStorage,
  accountTransport: makeBackendAccountTransport(net.fetch),
  oauthStates: electronOauthStateRegistry,
  encryption: {
    isUsable: () =>
      safeStorage.isEncryptionAvailable() &&
      !(
        process.platform === 'linux' &&
        safeStorage.getSelectedStorageBackend() === 'basic_text'
      ),
  },
  diagnostics: consoleDesktopAuthDiagnostics,
});
authSdk.setupMain();

const focusMainWindow = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};

const authProtocol = registerDesktopAuthProtocol({
  app,
  argv: process.argv,
  defaultApp: Boolean(process.defaultApp),
  diagnostics: consoleDesktopAuthDiagnostics,
  executablePath: process.execPath,
  onActivate: focusMainWindow,
  onCallback: (url) => {
    void authController.handleCallback(url).then((accepted) => {
      if (accepted) focusMainWindow();
    });
  },
  platform: process.platform,
});
if (!authProtocol.registered) authController.markProtocolUnavailable();
const coldAuthCallback = desktopAuthCallbackArgument(process.argv);
if (coldAuthCallback) void authController.handleCallback(coldAuthCallback);

function providerStatus(): ProviderStatus {
  return { connected: Boolean(apiKey), model };
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
  mainWindow = window;
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
  let authenticated = false;
  let selectedWorkspaceId: string | null = null;
  const practicalOperations = new PracticalDesktopOperations({
    store,
    isSelectedWorkspace: (projectId) => projectId === selectedWorkspaceId,
    windowAlive: () => !window.isDestroyed(),
    chooseOpenFile: async (signal) => {
      if (signal.aborted || window.isDestroyed()) return null;
      const result = await dialog.showOpenDialog(window, {
        properties: ['openFile'],
        filters: [
          {
            name: 'Returned evidence',
            extensions: [...PRACTICAL_FILE_EXTENSIONS],
          },
        ],
      });
      if (signal.aborted || window.isDestroyed() || result.canceled)
        return null;
      return result.filePaths.length === 1 ? result.filePaths[0]! : null;
    },
    chooseSaveFile: async (displayName, signal) => {
      if (signal.aborted || window.isDestroyed()) return null;
      const result = await dialog.showSaveDialog(window, {
        defaultPath: displayName,
        filters: [
          {
            name: 'Returned evidence',
            extensions: [...PRACTICAL_FILE_EXTENSIONS],
          },
        ],
      });
      if (signal.aborted || window.isDestroyed() || result.canceled)
        return null;
      return result.filePath || null;
    },
  });
  const PRACTICAL_CHANNELS = [
    RECORD_PRACTICAL_RESULT_CHANNEL,
    LOAD_PRACTICAL_ATTEMPT_CHANNEL,
    SELECT_PRACTICAL_FILE_CHANNEL,
    CANCEL_PRACTICAL_FILE_CHANNEL,
    LIST_PRACTICAL_ATTEMPTS_CHANNEL,
    PREVIEW_PRACTICAL_FILE_CHANNEL,
    EXPORT_PRACTICAL_FILE_CHANNEL,
    CANCEL_PRACTICAL_EXPORT_CHANNEL,
    LOAD_PRACTICAL_JOURNEY_CHANNEL,
    RECORD_PRACTICAL_PROGRESS_CHANNEL,
    RECORD_PRACTICAL_WORK_CHOICE_CHANNEL,
    SAVE_PRACTICAL_HUMAN_PLAN_CHANNEL,
  ] as const;
  const sourceOperations = new SourceDesktopOperations({
    store,
    authenticated: () => authenticated,
    transport: makeAuthenticatedSourceTransport({
      request: globalThis.fetch,
      sessionCookie: () =>
        authController.state().session === 'signed-in'
          ? authSdk.getCookie()
          : '',
    }),
    openOriginal: (url) => shell.openExternal(url),
  });
  const revokeWorkspaceOperations = (): void => {
    sourceOperations.revoke();
    practicalOperations.replaceWorkspace();
    closeTool();
  };
  window.on('close', revokeWorkspaceOperations);
  window.webContents.on('render-process-gone', revokeWorkspaceOperations);
  window.webContents.on('will-navigate', revokeWorkspaceOperations);
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
  handle(SOURCE_CHANNELS.activate, (value) => {
    practicalOperations.replaceWorkspace();
    closeTool();
    sourceOperations.activate(value);
    selectedWorkspaceId = typeof value === 'string' ? value : null;
  });
  handle(SOURCE_CHANNELS.generate, (value) => sourceOperations.generate(value));
  handle(SOURCE_CHANNELS.discover, (value) => sourceOperations.discover(value));
  handle(SOURCE_CHANNELS.acquire, (value) => sourceOperations.acquire(value));
  handle(SOURCE_CHANNELS.cancel, (value) => sourceOperations.cancel(value));
  handle(SOURCE_CHANNELS.original, (value) =>
    sourceOperations.openOriginal(value),
  );
  handle(RECORD_PRACTICAL_RESULT_CHANNEL, (value) =>
    practicalOperations.recordPracticalResult(value),
  );
  handle(LOAD_PRACTICAL_ATTEMPT_CHANNEL, (value) =>
    practicalOperations.loadPracticalAttempt(value),
  );
  handle(SELECT_PRACTICAL_FILE_CHANNEL, (value) =>
    practicalOperations.selectPracticalFile(value),
  );
  handle(CANCEL_PRACTICAL_FILE_CHANNEL, () =>
    practicalOperations.cancelPracticalFileSelection(),
  );
  handle(LIST_PRACTICAL_ATTEMPTS_CHANNEL, (value) =>
    practicalOperations.listPracticalAttempts(value),
  );
  handle(PREVIEW_PRACTICAL_FILE_CHANNEL, (value) =>
    practicalOperations.previewPracticalFile(value),
  );
  handle(EXPORT_PRACTICAL_FILE_CHANNEL, (value) =>
    practicalOperations.exportPracticalFile(value),
  );
  handle(CANCEL_PRACTICAL_EXPORT_CHANNEL, () =>
    practicalOperations.cancelPracticalExport(),
  );
  handle(LOAD_PRACTICAL_JOURNEY_CHANNEL, (value) =>
    practicalOperations.loadPracticalJourney(value),
  );
  handle(RECORD_PRACTICAL_PROGRESS_CHANNEL, (value) =>
    practicalOperations.recordPracticalProgress(value),
  );
  handle(RECORD_PRACTICAL_WORK_CHOICE_CHANNEL, (value) =>
    practicalOperations.recordPracticalWorkChoice(value),
  );
  handle(SAVE_PRACTICAL_HUMAN_PLAN_CHANNEL, (value) =>
    practicalOperations.savePracticalHumanPlan(value),
  );
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
  handle(AUTH_CHANNELS.accountStatus, () => authController.accountStatus());
  handle(AUTH_CHANNELS.signIn, () => authController.signIn());
  handle(AUTH_CHANNELS.cancelSignIn, () => authController.cancelSignIn());
  handle(AUTH_CHANNELS.signOut, () => {
    authenticated = false;
    selectedWorkspaceId = null;
    revokeWorkspaceOperations();
    return authController.signOut();
  });
  const unsubscribeAccountState = authController.subscribe((state) => {
    authenticated = state.session === 'signed-in';
    if (!authenticated) revokeWorkspaceOperations();
    if (!window.isDestroyed()) {
      window.webContents.send(AUTH_CHANNELS.accountState, state);
    }
  });
  handle(CHANNELS.provider, providerStatus);
  handle(CHANNELS.model, (value) => {
    if (!developmentTutorEnabled) {
      throw new Error(
        'Direct provider configuration is retired. Sign in to use managed learning.',
      );
    }
    const candidate = text(value, 200).trim();
    if (!/^[a-zA-Z0-9._:/-]+$/.test(candidate))
      throw new Error('Enter an OpenRouter model ID.');
    model = candidate;
    return providerStatus();
  });
  handle(CHANNELS.connect, () => {
    throw new Error(
      'Provider key-file import is retired. Sign in to use managed learning.',
    );
  });
  handle(CHANNELS.ask, async (value) => {
    if (!developmentTutorEnabled) {
      throw new Error(
        'The development tutor is disabled. Sign in to use managed learning.',
      );
    }
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
    if (guest && bounds.width > 0 && bounds.height > 0) {
      guest.setVisible(true);
      guest.webContents.invalidate();
    }
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
    revokeWorkspaceOperations();
    for (const channel of [
      ...Object.values(SOURCE_CHANNELS),
      ...PRACTICAL_CHANNELS,
    ])
      ipcMain.removeHandler(channel);
    unsubscribeAccountState();
    if (mainWindow === window) mainWindow = null;
    pending?.abort();
    if (guest && !guest.webContents.isDestroyed()) guest.webContents.close();
    for (const channel of Object.values(CHANNELS))
      ipcMain.removeHandler(channel);
    for (const channel of Object.values(AUTH_CHANNELS)) {
      if (channel !== AUTH_CHANNELS.accountState)
        ipcMain.removeHandler(channel);
    }
    for (const channel of Object.values(LEARNING_CHANNELS))
      ipcMain.removeHandler(channel);
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(rendererUrl);
}

async function startApplication(): Promise<void> {
  try {
    if (!authProtocol.ownsInstance) {
      app.quit();
      return;
    }
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
app.on('will-quit', () => {
  authProtocol.dispose();
  authController.dispose();
  store?.close();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
