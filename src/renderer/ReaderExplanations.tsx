import { useState, type ReactElement } from 'react';
import type { RecipeId } from '../contracts/explanations';
import { LocalExplanations } from './explanations/ExplanationExperience';

/** Explicit session-local examples: never attributed to the selected source or learner. */
export function ReaderExplanations({
  active,
}: {
  active: boolean;
}): ReactElement {
  const [recipe, setRecipe] = useState<RecipeId | null>(null);
  return (
    <section
      className="shell-explanations"
      aria-label="Interactive explanations"
    >
      <h2>Interactive explanations</h2>
      <p className="reader-muted">
        Explore a local example. These illustrations are separate from your
        sources; captures last for this session.
      </p>
      <div className="reader-actions">
        <button
          aria-pressed={recipe === 'spatial-assembly'}
          onClick={() => setRecipe('spatial-assembly')}
        >
          Explore an assembly
        </button>
        <button
          aria-pressed={recipe === 'two-link-arm'}
          onClick={() => setRecipe('two-link-arm')}
        >
          Explore a two-link arm
        </button>
        {recipe && (
          <button onClick={() => setRecipe(null)}>Close explanation</button>
        )}
      </div>
      <LocalExplanations recipe={active ? recipe : null} />
    </section>
  );
}
