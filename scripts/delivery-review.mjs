import { pathToFileURL } from 'node:url';
import {
  AGENT_ID,
  CURSOR_AGENT_ORIGIN,
  FORBIDDEN_REVIEW_ROLES,
  INDEPENDENT_REVIEWER,
  INDEPENDENT_REVIEW_NAME,
  LAUNCH_RECEIPT_ENV,
  LAUNCH_RECEIPT_KIND,
  LAUNCH_RECEIPT_SCHEMA_VERSION,
  MISSING_CURSOR_API_KEY,
  MISSING_LAUNCH_RECEIPT,
  REQUIRED_MODEL_ID,
  REQUIRED_MODEL_PARAMS,
  REQUIRED_REVIEW_DISPLAY,
  REVIEW_CHECK_NAME,
  RUN_ID,
  TRUSTED_LAUNCH_RECEIPT_SOURCE,
  TRUSTED_REVIEW_JOB_NAME,
  TRUSTED_WORKFLOW_FILE,
  UNTRUSTED_CURSOR_CREDENTIAL,
  isFullSha,
  isSyntheticMergeRef,
  modelParamsMatch,
  redactSecrets,
  ticketFromBranchOrBody,
} from './delivery-constants.mjs';
import {
  assertPinnedStartingRef,
  createCloudReviewAgent,
  getAgent,
  getRun,
  listArtifacts,
  listModels,
} from './delivery-cursor-api.mjs';
import {
  fetchCommitPulls,
  fetchPullRequest,
  fetchWorkflowRun,
  listWorkflowFilesAtRef,
  postCheckRun,
  postIssueComment,
} from './delivery-github.mjs';
import {
  assertTrustedCursorInvocation,
  assertUntrustedMustNotCarryCursorKey,
  cursorCredentialUseAllowed,
  forbiddenCursorSecretWorkflows,
  githubEventName,
  idempotentReviewAgentId,
  isUntrustedGithubEvent,
  launchReceiptFailures,
  requiredIsolationIds,
  reviewIdempotencyKey,
  untrustedEnvLaunchReceipt,
} from './delivery-trust.mjs';

export const REVIEW_PROMPT = `You are the independent critic for Applied Research. You are not the implementer, not the cloud verifier, and not the demo recorder.

Review this pull request on two axes:
- Standards: context/design-handoff/GAUNTLET-PROMPT.md "TypeScript and Effect standards", context/conventions.md, context/architecture.md (process boundaries, bridge exposure, credential handling).
- Spec: the Linear ticket named in the PR body, context/design-handoff/DESIGN-CONTRACT.md for visual criteria, and the lane's contract page under context/.

Rules:
- Do not edit source, tests, configuration, or GitHub checks. Do not push. Do not merge. Do not open a PR.
- Do not call Fable, Claude Code, or any local/headless Cursor inference.
- Read the changed modules and their callers, not just the diff. Cite file:line for every finding.
- Report material findings only. Each finding needs severity (material or note), status (unresolved or resolved), and the required fix.

End with a single JSON object (no surrounding commentary after it) using this shape:
{
  "role": "independent-reviewer",
  "headSha": "<exact 40-character PR head SHA you reviewed>",
  "standards": "PASS" | "FAIL",
  "spec": "PASS" | "FAIL",
  "findings": [{"severity":"material","status":"unresolved","path":"file:line","rule":"...","fix":"..."}],
  "resolutions": []
}

PASS on an axis requires no unresolved material findings on that axis.
Do not treat your JSON role or model fields as authentication; the coordinator binds model identity via the launch receipt.`;

