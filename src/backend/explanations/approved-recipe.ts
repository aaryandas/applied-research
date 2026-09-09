import { and, eq } from 'drizzle-orm';
import type { DatabaseService } from '../database.js';
import { learningRequest as learningRequestTable } from '../schema.js';
import type { ApprovedRenderLookup } from '../render-delivery/types.js';
import { installedRecipeJsonFromPlan } from './installed-recipe.js';
import {
  citedSourcesAreAdmitted,
  isClipRenderFamily,
  originRevisionIsAdmitted,
} from './render-context.js';
import { decodePlannerHttpResponse } from './response-decode.js';

const MISSING = 'The planner request was not found.';
const MALFORMED = 'The stored planner grant is malformed.';
const NOT_RETAINED =
  'The planner request did not retain a supported clip grant.';
const NO_GRANT = 'This planner result cannot start a remote render.';

export function interpretStoredPlannerGrant(input: {
  readonly requestId: string;
  readonly publicResponse: unknown;
}): ApprovedRenderLookup {
  const decoded = decodePlannerHttpResponse(
    input.publicResponse,
    input.requestId,
  );
  if (!decoded.ok) {
    return { ok: false, reason: 'invalid-request', message: MALFORMED };
  }
  if (decoded.value.outcome !== 'success') {
    return { ok: false, reason: 'invalid-request', message: NOT_RETAINED };
  }
  const stored = decoded.value;
  const receipt = stored.renderReceipt;
  if (!receipt) {
    return { ok: false, reason: 'unsupported', message: NO_GRANT };
  }
  if (
    stored.plan.status !== 'supported' ||
    !isClipRenderFamily(stored.plan.family) ||
    receipt.family !== stored.plan.family
  ) {
    return { ok: false, reason: 'unsupported', message: NO_GRANT };
  }
  const admittedRevisions = stored.provenance.sourceRevisions;
  if (
    !originRevisionIsAdmitted(receipt.origin, admittedRevisions) ||
    !receipt.sourceLocators.every((locator) =>
      admittedRevisions.some(
        (admitted) => admitted.revisionId === locator.revisionId,
      ),
    )
  ) {
    return { ok: false, reason: 'invalid-request', message: MALFORMED };
  }
  if (!citedSourcesAreAdmitted(stored.plan, receipt.sourceLocators)) {
    return { ok: false, reason: 'unsupported', message: NO_GRANT };
  }
  const projected = installedRecipeJsonFromPlan({
    plan: stored.plan,
    requestId: input.requestId,
    projectId: receipt.projectId,
    origin: receipt.origin,
  });
  if (!projected.ok) {
    return { ok: false, reason: 'unsupported', message: projected.message };
  }
  return {
    ok: true,
    recipeJson: projected.json,
    origin: {
      projectId: receipt.projectId,
      sourceVersionId: receipt.origin.sourceRevisionId,
      questionId: null,
      lessonId: receipt.origin.path?.lessonId ?? null,
    },
  };
}

export function makePostgresApprovedRecipeReader(
  database: DatabaseService,
): (accountId: string, requestId: string) => Promise<ApprovedRenderLookup> {
  return async (accountId, requestId) => {
    const [row] = await database.db
      .select({
        publicResponse: learningRequestTable.publicResponse,
      })
      .from(learningRequestTable)
      .where(
        and(
          eq(learningRequestTable.accountId, accountId),
          eq(learningRequestTable.requestId, requestId),
        ),
      );
    if (!row || row.publicResponse === null) {
      return { ok: false, reason: 'not-found', message: MISSING };
    }
    return interpretStoredPlannerGrant({
      requestId,
      publicResponse: row.publicResponse,
    });
  };
}
