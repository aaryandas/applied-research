import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import type { PracticalContextRegistration } from '../practical/context-resolver';
import type { DesktopBridge } from '../../contracts/desktop';
import { PRACTICAL_TOOLS } from '../../contracts/practical-tools';
import {
  createPracticalToolAdapter,
  type PracticalToolAdapter,
} from '../practical/tool-adapter';
import { PracticalToolHost } from './PracticalToolHost';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type {
  CompanionRequester,
  CompanionState,
  CompanionSessionOptions,
} from '../../contracts/companion';
import type { PracticalWorkspaceBridge } from '../../contracts/practical-records';
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
  const [toolMessage, setToolMessage] = useState('');
  const [requester, setRequester] = useState<CompanionRequester | null>(null);
  const [state, setState] = useState<CompanionState | null>(null);
  const [surface, setSurface] = useState<HTMLElement | null>(null);
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
  const companionContext = useMemo<PracticalContextRegistration | undefined>(
    () =>
      requester ? { registerResolver: requester.registerResolver } : undefined,
    [requester],
  );
  const { registerRevocation } = props;
  useEffect(() => {
    owner.mount();
    registerRevocation(() => owner.revoke());
    return () => {
      owner.dispose();
      registerRevocation(null);
    };
  }, [owner, registerRevocation]);
  return (
    <section ref={setSurface}>
      <label>
        Tool for this attempt
        <select
          aria-label="Tool for this attempt"
          disabled={!props.activity}
          value={tool?.url ?? ''}
          onChange={(event) => {
            const selected = PRACTICAL_TOOLS.find(
              (tool) => tool.url === event.target.value,
            );
            if (!selected) return;
            void owner
              .flush()
              .then((result) => {
                if (result.status !== 'ready') return;
                const adapter = createPracticalToolAdapter({
                  bridge: props.toolBridge,
                  toolId: selected.id,
                  stopGuidance: async () => {
                    owner.revoke();
                  },
                });
                owner.setTool(adapter);
                setTool(adapter);
              })
              .catch(() =>
                setToolMessage('Save this draft before changing tools.'),
              );
          }}
        >
          <option value="" disabled>
            Choose a compatible tool, or work externally
          </option>
          {PRACTICAL_TOOLS.map((tool) => (
            <option key={tool.id} value={tool.url}>
              {tool.label}
            </option>
          ))}
        </select>
      </label>
      {toolMessage && <p role="status">{toolMessage}</p>}

      <PracticalWorkspace
        {...props}
        bridge={owner.bridge}
        registerFlush={owner.registerFlush}
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