export function catalogHasRequiredGrok46(catalog) {
  const item = (catalog?.items ?? []).find(
    (entry) => entry?.id === REQUIRED_MODEL_ID,
  );
  if (!item) return false;
  const paramOk = REQUIRED_MODEL_PARAMS.every((need) => {
    const definition = (item.params ?? []).find(
      (param) => param.id === need.id,
    );
    if (definition?.values?.some((value) => value.value === need.value)) {
      return true;
    }
    return (item.variants ?? []).some((variant) =>
      modelParamsMatch(variant.params ?? [], [need]),
    );
  });
  if (!paramOk) return false;
  const hay = [item.id, item.displayName, ...(item.aliases ?? [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return !/fable|claude-fable|composer-2|local runtime|headless/.test(hay);
}

export function resolveReviewModel(catalog) {
  if (!catalogHasRequiredGrok46(catalog)) return null;
  const item = catalog.items.find((entry) => entry.id === REQUIRED_MODEL_ID);
  const variant = (item.variants ?? []).find((entry) =>
    modelParamsMatch(entry.params ?? []),
  );
  return {
    id: REQUIRED_MODEL_ID,
    displayName:
      variant?.displayName ?? item.displayName ?? REQUIRED_REVIEW_DISPLAY,
    aliases: item.aliases ?? [],
    extraHighParams: [...REQUIRED_MODEL_PARAMS],
  };
}

export function parseReviewVerdict(resultText) {
  if (typeof resultText !== 'string' || resultText.trim().length === 0) {
    return null;
  }
  const fenced = [...resultText.matchAll(/```json\s*([\s\S]*?)```/gi)].map(
    (match) => match[1],
  );
  const candidates = fenced.length ? fenced : [resultText];
  for (const candidate of candidates.reverse()) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* Keep scanning; malformed JSON is not a PASS. */
    }
  }
  return null;
}

export function agentUrlFor(agentId) {
  return `${CURSOR_AGENT_ORIGIN}/agents/${agentId}`;
}

function unresolvedMaterial(findings) {
  if (!Array.isArray(findings)) return ['findings must be an array'];
  return findings.filter(
    (finding) =>
      finding &&
      (finding.severity === 'material' ||
        finding.severity === 'high' ||
        finding.severity === 'blocker') &&
      finding.status !== 'resolved',
  );
}

export function commentIsNotProof(comment) {
  const body = comment?.body ?? '';
  const login = comment?.user?.login ?? '';
  return {
    forgedBot: login === 'cursor[bot]',
    markerOnly:
      /VERIFICATION_RESULT:\s*PASS/i.test(body) ||
      /Fable 5\.1/i.test(body) ||
      /INDEPENDENT_REVIEW_PASS/i.test(body),
  };
}

export function commentsCannotProveReview(comments = []) {
  return comments.length > 0;
}

export function evaluateIndependentReview({
  expectedHeadSha,
  prUrl,
  catalog,
  agent,
  run,
  artifacts = { items: [] },
  implementerAgentId,
  verifierAgentId,
  recorderAgentId,
  launchReceipt,
  comments = [],
  actionsRun,
} = {}) {
  const failures = [];
  const fail = (reason) => failures.push(reason);

  if (commentsCannotProveReview(comments)) {
    fail('GitHub comments and marker strings are not independent-review proof');
  }

  if (isSyntheticMergeRef(expectedHeadSha) || !isFullSha(expectedHeadSha)) {
    fail(
      'Reviewed head must be the exact 40-character PR commit SHA; merge refs are not proof',
    );
  }
  if (!agent || !AGENT_ID.test(agent.id ?? '')) {
    fail('Authenticated Cursor agent id (bc- UUID) is required');
  }
  if (!implementerAgentId || !verifierAgentId || !recorderAgentId) {
    fail(
      'IMPLEMENTER_AGENT_ID, VERIFIER_AGENT_ID, and RECORDER_AGENT_ID are required isolation ids',
    );
  } else {
    if (!AGENT_ID.test(implementerAgentId)) {
      fail('IMPLEMENTER_AGENT_ID is not a documented bc- UUID');
    }
    if (!AGENT_ID.test(verifierAgentId)) {
      fail('VERIFIER_AGENT_ID is not a documented bc- UUID');
    }
    if (!AGENT_ID.test(recorderAgentId)) {
      fail('RECORDER_AGENT_ID is not a documented bc- UUID');
    }
  }
  if (agent?.id && implementerAgentId && agent.id === implementerAgentId) {
    fail(
      'Independent reviewer must be a different cloud agent than the implementer',
    );
  }
  if (agent?.id && verifierAgentId && agent.id === verifierAgentId) {
    fail(
      'Independent reviewer must be a different cloud agent than the verifier',
    );
  }
  if (agent?.id && recorderAgentId && agent.id === recorderAgentId) {
    fail(
      'Independent reviewer must be a different cloud agent than the recorder',
    );
  }
  if (agent?.env?.type !== 'cloud') {
    fail(
      `Independent review must run on Cursor Cloud env.type=cloud (saw ${agent?.env?.type ?? 'missing'})`,
    );
  }

  const name = String(agent?.name ?? '');
  if (!INDEPENDENT_REVIEW_NAME.test(name)) {
    fail(
      'Authenticated agent.name must match /^Independent review\\b/i; JSON role is not identity',
    );
  }

  const required = resolveReviewModel(catalog);
  if (!required) {
    fail(
      `${REQUIRED_REVIEW_DISPLAY} (model id ${REQUIRED_MODEL_ID}, effort=xhigh, fast=false) is not present in GET /v1/models`,
    );
  }

  for (const reason of launchReceiptFailures(launchReceipt, {
    expectedHeadSha,
    agent,
    run,
    actionsRun,
  })) {
    fail(reason);
  }

  const undocumentedModel =
    agent?.originalModelName ||
    agent?.model ||
    run?.originalModelName ||
    run?.model;
  if (undocumentedModel) {
    fail(
      'GET agent/run included undocumented model fields; ignore them and require a launch receipt instead',
    );
  }

  const verdict = parseReviewVerdict(run?.result);
  if (!verdict) {
    fail(
      'Authenticated run result does not contain a parseable independent-review JSON verdict',
    );
  }
  if (verdict?.model) {
    fail('verdict.model is self-authored and is not model proof');
  }
  if (FORBIDDEN_REVIEW_ROLES.includes(verdict?.role)) {
    fail(`Role ${verdict.role} cannot supply independent review`);
  }
  if (!verdict?.headSha) {
    fail(
      'Verdict headSha is required exact-head evidence; missing headSha is not PASS',
    );
  } else if (verdict.headSha !== expectedHeadSha) {
    fail(
      `Verdict headSha ${verdict.headSha} does not match current PR head ${expectedHeadSha}`,
    );
  }

  try {
    if (agent) assertPinnedStartingRef(agent, expectedHeadSha);
  } catch (error) {
    fail(error.message);
  }

  if (
    prUrl &&
    agent?.repos?.some((repo) => repo.prUrl) &&
    !agent.repos.some((repo) => repo.prUrl === prUrl)
  ) {
    fail('Cursor agent prUrl does not match this pull request URL');
  }

  if (run?.status !== 'FINISHED') {
    fail(
      `Cursor run status must be FINISHED (saw ${run?.status ?? 'missing'})`,
    );
  }
  if (run?.id && !RUN_ID.test(run.id) && !String(run.id).startsWith('run-')) {
    fail('Run identity is not a documented run id');
  }
  if (run?.agentId && agent?.id && run.agentId !== agent.id) {
    fail('Run agentId does not match GET agent id');
  }

  if (verdict?.standards !== 'PASS' || verdict?.spec !== 'PASS') {
    fail(
      `Standards/spec verdict is ${verdict?.standards ?? 'missing'}/${verdict?.spec ?? 'missing'}, not PASS/PASS`,
    );
  }
  if (!Array.isArray(verdict?.findings)) {
    fail('Verdict findings must be an array; missing findings are not PASS');
  } else {
    const open = unresolvedMaterial(verdict.findings);
    if (typeof open[0] === 'string') {
      fail(open[0]);
    } else if (open.length) {
      fail(
        `${open.length} unresolved material finding(s); independent review cannot PASS`,
      );
    }
  }

  const agentUrl = agent?.url ?? (agent?.id ? agentUrlFor(agent.id) : null);
  const artifactUrls = [
    agentUrl,
    run?.url,
    ...(artifacts.items ?? []).map((item) => item.url).filter(Boolean),
  ].filter(Boolean);
  if (!agentUrl || !agentUrl.startsWith(`${CURSOR_AGENT_ORIGIN}/agents/bc-`)) {
    fail(
      'Immutable Cursor agent URL (https://cursor.com/agents/bc-…) is required',
    );
  }

  const passed = failures.length === 0;
  return {
    passed,
    status: passed ? 'PASS' : 'FAIL',
    failures,
    evidence: passed
      ? {
          role: INDEPENDENT_REVIEWER,
          headSha: expectedHeadSha,
          agentId: agent.id,
          runId: run.id,
          agentUrl,
          artifactUrls,
          model: {
            id: launchReceipt.modelId,
            displayName: required?.displayName,
            params: launchReceipt.modelParams,
            provenance: 'trusted-launch-job-bound-to-get-agent-run',
          },
          standards: verdict.standards,
          spec: verdict.spec,
          findings: verdict.findings,
          resolutions: verdict.resolutions ?? [],
        }
      : null,
  };
}

export function missingKeyResult() {
  return {
    passed: false,
    status: 'PENDING',
    failures: [MISSING_CURSOR_API_KEY],
    setupDependency:
      'GitHub Environment trusted-main CURSOR_API_KEY (existing; default-branch deployment policy only)',
    evidence: null,
  };
}

export function untrustedPendingResult() {
  return {
    passed: false,
    status: 'PENDING',
    failures: [UNTRUSTED_CURSOR_CREDENTIAL],
    setupDependency: 'trusted default-branch evaluator',
    evidence: null,
  };
}

export function buildLaunchBody({
  model,
  prUrl,
  repoUrl,
  headSha,
  ticket,
  repository,
  prNumber,
}) {
  if (!isFullSha(headSha)) {
    throw new Error(
      'Launch startingRef must be the exact 40-character head SHA',
    );
  }
  const resolved = model ?? {
    id: REQUIRED_MODEL_ID,
    extraHighParams: [...REQUIRED_MODEL_PARAMS],
  };
  if (resolved.id !== REQUIRED_MODEL_ID) {
    throw new Error(`Launch model.id must be ${REQUIRED_MODEL_ID}`);
  }
  const params = resolved.extraHighParams?.length
    ? resolved.extraHighParams
    : [...REQUIRED_MODEL_PARAMS];
  if (!modelParamsMatch(params)) {
    throw new Error(
      'Launch model.params must include effort=xhigh and fast=false',
    );
  }
  return {
    name: `Independent review ${ticket ?? ''} ${headSha.slice(0, 7)}`.trim(),
    prompt: {
      text: `${REVIEW_PROMPT}\n\nPR: ${prUrl}\nExact head SHA: ${headSha}\nTicket: ${ticket ?? 'unknown'}\nBind this review to the frozen SHA via startingRef; do not use prUrl on create because it ignores startingRef.`,
    },
    model: {
      id: REQUIRED_MODEL_ID,
      params,
    },
    env: { type: 'cloud' },
    repos: [
      {
        url: repoUrl,
        startingRef: headSha,
      },
    ],
    workOnCurrentBranch: false,
    autoCreatePR: false,
    skipReviewerRequest: true,
    agentId: idempotentReviewAgentId({
      repository,
      prNumber,
      headSha,
    }),
  };
}

export function createLaunchReceipt({
  agentId,
  runId,
  headSha,
  prNumber,
  prUrl,
  repository,
  githubRunId,
  githubWorkflowSha,
  githubEvent,
  source = TRUSTED_LAUNCH_RECEIPT_SOURCE,
  workflowPath = TRUSTED_WORKFLOW_FILE,
}) {
  return {
    schemaVersion: LAUNCH_RECEIPT_SCHEMA_VERSION,
    kind: LAUNCH_RECEIPT_KIND,
    source,
    agentId,
    runId,
    headSha,
    prNumber: Number(prNumber),
    prUrl,
    modelId: REQUIRED_MODEL_ID,
    modelParams: [...REQUIRED_MODEL_PARAMS],
    idempotencyKey: reviewIdempotencyKey({
      repository,
      prNumber,
      headSha,
    }),
    githubRunId: githubRunId ?? null,
    githubWorkflowSha: githubWorkflowSha ?? null,
    githubEvent: githubEvent ?? null,
    workflowPath,
    launchedAt: new Date().toISOString(),
  };
}

export async function resolvePrHead({
  repository,
  prNumber,
  envSha,
  token,
  fetchImpl = fetch,
}) {
  if (isSyntheticMergeRef(envSha)) {
    envSha = null;
  }
  if (!token || !prNumber) {
    throw new Error(
      'Cannot resolve exact PR head SHA without GitHub token and PR number',
    );
  }
  const pr = await fetchPullRequest(repository, prNumber, {
    token,
    fetchImpl,
  });
  if (!isFullSha(pr.head?.sha)) {
    throw new Error('GitHub pull head SHA is missing');
  }
  if (envSha && isFullSha(envSha) && envSha !== pr.head.sha) {
    throw new Error(
      `Workflow SHA ${envSha} does not match live PR head ${pr.head.sha}`,
    );
  }
  return { sha: pr.head.sha, pr };
}

export async function evaluateFromCursor({
  apiKey,
  prUrl,
  expectedHeadSha,
  implementerAgentId,
  verifierAgentId,
  recorderAgentId,
  launchReceipt,
  env,
  fetchImpl = fetch,
}) {
  assertTrustedCursorInvocation(env);
  const catalog = await listModels({ apiKey, fetchImpl, env });
  if (!launchReceipt?.agentId) {
    return {
      passed: false,
      status: 'PENDING',
      failures: [MISSING_LAUNCH_RECEIPT],
      catalogHasRequiredModel: Boolean(resolveReviewModel(catalog)),
      evidence: null,
    };
  }
  const githubRunId = launchReceipt.githubRunId;
  const token = env?.GITHUB_TOKEN;
  const repository = env?.REPOSITORY ?? env?.GITHUB_REPOSITORY;
  if (!token || !repository) {
    return {
      passed: false,
      status: 'FAIL',
      failures: [
        'GITHUB_TOKEN and repository are required to GET the launch-receipt Actions run; missing GET is not permission to trust self-authored githubRunId',
      ],
      evidence: null,
    };
  }
  if (!/^\d+$/.test(String(githubRunId ?? ''))) {
    return {
      passed: false,
      status: 'FAIL',
      failures: [
        'Launch receipt githubRunId must be the GitHub Actions run that owned the trusted launch',
      ],
      evidence: null,
    };
  }
  let actionsRun;
  try {
    actionsRun = await fetchWorkflowRun(repository, githubRunId, {
      token,
      fetchImpl,
    });
  } catch (error) {
    return {
      passed: false,
      status: 'FAIL',
      failures: [
        `Could not authenticate launch-receipt GitHub Actions run ${githubRunId}: ${redactSecrets(error.message)}`,
      ],
      evidence: null,
    };
  }
  let agent;
  let run;
  let artifacts = { items: [] };
  try {
    agent = await getAgent(launchReceipt.agentId, { apiKey, fetchImpl, env });
    assertPinnedStartingRef(agent, expectedHeadSha);
    const runId = launchReceipt.runId ?? agent.latestRunId;
    if (runId) run = await getRun(agent.id, runId, { apiKey, fetchImpl, env });
    try {
      artifacts = await listArtifacts(agent.id, { apiKey, fetchImpl, env });
    } catch {
      /* Artifact listing is optional; agent URL still required for PASS. */
    }
  } catch (error) {
    return {
      passed: false,
      status: 'FAIL',
      failures: [redactSecrets(error.message)],
      evidence: null,
    };
  }
  return evaluateIndependentReview({
    expectedHeadSha,
    prUrl,
    catalog,
    agent,
    run,
    artifacts,
    implementerAgentId,
    verifierAgentId,
    recorderAgentId,
    launchReceipt,
    actionsRun,
  });
}

export async function maybeLaunchReview({
  apiKey,
  launch,
  model,
  prUrl,
  repoUrl,
  headSha,
  ticket,
  repository,
  prNumber,
  env,
  fetchImpl = fetch,
}) {
  if (!launch) {
    return {
      launched: false,
      reason:
        'Launch is opt-in via repository variable CURSOR_REVIEW_LAUNCH=true on the trusted default-branch workflow only',
    };
  }
  assertTrustedCursorInvocation(env);
  if (!model) {
    return {
      launched: false,
      reason: `${REQUIRED_REVIEW_DISPLAY} is not in GET /v1/models`,
    };
  }
  const body = buildLaunchBody({
    model,
    prUrl,
    repoUrl,
    headSha,
    ticket,
    repository,
    prNumber,
  });
  const created = await createCloudReviewAgent(body, {
    apiKey,
    fetchImpl,
    env,
    idempotencyKey: reviewIdempotencyKey({
      repository,
      prNumber,
      headSha,
    }),
  });
  const agent = created?.agent;
  const run = created?.run;
  return {
    launched: true,
    agentId: agent?.id,
    runId: run?.id ?? agent?.latestRunId,
    agentUrl: agent?.url,
    idempotentReplay: Boolean(created?.idempotentReplay),
    receipt: createLaunchReceipt({
      agentId: agent?.id,
      runId: run?.id ?? agent?.latestRunId,
      headSha,
      prNumber,
      prUrl,
      repository,
      githubRunId: env.GITHUB_RUN_ID,
      githubWorkflowSha: env.GITHUB_SHA,
      githubEvent: githubEventName(env),
      source: TRUSTED_LAUNCH_RECEIPT_SOURCE,
      workflowPath: TRUSTED_WORKFLOW_FILE,
    }),
  };
}

export function formatReviewComment(result, { headSha, launch } = {}) {
  const lines = [
    `Independent Cursor Cloud review of \`${headSha}\`: **${result.status}**`,
    '',
    `Required model/role: ${REQUIRED_REVIEW_DISPLAY} / ${INDEPENDENT_REVIEWER}.`,
    'Proof is authenticated `GET https://api.cursor.com/v1/agents` + run payload bound to a launch receipt, not this comment.',
  ];
  if (result.evidence) {
    lines.push(
      '',
      `- Agent: ${result.evidence.agentUrl}`,
      `- Run: \`${result.evidence.runId}\``,
      `- Launch-receipt model: \`${result.evidence.model.id}\` (${JSON.stringify(result.evidence.model.params)})`,
      `- Standards: ${result.evidence.standards}; spec: ${result.evidence.spec}`,
    );
  } else {
    lines.push('', ...result.failures.map((failure) => `- ${failure}`));
  }
  if (result.setupDependency) {
    lines.push('', `Setup dependency: ${result.setupDependency}`);
  }
  if (launch?.launched) {
    lines.push(
      '',
      `Launched reviewer ${launch.agentId}; this check stays pending until that exact-head run FINISHES with PASS.`,
    );
  }
  return lines.join('\n');
}

export async function scanPrWorkflows({
  repository,
  headSha,
  token,
  fetchImpl,
}) {
  const files = await listWorkflowFilesAtRef(repository, headSha, {
    token,
    fetchImpl,
  });
  const forbidden = forbiddenCursorSecretWorkflows(files);
  if (forbidden.length) {
    throw new Error(
      `PR must not add secrets.CURSOR_API_KEY to ${forbidden.map((file) => file.path).join(', ')}; only default-branch ${'.github/workflows/independent-review-trusted.yml'} may reference the Cursor credential`,
    );
  }
  return files;
}

async function publishCheck({
  repository,
  token,
  headSha,
  result,
  fetchImpl,
  env = process.env,
}) {
  if (!token) return;
  const runId = env.GITHUB_RUN_ID;
  const provenance = [
    `githubRunId=${runId ?? ''}`,
    `workflow=${TRUSTED_WORKFLOW_FILE}`,
    `job=${TRUSTED_REVIEW_JOB_NAME}`,
    result.evidence?.agentId ? `agentId=${result.evidence.agentId}` : null,
    result.evidence?.runId ? `runId=${result.evidence.runId}` : null,
    `headSha=${headSha}`,
  ]
    .filter(Boolean)
    .join('\n');
  await postCheckRun(
    repository,
    {
      name: REVIEW_CHECK_NAME,
      head_sha: headSha,
      status: 'completed',
      conclusion: result.passed ? 'success' : 'failure',
      output: {
        title: result.passed
          ? 'Cursor Cloud Grok 4.6 Extra High PASS'
          : `Independent review ${result.status}`,
        summary:
          `${provenance}\n\n${(result.failures ?? []).join('\n') || 'PASS'}`.trim(),
      },
    },
    { token, fetchImpl },
  );
}

export async function mainUntrusted(env = process.env, deps = {}) {
  const log = deps.log ?? console;
  assertUntrustedMustNotCarryCursorKey(env);
  const result = untrustedPendingResult();
  log.log(formatReviewComment(result, { headSha: env.HEAD_SHA }));
  process.exitCode = 0;
  return result;
}

export async function mainEvaluate(env = process.env, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? console;
  assertTrustedCursorInvocation(env);
  if (isUntrustedGithubEvent(env)) {
    throw new Error(UNTRUSTED_CURSOR_CREDENTIAL);
  }
  const providedComments = deps.comments ?? [];
  if (
    providedComments.length ||
    providedComments.some(
      (comment) =>
        commentIsNotProof(comment).forgedBot ||
        commentIsNotProof(comment).markerOnly,
    )
  ) {
    throw new Error('GitHub comments are not independent-review proof');
  }

  const prNumber = Number(env.PR_NUMBER);
  const repository = env.REPOSITORY ?? env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  const apiKey = env.CURSOR_API_KEY?.trim();
  const isolation = requiredIsolationIds(env);

  if (!repository || !prNumber) {
    throw new Error('Trusted evaluation requires PR_NUMBER and repository');
  }

  const resolved = await resolvePrHead({
    repository,
    prNumber,
    envSha: env.HEAD_SHA,
    token,
    fetchImpl,
  });
  const headSha = resolved.sha;
  const pr = resolved.pr;
  const prUrl =
    env.PR_URL ??
    pr?.html_url ??
    `https://github.com/${repository}/pull/${prNumber}`;

  if (isSyntheticMergeRef(headSha) || !isFullSha(headSha)) {
    throw new Error(
      'Refusing to evaluate a synthetic merge ref; exact PR head SHA is required',
    );
  }

  await scanPrWorkflows({ repository, headSha, token, fetchImpl });

  const ticket = ticketFromBranchOrBody(
    env.HEAD_REF ?? pr?.head?.ref,
    env.PR_BODY ?? pr?.body,
  );

  let result;
  let launch = { launched: false };
  let launchReceipt = null;
  try {
    if (env[LAUNCH_RECEIPT_ENV]?.trim()) {
      launchReceipt = untrustedEnvLaunchReceipt(env[LAUNCH_RECEIPT_ENV]);
    }
  } catch (error) {
    result = {
      passed: false,
      status: 'FAIL',
      failures: [error.message],
      evidence: null,
    };
  }

  if (!result && !apiKey) {
    result = missingKeyResult();
  } else if (!result) {
    result = await evaluateFromCursor({
      apiKey,
      prUrl,
      expectedHeadSha: headSha,
      ...isolation,
      launchReceipt,
      env,
      fetchImpl,
    });
    if (!result.passed && env.CURSOR_REVIEW_LAUNCH === 'true') {
      const catalog = await listModels({ apiKey, fetchImpl, env });
      launch = await maybeLaunchReview({
        apiKey,
        launch: true,
        model: resolveReviewModel(catalog),
        prUrl,
        repoUrl: `https://github.com/${repository}`,
        headSha,
        ticket,
        repository,
        prNumber,
        env,
        fetchImpl,
      });
      if (launch.receipt) {
        launchReceipt = launch.receipt;
        log.log(`LAUNCH_RECEIPT_JSON=${JSON.stringify(launch.receipt)}`);
        result = await evaluateFromCursor({
          apiKey,
          prUrl,
          expectedHeadSha: headSha,
          ...isolation,
          launchReceipt,
          env,
          fetchImpl,
        });
      }
      if (!result.passed) {
        result.status = result.status === 'FAIL' ? 'FAIL' : 'PENDING';
      }
    }
  }

  const comment = formatReviewComment(result, { headSha, launch });
  log.log(comment);
  try {
    await publishCheck({
      repository,
      token,
      headSha,
      result,
      fetchImpl,
      env,
    });
  } catch (error) {
    log.error(redactSecrets(error.message));
  }
  try {
    await postIssueComment(repository, prNumber, comment, {
      token,
      fetchImpl,
    });
  } catch (error) {
    log.error(redactSecrets(error.message));
  }

  if (!result.passed) {
    process.exitCode = 1;
  }
  return result;
}

export async function resolvePrNumberFromWorkflowRun(env, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const repository = env.REPOSITORY ?? env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  if (env.PR_NUMBER) return Number(env.PR_NUMBER);
  const sha = env.WORKFLOW_RUN_HEAD_SHA ?? env.HEAD_SHA;
  if (!sha || !token || !repository) return null;
  const pulls = await fetchCommitPulls(repository, sha, { token, fetchImpl });
  const open = (Array.isArray(pulls) ? pulls : []).find(
    (item) => item.state === 'open',
  );
  return open?.number ?? pulls?.[0]?.number ?? null;
}

export async function main(env = process.env, deps = {}) {
  const command = deps.command ?? process.argv[2];
  const event = githubEventName(env);
  if (
    command === 'untrusted' ||
    (!command && isUntrustedGithubEvent(env)) ||
    (!command && !cursorCredentialUseAllowed(env))
  ) {
    return mainUntrusted(env, deps);
  }
  if (command === 'evaluate' || cursorCredentialUseAllowed(env)) {
    if (
      !env.PR_NUMBER &&
      (event === 'workflow_run' || env.WORKFLOW_RUN_HEAD_SHA)
    ) {
      const number = await resolvePrNumberFromWorkflowRun(env, deps);
      if (number) env = { ...env, PR_NUMBER: String(number) };
    }
    return mainEvaluate(env, deps);
  }
  return mainUntrusted(env, deps);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(redactSecrets(error.message));
    process.exitCode = 1;
  });
}
