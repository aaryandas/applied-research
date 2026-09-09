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
