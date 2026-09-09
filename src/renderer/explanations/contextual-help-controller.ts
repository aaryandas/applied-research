import { useState } from 'react';
import type { ContextualHelpIntent } from '../../contracts/contextual-help';
import type { LearningOrigin } from '../../contracts/learning-records';
import type { ReaderExplanationRequest } from '../reader/Reader';
import type { ContextualSelection } from './ContextualHelpPanel';

export function useContextualSelection(): {
  selection: ContextualSelection | null;
  openExplanationId: string | null;
  explainSelection: (request: ReaderExplanationRequest) => Promise<void>;
  openRetainedExplanation: (input: {
    explanationId: string;
    intent: ContextualHelpIntent;
    origin: LearningOrigin;
    quote: string;
  }) => void;
} {
  const [selection, setSelection] = useState<ContextualSelection | null>(null);
  const [openExplanationId, setOpenExplanationId] = useState<string | null>(
    null,
  );
  return {
    selection,
    openExplanationId,
    explainSelection: async (request) => {
      setOpenExplanationId(null);
      setSelection({
        kind: request.kind,
        origin: request.origin,
        quote: request.quote,
      });
    },
    openRetainedExplanation: (input) => {
      setOpenExplanationId(input.explanationId);
      setSelection({
        kind: input.intent,
        origin: input.origin,
        quote: input.quote,
      });
    },
  };
}
