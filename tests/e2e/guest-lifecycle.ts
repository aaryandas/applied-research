import { expect, type ElectronApplication, type Page } from '@playwright/test';

export const MATRIX_LAB_URL = 'https://learning.test/';
export const MATRIX_LAB_TITLE = 'Matrix Lab';
/** Same 10s budget as the failed dedicated run 34351672920. Not a sleep. */
export const GUEST_COMMIT_TIMEOUT_MS = 10_000;

export interface GuestContentsSnapshot {
  id: number;
  url: string;
  title: string;
  loading: boolean;
  destroyed: boolean;
  partition: 'persist:learning-tools' | 'other';
}

export interface GuestLifecycleEvent {
  type: string;
  id: number;
  url: string;
  title?: string;
  errorCode?: number;
  isMainFrame?: boolean;
}

export interface GuestLifecycleSnapshot {
  contents: GuestContentsSnapshot[];
  childViews: number;
  events: GuestLifecycleEvent[];
}

/**
 * Production same-workspace guard (AR-50 guest lifecycle; AR-56 owns the
 * onboarding/contextual mount). SourceDesktopOperations.activate already
 * no-ops the same id. Decode before teardown so invalid payloads cannot
 * closeTool. True project switch and logout (`null` after a selected id)
 * still revoke in-flight onboarding, replaceWorkspace, and closeTool.
 * Same-id Shell mount / StrictMode / signed-in replay must not kill guest
 * or reset contextual generation counters.
 *
 *   handle(SOURCE_CHANNELS.activate, (value) => {
 *     const plan = planWorkspaceActivate(selectedWorkspaceId, value);
 *     if (plan.revokeOperations) {
 *       onboardingOperations.revoke();
 *       practicalOperations.replaceWorkspace();
 *       closeTool();
 *     }
 *     sourceOperations.activate(value);
 *     selectedWorkspaceId = plan.nextId;
 *     return contextualHelp.activate(value);
 *   });
 */
export async function installGuestLifecycleProbe(
  application: ElectronApplication,
): Promise<void> {
  await application.evaluate(({ app, session }) => {
    const events: GuestLifecycleEvent[] = [];
    Reflect.set(globalThis, 'guestLifecycleEvents', events);
    const tools = session.fromPartition('persist:learning-tools');
    app.on('web-contents-created', (_event, contents) => {
      if (contents.session !== tools) return;
      const record = (
        type: string,
        extra: Partial<GuestLifecycleEvent> = {},
      ): void => {
        if (contents.isDestroyed()) {
          events.push({ type, id: contents.id, url: '', ...extra });
          return;
        }
        events.push({
          type,
          id: contents.id,
          url: contents.getURL(),
          ...extra,
        });
      };
      record('created');
      contents.on('did-start-loading', () => record('did-start-loading'));
      contents.on('did-stop-loading', () => record('did-stop-loading'));
      contents.on('did-navigate', () => record('did-navigate'));
      contents.on('page-title-updated', (_event, title) =>
        record('page-title-updated', { title }),
      );
      contents.on(
        'did-fail-load',
        (_event, errorCode, _description, url, isMainFrame) =>
          record('did-fail-load', { errorCode, url, isMainFrame }),
      );
      contents.on('destroyed', () => record('destroyed'));
    });
  });
}

export async function readGuestLifecycle(
  application: ElectronApplication,
): Promise<GuestLifecycleSnapshot> {
  return application.evaluate(({ BrowserWindow, session, webContents }) => {
    const tools = session.fromPartition('persist:learning-tools');
    const window = BrowserWindow.getAllWindows()[0];
    return {
      childViews: window?.contentView.children.length ?? 0,
      events: Reflect.get(globalThis, 'guestLifecycleEvents') ?? [],
      contents: webContents.getAllWebContents().map((contents) => ({
        id: contents.id,
        url: contents.isDestroyed() ? '' : contents.getURL(),
        title: contents.isDestroyed() ? '' : contents.getTitle(),
        loading: !contents.isDestroyed() && contents.isLoading(),
        destroyed: contents.isDestroyed(),
        partition:
          contents.session === tools ? 'persist:learning-tools' : 'other',
      })),
    };
  });
}

