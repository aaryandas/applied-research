import type { RetainedExplanationResult } from '../contracts/explanation-artifacts';

export type ClipPlaybackResult =
  | { kind: 'unavailable'; message: string }
  | {
      kind: 'ready';
      result: Extract<RetainedExplanationResult, { kind: 'clip' }>;
    };

export function unavailableClipPlayback(): ClipPlaybackResult {
  return {
    kind: 'unavailable',
    message: 'Manim playback is not mounted in this revision.',
  };
}
