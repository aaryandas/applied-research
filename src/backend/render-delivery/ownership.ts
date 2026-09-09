import type { OriginOwnership } from './types.js';

/**
 * Railway has no local SQLite project graph. Do not treat UUID syntax as
 * approval. AR-48 render submit uses the account-scoped planner receipt reader
 * instead of this project-ACL seam.
 */
export function failClosedOriginOwnership(
  reason = 'Render origin ownership is not activated on this host.',
): OriginOwnership {
  void reason;
  return {
    assertOwned: async () => false,
  };
}

export function backendEvidenceOriginOwnership(evidence: {
  assertAccountOwnsProject(
    accountId: string,
    projectId: string,
  ): Promise<boolean>;
}): OriginOwnership {
  return {
    async assertOwned(accountId, origin) {
      if (!accountId || !origin.projectId) return false;
      return evidence.assertAccountOwnsProject(accountId, origin.projectId);
    },
  };
}
