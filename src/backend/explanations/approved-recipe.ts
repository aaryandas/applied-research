import { and, eq } from 'drizzle-orm';
import type { DatabaseService } from '../database.js';
import { learningRequest as learningRequestTable } from '../schema.js';
import type { ApprovedRenderLookup } from '../render-delivery/types.js';
import { installedRecipeJsonFromPlan } from './installed-recipe.js';
import { isClipRenderFamily } from './render-context.js';
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
  const receipt = decoded.value.renderReceipt;
  if (!receipt) {
    return { ok: false, reason: 'unsupported', message: NO_GRANT };
  }
  if (
    decoded.value.plan.status !== 'supported' ||
    !isClipRenderFamily(decoded.value.plan.family) ||
    receipt.family !== decoded.value.plan.family
  ) {
    return { ok: false, reason: 'unsupported', message: NO_GRANT };
  }
  const projected = installedRecipeJsonFromPlan({
    plan: decoded.value.plan,
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
      lessonId: receipt.origin.path.lessonId,
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
