import type { DesktopBridge } from '../../contracts/desktop';
import {
  PRACTICAL_TOOLS,
  type PracticalToolId,
} from '../../contracts/practical-tools';

type PracticalToolBridge = Pick<
  DesktopBridge,
  'openTool' | 'closeTool' | 'openExternal' | 'onToolState'
>;
const TOOL_LOAD_TIMEOUT_MS = 30_000;

export interface PracticalToolAdapter {
  label: string;
  url: string;
  openEmbedded(): Promise<void>;
  openExternal(): Promise<void>;
  close(): Promise<void>;
}

/** Guest lifecycle still belongs to main; no page reads or tutor calls occur here. */
export function createPracticalToolAdapter(options: {
  bridge: PracticalToolBridge;
  toolId: PracticalToolId;
  stopGuidance: () => Promise<void>;
}): PracticalToolAdapter {
  const tool = PRACTICAL_TOOLS.find((item) => item.id === options.toolId);
  if (!tool) throw new Error('Choose a supported tool.');
  let cancelOpen: (() => void) | null = null;
  return {
    label: tool.label,
    url: tool.url,
    async openEmbedded() {
      if (cancelOpen) throw new Error('A tool is already opening.');
      let resolveReady!: () => void;
      let rejectReady!: (error: Error) => void;
      const ready = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      let cancelled = false;
      cancelOpen = () => {
        cancelled = true;
        rejectReady(new Error('Tool opening stopped.'));
      };
      const timer = setTimeout(
        () =>
          rejectReady(
            new Error(
              'This tool could not load here. Try opening it externally.',
            ),
          ),
        TOOL_LOAD_TIMEOUT_MS,
      );
      let unsubscribe = () => {};
      try {
        unsubscribe = options.bridge.onToolState((state) => {
          if (state.error)
            rejectReady(
              new Error(
                'This tool could not load here. Try opening it externally.',
              ),
            );
          else if (!state.loading && state.url) {
            try {
              if (new URL(state.url).origin === new URL(tool.url).origin)
                resolveReady();
            } catch {
              /* A malformed guest address never establishes readiness. */
            }
          }
        });
        await Promise.all([options.bridge.openTool(tool.url), ready]);
      } catch {
        await options.bridge.closeTool().catch(() => {});
        throw new Error(
          cancelled
            ? 'Tool opening stopped.'
            : 'This tool could not load here. Try opening it externally.',
        );
      } finally {
        clearTimeout(timer);
        unsubscribe();
        cancelOpen = null;
      }
    },
    async openExternal() {
      cancelOpen?.();
      await options.stopGuidance();
      await options.bridge.closeTool();
      await options.bridge.openExternal(tool.url);
    },
    async close() {
      cancelOpen?.();
      await options.stopGuidance();
      await options.bridge.closeTool();
    },
  };
}
