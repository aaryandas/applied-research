import type { AiProvenance, SourceRevisionInput } from './learning-api';
import type { SourceCitation } from './learning-records';

/** Main/backend handoff only. This is not a renderer bridge input. */
export interface GeneratedLessonAcceptance {
  projectId: string;
  requestId: string;
  source: SourceRevisionInput;
  generation: AiProvenance;
  citations: SourceCitation[];
}
