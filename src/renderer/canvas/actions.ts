import { createContext } from 'react';
import type { WorkspaceCanvasProps } from './types';

export const CanvasActions = createContext<
  Pick<WorkspaceCanvasProps, 'onOpenOrigin' | 'onEditEntry'>
>({ onOpenOrigin: () => undefined, onEditEntry: () => undefined });
