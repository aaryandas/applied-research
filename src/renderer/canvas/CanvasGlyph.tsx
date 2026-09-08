import type { CanvasContent } from './graph';

/** Paths from the approved portable workspace's icon family. */
const paths: Record<CanvasContent['kind'], string> = {
  note: 'M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6m5-2 5 5-9 9-6 1 1-6Z',
  insight:
    'M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2ZM12 1v1M2 9h1m18 0h1M4 3l1 1m14 0 1-1',
  question: 'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1',
  source: 'M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v14c-4-1-6 0-9 2-3-2-5-3-9-2Z',
  topic: 'm3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4',
  lesson: 'M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5',
  highlight: 'm5 16 9-12 6 5-9 12H5Zm0 5h14M8 12l6 5',
  assistant: 'M12 3v3m0 12v3M3 12h3m12 0h3M8 8l8 8m0-8-8 8',
  result: 'M4 20V4m0 16h16M8 16v-4m4 4V8m4 8V5',
  experiment: 'M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 14h8',
};
export function CanvasGlyph({
  kind,
}: {
  readonly kind: CanvasContent['kind'];
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
      {kind === 'question' && <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
