/** Paths from the approved portable workspace's icon family. */
export function CanvasGlyph({ kind }: { kind: string }): React.JSX.Element {
  const paths: Record<string, string> = {
    note: 'M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6m5-2 5 5-9 9-6 1 1-6Z',
    insight:
      'M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 2H9s0-1-1-2ZM12 1v1M2 9h1m18 0h1M4 3l1 1m14 0 1-1',
    question: 'M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.1',
    source: 'M12 5v15M3 4c4-1 6 0 9 1 3-1 5-2 9-1v14c-4-1-6 0-9 2-3-2-5-3-9-2Z',
  };
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
      <path d={paths[kind] ?? 'm3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4'} />
      {kind === 'question' && <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
