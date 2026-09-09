import type { PracticalToolAdapter } from '../practical/tool-adapter';
import type {
  RegisterPracticalFlush,
  PracticalFlushResult,
} from '../../contracts/practical-work';
import type {
  CompanionRequester,
  CompanionSessionOptions,
  CompanionState,
} from '../../contracts/companion';
import type { PracticalWorkspaceBridge } from '../../contracts/practical-records';
import { createCompanionRequester } from '../companion/requester';
import { createPracticalActivityGuidance } from '../practical/activity-guidance';

interface PracticalSessionOptions {
  bridge: PracticalWorkspaceBridge;
  attemptId: string;
  registerFlush: RegisterPracticalFlush;
  requestGuidance?: CompanionSessionOptions['requestGuidance'];
  onRequester(requester: CompanionRequester): void;
  onState(state: CompanionState): void;
}
/** Resolves the persisted attempt before creating consent; disposal rejects late loads. */
export class PracticalSessionOwner {
  private active = true;
  private tool: PracticalToolAdapter | null = null;
  private save: (() => Promise<PracticalFlushResult>) | null = null;
  readonly registerFlush: RegisterPracticalFlush = (save) => {
    this.save = save;
    const unregister = this.options.registerFlush(() => this.flush());
    return () => {
      if (this.save === save) this.save = null;
      unregister();
    };
  };
  async flush(): Promise<PracticalFlushResult> {
    this.revoke();
    await this.tool?.close();
    return this.save
      ? this.save()
      : { status: 'blocked', reason: 'unavailable' };
  }
  setTool(tool: PracticalToolAdapter): void {
    this.tool = tool;
  }

  private generation = 0;
  private requester: CompanionRequester | null = null;
  readonly bridge: PracticalWorkspaceBridge;
  readonly guidance = createPracticalActivityGuidance({
    getState: () =>
      this.requester?.session.getState() ?? {
        observation: { status: 'inactive' },
      },
    startActivity: async (request) =>
      this.requester
        ? this.requester.session.startActivity(request)
        : { status: 'unavailable' },
    stop: () => this.revoke(),
  });
  constructor(private readonly options: PracticalSessionOptions) {
    this.bridge = {
      ...options.bridge,
      loadPracticalAttempt: async (input) => {
        const token = ++this.generation;
        this.revoke();
        const result = await options.bridge.loadPracticalAttempt(input);
        if (
          result.status !== 'loaded' ||
          !this.active ||
          token !== this.generation
        )
          return result;
        this.requester?.dispose();
        this.requester = createCompanionRequester({
          activity: input.activity,
          attemptId: result.attempt?.attemptId ?? options.attemptId,
          requestGuidance:
            options.requestGuidance ??
            (async () => ({
              status: 'unavailable',
              message: 'Authenticated activity guidance is not connected yet.',
            })),
          onStateChange: (state) => {
            if (this.active) options.onState(state);
          },
          now: () => performance.now(),
          createRequestId: () => crypto.randomUUID(),
        });
        options.onRequester(this.requester);
        options.onState(this.requester.session.getState());
        return result;
      },
    };
  }
  mount(): void {
    this.active = true;
  }
  revoke(): void {
    this.requester?.session.stop('attempt-replaced');
  }
  dispose(): void {
    this.revoke();
    void this.tool?.close().catch(() => {});
    this.active = false;
    this.generation++;
    this.requester?.dispose();
    this.requester = null;
  }
}
