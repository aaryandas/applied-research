import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import type {
  PracticalContextRegistration,
  PracticalHostToolState,
} from '../practical/context-resolver';
import type { DesktopBridge } from '../../contracts/desktop';
import {
  PRACTICAL_TOOLS,
  type PracticalToolId,
} from '../../contracts/practical-tools';
import { PRACTICAL_HOST_CONTROLS } from '../practical/host-controls';
import {
  createPracticalToolAdapter,
  type PracticalToolAdapter,
} from '../practical/tool-adapter';
import { PracticalToolHost } from './PracticalToolHost';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type {
  CompanionRequester,
  CompanionState,
  CompanionSessionOptions,
} from '../../contracts/companion';
import type {
  PracticalAttemptJourney,
  PracticalWorkChoice,
  PracticalWorkspaceBridge,
} from '../../contracts/practical-records';
import {
  projectPracticeTool,
  type PracticalBriefTool,
} from '../../contracts/practical-brief';
import type {
  PracticalActivity,
  RegisterPracticalFlush,
} from '../../contracts/practical-work';
import { PracticalWorkspace } from '../practical/PracticalWorkspace';
import { Companion } from '../companion/Companion';
import { PracticalSessionOwner } from './practical-session';

interface PracticalSessionProps {
  bridge: PracticalWorkspaceBridge;
  toolBridge: Pick<
    DesktopBridge,
    'openTool' | 'closeTool' | 'openExternal' | 'onToolState' | 'resizeTool'
  >;
  activity: PracticalActivity | null;
  attemptId: string;
  attemptSelection?: 'latest' | 'exact';
  availableActivities?: readonly PracticalActivity[];
  onSelectActivity?: (activity: PracticalActivity) => void;
  onResumeAttempt?: (attemptId: string) => void;
  onStartNewAttempt?: () => void;
  registerFlush: RegisterPracticalFlush;
  onReturnToLearning(activity: PracticalActivity): void;
  registerRevocation(stop: (() => void) | null): void;
  requestGuidance?: CompanionSessionOptions['requestGuidance'];
}

