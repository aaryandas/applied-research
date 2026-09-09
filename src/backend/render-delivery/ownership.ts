import type { OriginOwnership } from './types.js';

/**
 * Railway has no local SQLite project graph. Ownership is fail-closed until
 * AR-48 injects account-bound backend evidence. Never treat UUID syntax or a
 * missing grant as approval.
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
