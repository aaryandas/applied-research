import { StrictMode, useState, type ReactElement } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CompanionSessionOptions,
  CompanionState,
} from '../../contracts/companion';
import type { PracticalGuidanceRequest } from '../../contracts/practical-work';
import { Companion } from './Companion';
import { createCompanionSession } from './session';
import type { CompanionTargetRevealer } from './target-pointer';

const request: PracticalGuidanceRequest = {
  trigger: 'explicit-action',
  target: {
    scope: 'applied-research',
    surface: 'practical-work',
    attemptId: 'attempt',
    target: 'reflection',
    activity: {
      projectId: 'project',
      title: 'Compare two cases',
      objective: 'Explain a difference',
      instructions: 'Test the change',
      origin: {
        path: {
          pathId: 'path',
          pathRevision: 1,
          topicId: 'topic',
          lessonId: 'lesson',
        },
      },
    },
  },
};
let reduced = false;
let media: EventTarget;
let nextFrame = 0;
let frames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  reduced = false;
  media = new EventTarget();
  frames = new Map();
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced;
    },
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup({
  unavailable = false,
  parked = false,
  targetRevealer,
  selectedRequest = request,
}: {
  unavailable?: boolean;
  parked?: boolean;
  targetRevealer?: CompanionTargetRevealer;
  selectedRequest?: PracticalGuidanceRequest;
} = {}) {
  const resolveTarget = vi.fn<CompanionSessionOptions['resolveTarget']>(
    async (selected) => ({
      status: 'available',
      requestedTarget: selected.target,
      context: {
        target: 'reflection',
        authorKind: 'human',
        text: 'My untouched draft',
        version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 2 },
      },
    }),
  );
  const requestGuidance = vi.fn<CompanionSessionOptions['requestGuidance']>(
    async () => ({ status: 'answered', text: 'Compare the changed variable.' }),
  );
  const surface = document.createElement('div');
  document.body.append(surface);
  let notify: (state: CompanionState) => void = () => undefined;
  const session = createCompanionSession({
    ...selectedRequest.target,
    resolveTarget,
    requestGuidance,
    onStateChange: (state) => notify(state),
    now: () => 0,
    createRequestId: () => 'request',
  });
  function Harness(): ReactElement {
    const [state, setState] = useState(session.getState);
    notify = setState;
    return (
      <>
        <textarea aria-label="Human draft" defaultValue="My untouched draft" />
        <Companion
          session={session}
          state={state}
          selectedRequest={unavailable ? null : selectedRequest}
          pointerSurface={surface}
          parkPointer={parked}
          {...(targetRevealer ? { targetRevealer } : {})}
        />
      </>
    );
  }
  const view = render(
    <StrictMode>
      <Harness />
    </StrictMode>,
    { container: surface },
  );
  return { ...view, surface, session, resolveTarget, requestGuidance };
}
function move(surface: HTMLElement, x: number, y: number): void {
  fireEvent(
    surface,
    new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }),
  );
}
function paint(): void {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const frame of pending) frame(0);
  });
}