/** Shell's activate effect is fire-and-forget; join it before a test-only openTool. */
export async function settleActivatedWorkspace(page: Page): Promise<string> {
  await expect(
    page.getByRole('button', { name: 'Add source', exact: true }),
  ).toBeVisible();
  return page.evaluate(async () => {
    const [project] = await window.desktop.listProjects();
    if (!project) throw new Error('Start learning did not create a project.');
    await window.desktop.activateSourceWorkspace(project.id);
    return project.id;
  });
}

export function committedLearningToolsGuest(
  snapshot: GuestLifecycleSnapshot,
  url: string,
): GuestContentsSnapshot | undefined {
  return snapshot.contents.find(
    (contents) =>
      contents.partition === 'persist:learning-tools' &&
      !contents.destroyed &&
      contents.url === url &&
      !contents.loading,
  );
}

/**
 * capturePage can reject UnknownVizError immediately after URL/title/loading
 * and bounds are already true: the guest is created at 0×0, resizeTool then
 * setVisible+invalidate, and Chromium's viz compositor has not admitted a
 * frame yet. Catch that inside evaluate so Playwright's Electron channel is
 * not rejected, and wait for a real nonempty PNG. Same identified transients
 * as practical-tools.spec.ts. Not a load-timeout and not a GPU flag.
 */
const GUEST_CAPTURE_TRANSIENT =
  /UnknownVizError|Unable to capture|loading|tiny-png|missing-guest|missing-view|zero-bounds|not-visible|empty-image/i;

type GuestCaptureAttempt =
  { ok: true; png: string } | { ok: false; error: string };

export async function captureAdmittedGuestPng(
  application: ElectronApplication,
  url: string,
): Promise<Buffer> {
  let admitted: string | undefined;
  await expect
    .poll(
      async () => {
        const result = await application.evaluate(
          async (
            { webContents, BrowserWindow, WebContentsView },
            destination,
          ): Promise<GuestCaptureAttempt> => {
            const guest = webContents
              .getAllWebContents()
              .find((contents) => contents.getURL() === destination);
            if (!guest) return { ok: false, error: 'missing-guest' };
            if (guest.isDestroyed()) return { ok: false, error: 'destroyed' };
            if (guest.isLoading()) return { ok: false, error: 'loading' };
            const view =
              BrowserWindow.getAllWindows()[0]?.contentView.children.find(
                (child) =>
                  child instanceof WebContentsView &&
                  child.webContents.id === guest.id,
              );
            if (!view) return { ok: false, error: 'missing-view' };
            const bounds = view.getBounds();
            if (bounds.width < 1 || bounds.height < 1) {
              return {
                ok: false,
                error: `zero-bounds:${bounds.width}x${bounds.height}`,
              };
            }
            if (!view.getVisible()) return { ok: false, error: 'not-visible' };
            try {
              guest.invalidate();
              const image = await guest.capturePage();
              const png = image.toPNG();
              if (image.isEmpty() || png.length < 32) {
                return {
                  ok: false,
                  error: image.isEmpty()
                    ? 'empty-image'
                    : `tiny-png:${png.length}`,
                };
              }
              return { ok: true, png: png.toString('base64') };
            } catch (error_) {
              const message =
                error_ instanceof Error ? error_.message : String(error_);
              return { ok: false, error: message };
            }
          },
          url,
        );
        if (result.ok) {
          admitted = result.png;
          return 'admitted';
        }
        if (!GUEST_CAPTURE_TRANSIENT.test(result.error)) {
          throw new Error(`Guest capture failed: ${result.error}`);
        }
        return result.error;
      },
      {
        timeout: GUEST_COMMIT_TIMEOUT_MS,
        message:
          'Wait until the learning-tools guest compositor admits a nonempty capturePage PNG.',
      },
    )
    .toBe('admitted');
  if (!admitted) {
    throw new Error('Guest capture did not produce a real image.');
  }
  return Buffer.from(admitted, 'base64');
}
