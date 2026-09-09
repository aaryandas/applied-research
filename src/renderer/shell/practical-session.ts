import type { PracticalToolAdapter } from '../practical/tool-adapter';
import type {
  RegisterPracticalFlush,
  PracticalFlushResult,
  PracticalActivity,
} from '../../contracts/practical-work';
import type {
  CompanionRequester,
  CompanionSessionOptions,
  CompanionState,
} from '../../contracts/companion';
import type {
  LoadPracticalAttemptResult,
  LoadPracticalJourneyResult,
  PracticalWorkspaceBridge,
} from '../../contracts/practical-records';
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
  private attemptId: string;
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
  setTool(tool: PracticalToolAdapter | null): void {
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
    this.attemptId = options.attemptId;
    this.bridge = {
      ...options.bridge,
      loadPracticalAttempt: (input) =>
        this.bindLoadedResult(
          options.bridge.loadPracticalAttempt(input),
          input.activity,
        ),
      loadPracticalJourney: (input) =>
        this.bindLoadedResult(
          options.bridge.loadPracticalJourney(input),
          input.activity,
        ),
    };
  }
  mount(): void {
    this.active = true;
  }
  setAttemptId(attemptId: string): void {
    this.attemptId = attemptId;
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

  private bindRequester(activity: PracticalActivity, attemptId: string): void {
    this.requester?.dispose();
    this.requester = createCompanionRequester({
      activity,
      attemptId,
      requestGuidance:
        this.options.requestGuidance ??
        (async () => ({
          status: 'unavailable',
          message: 'Authenticated activity guidance is not connected yet.',
        })),
      onStateChange: (state) => {
        if (this.active) this.options.onState(state);
      },
      now: () => performance.now(),
      createRequestId: () => crypto.randomUUID(),
    });
    this.options.onRequester(this.requester);
    this.options.onState(this.requester.session.getState());
  }

  private async bindLoadedResult<
    T extends LoadPracticalAttemptResult | LoadPracticalJourneyResult,
  >(pending: Promise<T>, activity: PracticalActivity): Promise<T> {
    const token = ++this.generation;
    this.revoke();
    const result = await pending;
    if (result.status !== 'loaded' || !this.active || token !== this.generation)
      return result;
    this.bindRequester(activity, result.attempt?.attemptId ?? this.attemptId);
    return result;
  }
}
