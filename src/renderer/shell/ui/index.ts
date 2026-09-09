import type { ComponentProps } from 'react';
import { EmptyState } from './EmptyState';
import { StatusRegion } from './StatusRegion';

export { EmptyState, StatusRegion };

export type EmptyStateProps = ComponentProps<typeof EmptyState>;
export type StatusRegionProps = ComponentProps<typeof StatusRegion>;