describe('Companion app-owned controls and decoration', () => {
  it('identifies a human-reported result as an unsaved report', async () => {
    const selectedRequest: PracticalGuidanceRequest = {
      ...request,
      target: { ...request.target, target: 'selected-result' },
    };
    const t = setup({ selectedRequest });
    t.resolveTarget.mockResolvedValueOnce({
      status: 'available',
      requestedTarget: selectedRequest.target,
      context: {
        target: 'selected-result',
        result: {
          kind: 'user-reported-text',
          text: 'I saw a change',
          version: { kind: 'unsaved-draft', lastAcknowledgedRevision: 2 },
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Ask about selected target' }),
    );
    await screen.findByText(
      'AI guidance · Selected result · Unsaved human-reported result',
    );
  });

  it.each([
    {
      reference: { kind: 'app-measured' as const, captureId: 'capture' },
      label: 'App-measured result',
    },
    {
      reference: {
        kind: 'user-selected-file' as const,
        selectionId: 'selection',
      },
      label: 'Imported result',
    },
  ])(
    'labels selected $label separately from AI advice',
    async ({ reference, label }) => {
      const selectedRequest: PracticalGuidanceRequest = {
        ...request,
        target: { ...request.target, target: 'selected-result' },
      };
      const t = setup({ selectedRequest });
      t.resolveTarget.mockResolvedValueOnce({
        status: 'available',
        requestedTarget: selectedRequest.target,
        context: {
          target: 'selected-result',
          result: {
            kind: 'trusted-selected-evidence',
            reference,
            text: 'Trusted selected result',
            provenanceId: 'result-revision',
          },
        },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Ask about selected target' }),
      );
      await screen.findByText(`AI guidance · Selected result · ${label}`);
      expect(screen.getByRole('textbox', { name: 'Human draft' })).toHaveValue(
        'My untouched draft',
      );
    },
  );

  it('companion commands do not submit a surrounding human-writing form', () => {
    const t = setup();
    const form = document.createElement('form');
    document.body.append(form);
    form.append(t.surface);
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener('submit', submit);
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    expect(submit).not.toHaveBeenCalled();
    form.remove();
  });

  it('keeps one-shot cancellation reachable with the panel closed and restores keyboard focus', async () => {
    const t = setup();
    let finish!: (value: { status: 'answered'; text: string }) => void;
    t.requestGuidance.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.keyDown(t.surface, { key: 'j', ctrlKey: true });
    fireEvent.click(
      screen.getByRole('button', { name: 'Ask about selected target' }),
    );
    await screen.findByText('Asking for guidance…');
    fireEvent.keyDown(
      screen.getByRole('button', { name: 'Ask about selected target' }),
      { key: 'Escape' },
    );
    const cancel = screen.getByRole('button', { name: 'Cancel answer' });
    cancel.focus();
    fireEvent.click(cancel);
    expect(screen.getByRole('button', { name: 'Companion' })).toHaveFocus();
    expect(t.requestGuidance.mock.calls[0]?.[1].aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    expect(
      screen.getByRole('button', { name: 'Ask about selected target' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Stopping the previous request…'),
    ).toBeInTheDocument();
    await act(async () => {
      finish({ status: 'answered', text: 'Late answer' });
    });
    expect(screen.queryByText('Late answer')).not.toBeInTheDocument();
    expect(t.session.getState().observation.status).toBe('inactive');
    expect(
      screen.getByRole('button', { name: 'Ask about selected target' }),
    ).toBeEnabled();
  });

  it('mount, idle, disclosure, pointer motion and local typing make zero context reads or requests', () => {
    const t = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    move(t.surface, 99999, -100);
    paint();
    const mark = t.container.querySelector('.activity-companion-pointer');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveStyle({
      pointerEvents: 'none',
      transform: `translate3d(${window.innerWidth - 40}px, 8px, 0)`,
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Human draft' }), {
      target: { value: 'New local thought' },
    });
    expect(t.resolveTarget).not.toHaveBeenCalled();
    expect(t.requestGuidance).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it('keyboard command focuses a normal action, Escape restores focus, one-shot leaves guidance off', async () => {
    const t = setup();
    fireEvent.keyDown(t.surface, { key: 'j', ctrlKey: true });
    const ask = screen.getByRole('button', {
      name: 'Ask about selected target',
    });
    expect(ask).toHaveFocus();
    fireEvent.click(ask);
    await screen.findByText('Compare the changed variable.');
    expect(
      screen.getByText(
        /AI guidance · Your reflection · Unsaved human reflection/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Human draft' })).toHaveValue(
      'My untouched draft',
    );
    expect(t.session.getState().observation.status).toBe('inactive');
    fireEvent.keyDown(ask, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Companion' })).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: 'Ask about selected target' }),
    ).not.toBeInTheDocument();
  });

  it('shows authorized scope outside the disclosure and stops from normal controls', async () => {
    const t = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Guide this activity' }),
    );
    await screen.findByText(
      /Guiding: Compare two cases · Your reflection · No tool observation/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop guidance' }));
    expect(t.session.getState().observation.status).toBe('inactive');
    expect(screen.getByText('Guidance is off.')).toBeInTheDocument();
  });

  it('keeps unavailable selections disabled without trying to read drafts', () => {
    const t = setup({ unavailable: true });
    fireEvent.keyDown(t.surface, { key: 'j', metaKey: true });
    expect(
      screen.getByRole('button', { name: 'Ask about selected target' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Guide this activity' }),
    ).toBeDisabled();
    expect(t.resolveTarget).not.toHaveBeenCalled();
  });

  it('parks under reduced motion and on preference changes without disabling commands', () => {
    reduced = true;
    const t = setup();
    move(t.surface, 100, 100);
    paint();
    const mark = t.container.querySelector('.activity-companion-pointer');
    expect(mark).not.toHaveAttribute('data-following');
    reduced = false;
    move(t.surface, 100, 100);
    paint();
    expect(mark).toHaveAttribute('data-following', 'true');
    act(() => {
      media.dispatchEvent(new Event('change'));
    });
    expect(mark).toHaveAttribute('data-following', 'true');
    reduced = true;
    act(() => {
      media.dispatchEvent(new Event('change'));
    });
    expect(mark).not.toHaveAttribute('data-following');
    fireEvent.keyDown(t.surface, { key: 'j', ctrlKey: true });
    expect(
      screen.getByRole('button', { name: 'Ask about selected target' }),
    ).toHaveFocus();
    expect(t.resolveTarget).not.toHaveBeenCalled();
  });

  it('keeps the mark parked over a host-reported native guest', () => {
    const t = setup({ parked: true });
    move(t.surface, 100, 100);
    paint();
    expect(
      t.container.querySelector('.activity-companion-pointer'),
    ).not.toHaveAttribute('data-following');
    expect(t.resolveTarget).not.toHaveBeenCalled();
  });

  it('cleans up animation, keyboard and pointer listeners and revokes on unmount', async () => {
    const t = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Guide this activity' }),
    );
    await waitFor(() =>
      expect(t.session.getState().observation.status).toBe('active'),
    );
    move(t.surface, 100, 100);
    expect(frames.size).toBe(1);
    t.unmount();
    expect(frames.size).toBe(0);
    expect(t.session.getState().observation).toEqual({
      status: 'inactive',
      reason: 'unmount',
    });
    move(t.surface, 200, 200);
    paint();
    fireEvent.keyDown(t.surface, { key: 'j', ctrlKey: true });
    expect(frames.size).toBe(0);
    expect(t.resolveTarget).toHaveBeenCalledTimes(1);
  });
  it('reveals and points to an app-owned target with keyboard focus and zero context/AI calls', async () => {
    const ownedControl = document.createElement('button');
    ownedControl.textContent = 'Owned target';
    document.body.append(ownedControl);
    const bounds = vi
      .spyOn(ownedControl, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(40, 60, 100, 30));
    let invalidate = (): void => {};
    const reveal = vi.fn<CompanionTargetRevealer['reveal']>(async (target) => {
      ownedControl.focus();
      const rect = ownedControl.getBoundingClientRect();
      return {
        status: 'revealed',
        target,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    });
    const t = setup({
      targetRevealer: {
        reveal,
        onInvalidate: (listener) => {
          invalidate = listener;
          return () => {
            invalidate = () => undefined;
          };
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Show selected target' }),
    );
    await screen.findByText('Showing Your reflection.');
    expect(ownedControl).toHaveFocus();
    expect(bounds).toHaveBeenCalledTimes(1);
    const outline = t.container.querySelector('.activity-companion-target');
    expect(outline).toHaveAttribute('aria-hidden', 'true');
    expect(outline).toHaveStyle({
      left: '40px',
      top: '60px',
      width: '100px',
      height: '30px',
      pointerEvents: 'none',
    });
    expect(t.resolveTarget).not.toHaveBeenCalled();
    expect(t.requestGuidance).not.toHaveBeenCalled();
    act(() => invalidate());
    expect(t.container.querySelector('.activity-companion-target')).toBeNull();
    expect(reveal).toHaveBeenCalledTimes(1);
    t.unmount();
    ownedControl.remove();
  });

  it('disables semantic reveal when no app-owned geometry producer exists', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    expect(
      screen.getByRole('button', { name: 'Show selected target' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Target reveal is unavailable.'),
    ).toBeInTheDocument();
  });
});