export function PracticalSession(
  props: Readonly<PracticalSessionProps>,
): ReactElement {
  const [selectedRequest, setSelectedRequest] =
    useState<PracticalGuidanceRequest | null>(null);
  const [tool, setTool] = useState<PracticalToolAdapter | null>(null);
  const [toolSessionId, setToolSessionId] = useState<string | undefined>();
  const [workChoice, setWorkChoice] = useState<PracticalWorkChoice | null>(
    null,
  );
  const [journey, setJourney] = useState<PracticalAttemptJourney | null>(null);
  const [toolMessage, setToolMessage] = useState('');
  const [requester, setRequester] = useState<CompanionRequester | null>(null);
  const [state, setState] = useState<CompanionState | null>(null);
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const hostToolStateRef = useRef<PracticalHostToolState | null>(null);
  const registerRevocationRef = useRef(props.registerRevocation);
  const [resolvedAttemptId, setResolvedAttemptId] = useState(props.attemptId);
  const [owner] = useState(
    () =>
      new PracticalSessionOwner({
        bridge: props.bridge,
        attemptId: props.attemptId,
        registerFlush: props.registerFlush,
        ...(props.requestGuidance
          ? { requestGuidance: props.requestGuidance }
          : {}),
        onRequester: setRequester,
        onState: setState,
      }),
  );
  useEffect(() => {
    registerRevocationRef.current = props.registerRevocation;
  });
  useEffect(() => {
    owner.mount();
    registerRevocationRef.current(() => owner.revoke());
    return () => {
      owner.dispose();
      registerRevocationRef.current(null);
    };
  }, [owner]);
  useEffect(() => {
    hostToolStateRef.current = null;
    if (!tool || !toolSessionId) return;
    return props.toolBridge.onToolState((native) => {
      hostToolStateRef.current = {
        sessionId: toolSessionId,
        url: native.url,
        title: native.title,
        loading: native.loading,
        error: native.error || null,
        controls: PRACTICAL_HOST_CONTROLS,
      };
    });
  }, [props.toolBridge, tool, toolSessionId]);

  const resolveEvidence = useMemo(
    () =>
      async (
        scope: Parameters<
          NonNullable<PracticalContextRegistration['resolveEvidence']>
        >[0],
        reference: Parameters<
          NonNullable<PracticalContextRegistration['resolveEvidence']>
        >[1],
        signal: AbortSignal,
      ) => {
        if (reference.kind !== 'user-selected-file' || signal.aborted)
          return null;
        const preview = await props.bridge.previewPracticalFile({
          activity: scope.activity,
          attemptId: scope.attemptId,
          selectionId: reference.selectionId,
        });
        if (signal.aborted || preview.status !== 'ready') return null;
        return {
          scope,
          reference,
          text: preview.text,
          provenanceId: preview.provenanceId,
        };
      },
    [props.bridge],
  );

  const getToolState = useCallback(
    () => readHostToolState(hostToolStateRef),
    [],
  );
  const companionContext = useMemo<PracticalContextRegistration | undefined>(
    () =>
      requester
        ? {
            registerResolver: requester.registerResolver,
            resolveEvidence,
            ...(toolSessionId
              ? {
                  toolSessionId,
                  getToolState,
                }
              : {}),
          }
        : undefined,
    [requester, resolveEvidence, toolSessionId, getToolState],
  );

  const briefTools = journey?.brief
    ? [projectPracticeTool(journey.brief.brief.tool)]
    : [];
  const catalogOptions = workOptions(briefTools);

  function attachSupportedTool(toolId: PracticalToolId): void {
    const adapter = createPracticalToolAdapter({
      bridge: props.toolBridge,
      toolId,
      stopGuidance: async () => {
        owner.revoke();
      },
    });
    owner.setTool(adapter);
    setToolSessionId(crypto.randomUUID());
    setTool(adapter);
  }

  function detachTool(): void {
    owner.setTool(null);
    setTool(null);
    setToolSessionId(undefined);
    hostToolStateRef.current = null;
  }

  async function applyWorkChoice(
    choice: PracticalWorkChoice | null,
  ): Promise<void> {
    await owner.flush();
    detachTool();
    setWorkChoice(choice);
    if (choice?.kind === 'supported-tool') attachSupportedTool(choice.toolId);
    if (!choice || !props.activity) return;
    const saved = await owner.bridge.recordPracticalWorkChoice({
      activity: props.activity,
      attemptId: resolvedAttemptId,
      choice,
    });
    if (saved.status !== 'saved')
      setToolMessage('The work choice could not be saved with this attempt.');
  }

  return (
    <section ref={setSurface}>
      <label>
        Tool for this attempt
        <select
          aria-label="Tool for this attempt"
          disabled={!props.activity}
          value={workChoiceValue(workChoice)}
          onChange={(event) => {
            const next = parseWorkChoice(event.target.value, briefTools);
            void owner
              .flush()
              .then((result) => {
                if (result.status !== 'ready') return;
                return applyWorkChoice(next);
              })
              .catch(() =>
                setToolMessage('Save this draft before changing tools.'),
              );
          }}
        >
          <option value="">Choose a compatible tool, or work externally</option>
          {catalogOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {workChoice?.kind === 'external-work' && (
        <p className="practical-copy">
          External work does not auto-launch.{' '}
          {workChoice.instructions ||
            'Use your own tools, then bring a selected result back.'}
        </p>
      )}
      {toolMessage && <p role="status">{toolMessage}</p>}

      <PracticalWorkspace
        bridge={owner.bridge}
        activity={props.activity}
        attemptId={props.attemptId}
        attemptSelection={props.attemptSelection}
        availableActivities={props.availableActivities}
        onSelectActivity={props.onSelectActivity}
        onResumeAttempt={props.onResumeAttempt}
        onStartNewAttempt={props.onStartNewAttempt}
        registerFlush={owner.registerFlush}
        onReturnToLearning={props.onReturnToLearning}
        onJourney={(next, attemptId) => {
          setJourney(next);
          setResolvedAttemptId(attemptId);
          if (workChoice) return;
          setWorkChoice(next.workChoice);
          if (next.workChoice?.kind === 'supported-tool')
            attachSupportedTool(next.workChoice.toolId);
        }}
        {...(tool
          ? {
              tool: {
                label: tool.label,
                embedded: {
                  open: tool.openEmbedded,
                  content: (
                    <PracticalToolHost
                      bridge={props.toolBridge}
                      adapter={tool}
                      beforeExternal={async () =>
                        (await owner.flush()).status === 'ready'
                      }
                    />
                  ),
                },
                openExternal: async () => {
                  if ((await owner.flush()).status !== 'ready')
                    throw new Error('Save your draft first.');
                  await tool.openExternal();
                },
              },
            }
          : {})}
        activityGuidance={owner.guidance}
        {...(companionContext ? { companionContext } : {})}
        onRequestGuidance={(request) => {
          setSelectedRequest(request);
          void requester?.session.askOnce(request);
        }}
      />
      {requester && state && (
        <Companion
          session={requester.session}
          state={state}
          selectedRequest={selectedRequest}
          pointerSurface={surface}
          parkPointer={tool !== null}
          unavailableMessage="Select a question in this activity first."
        />
      )}
    </section>
  );
}

function workOptions(
  briefTools: readonly PracticalBriefTool[],
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  function add(value: string, label: string): void {
    if (seen.has(value)) return;
    seen.add(value);
    options.push({ value, label });
  }
  for (const tool of briefTools) {
    if (tool.kind === 'supported-embedded')
      add(`tool:${tool.toolId}`, `${tool.label} (in-app)`);
    else add(`external:${tool.label}`, `${tool.label} (external setup)`);
  }
  if (briefTools.length === 0) {
    for (const tool of PRACTICAL_TOOLS)
      add(`tool:${tool.id}`, `${tool.label} (optional in-app)`);
  }
  add('external:own', 'Work in my own tools');
  return options;
}

function workChoiceValue(choice: PracticalWorkChoice | null): string {
  if (!choice) return '';
  return choice.kind === 'supported-tool'
    ? `tool:${choice.toolId}`
    : `external:${choice.label === 'Own tools' ? 'own' : choice.label}`;
}

function readHostToolState(ref: {
  current: PracticalHostToolState | null;
}): PracticalHostToolState | null {
  return ref.current;
}

function parseWorkChoice(
  value: string,
  briefTools: readonly PracticalBriefTool[],
): PracticalWorkChoice | null {
  if (!value) return null;
  if (value.startsWith('tool:')) {
    const toolId = value.slice(5) as PracticalToolId;
    if (!PRACTICAL_TOOLS.some((tool) => tool.id === toolId)) return null;
    return { kind: 'supported-tool', toolId };
  }
  if (value === 'external:own')
    return {
      kind: 'external-work',
      label: 'Own tools',
      instructions:
        'Complete the setup in your own environment. The app will not launch an external tool.',
    };
  const label = value.slice('external:'.length);
  const listed = briefTools.find(
    (tool) => tool.kind === 'external-setup' && tool.label === label,
  );
  return {
    kind: 'external-work',
    label,
    instructions:
      listed && listed.kind === 'external-setup'
        ? listed.instructions
        : 'Follow the external setup for this activity. It does not auto-launch.',
  };
}
