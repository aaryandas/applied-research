import { useState } from 'react';
import type { ReaderExplanationRequest } from '../reader/Reader';
import type { ContextualSelection } from './ContextualHelpPanel';

export function useContextualSelection(): {
  selection: ContextualSelection | null;
  explainSelection: (request: ReaderExplanationRequest) => Promise<void>;
} {
  const [selection, setSelection] = useState<ContextualSelection | null>(null);
  return {
    selection,
    explainSelection: async (request) => {
      setSelection({
        kind: request.kind,
        origin: request.origin,
        quote: request.quote,
      });
    },
  };
}
