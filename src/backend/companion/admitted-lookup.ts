import type { Effect } from 'effect';
import type { PublicAccount } from '../../contracts/learning-api.js';
import type { SourcePersistence } from '../sourcing/persistence.js';

/**
 * Account-scoped admitted-source digest lookup for companion HTTP.
 * Uses existing sourcing persistence only (`getRevision(accountId, ...)`).
 * A miss is not a corpus hit; callers must not invent a global/unowned lookup
 * or treat a client-supplied hash as admission.
 */
export type AccountScopedAdmittedSourceLookup = (
  account: PublicAccount,
  input: { readonly sourceId: string; readonly revisionId: string },
) => Promise<{ sha256: string } | null>;

export function makeAccountScopedAdmittedSourceLookup(
  persistence: SourcePersistence,
  runEffect: <A, E>(
    effect: Effect.Effect<A, E>,
    signal?: AbortSignal,
  ) => Promise<A>,
): AccountScopedAdmittedSourceLookup {
  return async (account, input) => {
    const source = await runEffect(
      persistence.getRevision(account.id, input.sourceId, input.revisionId),
    );
    if (!source) return null;
    return { sha256: source.content.revision.sha256 };
  };
}
