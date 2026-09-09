import { createContext } from 'react';
import type { WorkspaceCanvasProps } from './types';

export const CanvasActions = createContext<
  Pick<
    WorkspaceCanvasProps,
    'onOpenOrigin' | 'onEditEntry' | 'onOpenRetainedExplanation'
  >
>({ onOpenOrigin: () => undefined, onEditEntry: () => undefined });
