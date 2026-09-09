import type { PathOrigin } from '../../contracts/learning-records';

export type CourseResume = {
  path: PathOrigin;
  sourceRevisionId: string | null;
  span: { start: number; end: number; quote: string } | null;
};
