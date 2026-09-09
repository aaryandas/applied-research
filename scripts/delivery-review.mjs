import { pathToFileURL } from 'node:url';
import {
  AGENT_ID,
  CURSOR_AGENT_ORIGIN,
  FORBIDDEN_REVIEW_ROLES,
  INDEPENDENT_REVIEWER,
  MISSING_CURSOR_API_KEY,
  REQUIRED_REVIEW_DISPLAY,
  RUN_ID,
  isFullSha,
  isSyntheticMergeRef,
  redactSecrets,
  ticketFromBranchOrBody,
} from './delivery-constants.mjs';
import {
  createCloudReviewAgent,
  getAgent,
  getRun,
  listAgentsForPr,
  listArtifacts,
  listModels,
} from './delivery-cursor-api.mjs';

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

PASS on an axis requires no unresolved material findings on that axis.`;

export function grok46ExtraHighHaystack(model) {
  return [
    model?.id,
    model?.runtime,
    model?.originalModelName,
    model?.displayName,
    model?.picker,
    ...(model?.aliases ?? []),
    ...(model?.variants ?? []).map((variant) => variant.displayName),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function isGrok46ExtraHigh(model) {
  const hay = grok46ExtraHighHaystack(model);
  if (!hay) return false;
  if (/fable|claude-fable|composer-2|local runtime|headless/.test(hay)) {
    return false;
  }
  return /grok[- _]?4\.6/.test(hay) && /xhigh|extra[- ]?high/.test(hay);
}

export function resolveReviewModel(catalog) {
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  for (const item of items) {
    for (const variant of item.variants ?? [
      { params: [], displayName: item.displayName },
    ]) {
      const candidate = {
        ...item,
        displayName: variant.displayName ?? item.displayName,
        extraHighParams: variant.params ?? [],
      };
      if (isGrok46ExtraHigh(candidate)) {
        return {
          id: item.id,
          displayName: candidate.displayName,
          aliases: item.aliases ?? [],
          extraHighParams: candidate.extraHighParams,
        };
      }
    }
    if (isGrok46ExtraHigh(item)) {
      return {
        id: item.id,
        displayName: item.displayName ?? item.id,
        aliases: item.aliases ?? [],
        extraHighParams: [],
      };
    }
  }
  return null;
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

function modelFromPlatform(agent, run, verdict) {
  return {
    id:
      run?.model?.id ??
      agent?.model?.id ??
      run?.originalModelName ??
      agent?.originalModelName ??
      verdict?.model?.id,
    displayName:
      run?.model?.displayName ??
      agent?.model?.displayName ??
      verdict?.model?.displayName,
    runtime:
      run?.originalModelName ??
      agent?.originalModelName ??
      run?.model?.id ??
      agent?.model?.id,
    picker: agent?.model?.id ?? run?.model?.id,
    aliases: [...(run?.model?.aliases ?? []), ...(agent?.model?.aliases ?? [])],
    params: run?.model?.params ?? agent?.model?.params ?? [],
  };
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
} = {}) {
  const failures = [];
  const fail = (reason) => failures.push(reason);

  if (isSyntheticMergeRef(expectedHeadSha) || !isFullSha(expectedHeadSha)) {
    fail(
      'Reviewed head must be the exact 40-character PR commit SHA; merge refs are not proof',
    );
  }
  if (!agent || !AGENT_ID.test(agent.id ?? '')) {
    fail('Authenticated Cursor agent id (bc- UUID) is required');
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
  if (agent?.env?.type && agent.env.type !== 'cloud') {
    fail(`Independent review must run on Cursor Cloud, not ${agent.env.type}`);
  }
  if (prUrl && agent?.repos?.length) {
    const matchesPr = agent.repos.some((repo) => repo.prUrl === prUrl);
    if (!matchesPr) fail('Cursor agent is not bound to this pull request URL');
  }

  const required = resolveReviewModel(catalog);
  if (!required) {
    fail(
      `${REQUIRED_REVIEW_DISPLAY} is not present in GET /v1/models for this API key`,
    );
  }

  const verdict = parseReviewVerdict(run?.result);
  if (!verdict) {
    fail(
      'Authenticated run result does not contain a parseable independent-review JSON verdict',
    );
  }

  const role = verdict?.role ?? agent?.metadata?.role;
  if (role !== INDEPENDENT_REVIEWER) {
    fail(`Role must be ${INDEPENDENT_REVIEWER}; received ${role ?? 'missing'}`);
  }
  if (FORBIDDEN_REVIEW_ROLES.includes(role)) {
    fail(`Role ${role} cannot supply independent review`);
  }
  const name = String(agent?.name ?? '').toLowerCase();
  if (
    /\b(implement|verif|record|demo)\b/.test(name) &&
    !/independent review/.test(name)
  ) {
    fail('Agent display name indicates implementer, verifier, or recorder');
  }

  const platformModel = modelFromPlatform(agent, run, verdict);
  if (!isGrok46ExtraHigh(platformModel)) {
    fail(
      `Model picker/runtime evidence is not ${REQUIRED_REVIEW_DISPLAY} (saw ${platformModel.runtime ?? platformModel.id ?? 'missing'})`,
    );
  }
  if (
    required &&
    platformModel.id &&
    platformModel.id !== required.id &&
    !(required.aliases ?? []).includes(platformModel.id)
  ) {
    fail(
      `Runtime model id ${platformModel.id} does not match catalog id ${required.id}`,
    );
  }

  const claimedSha = verdict?.headSha ?? agent?.repos?.[0]?.startingRef;
  if (claimedSha !== expectedHeadSha) {
    fail(
      `Review SHA ${claimedSha ?? 'missing'} does not match current PR head ${expectedHeadSha}`,
    );
  }
  const startingRef = agent?.repos?.[0]?.startingRef;
  if (isFullSha(startingRef) && startingRef !== expectedHeadSha) {
    fail('Agent startingRef SHA is stale relative to the current PR head');
  }

  if (run?.status && run.status !== 'FINISHED') {
    fail(`Cursor run is ${run.status}, not FINISHED`);
  }
  if (run?.id && !RUN_ID.test(run.id) && !String(run.id).startsWith('run-')) {
    fail('Run identity is not a documented run id');
  }

  if (verdict?.standards !== 'PASS' || verdict?.spec !== 'PASS') {
    fail(
      `Standards/spec verdict is ${verdict?.standards ?? 'missing'}/${verdict?.spec ?? 'missing'}, not PASS/PASS`,
    );
  }
  const open = unresolvedMaterial(verdict?.findings ?? []);
  if (typeof open[0] === 'string') {
    fail(open[0]);
  } else if (open.length) {
    fail(
      `${open.length} unresolved material finding(s); independent review cannot PASS`,
    );
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
            id: platformModel.id,
            displayName: platformModel.displayName ?? required?.displayName,
            runtime: platformModel.runtime,
            picker: platformModel.picker,
          },
          standards: verdict.standards,
          spec: verdict.spec,
          findings: verdict.findings,
          resolutions: verdict.resolutions ?? [],
        }
      : null,
  };
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

export function missingKeyResult() {
  return {
    passed: false,
    status: 'PENDING',
    failures: [MISSING_CURSOR_API_KEY],
    setupDependency: 'repository secret CURSOR_API_KEY',
    evidence: null,
  };
}

export function buildLaunchBody({ model, prUrl, repoUrl, headSha, ticket }) {
  return {
    name: `Independent review ${ticket ?? ''} ${headSha.slice(0, 7)}`.trim(),
    prompt: {
      text: `${REVIEW_PROMPT}\n\nPR: ${prUrl}\nExact head SHA: ${headSha}\nTicket: ${ticket ?? 'unknown'}`,
    },
    model: {
      id: model.id,
      ...(model.extraHighParams?.length
        ? { params: model.extraHighParams }
        : {}),
    },
    repos: [
      {
        url: repoUrl,
        prUrl,
      },
    ],
    workOnCurrentBranch: false,
    autoCreatePR: false,
    skipReviewerRequest: true,
  };
}

async function githubJson(path, { token, method = 'GET', body, fetchImpl }) {
  const response = await fetchImpl(`https://api.github.com/${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      redactSecrets(`GitHub ${method} ${path} returned ${response.status}`),
    );
  }
  return payload;
}

export async function resolvePrHead({
  repository,
  prNumber,
  envSha,
  eventName,
  token,
  fetchImpl = fetch,
}) {
  if (isSyntheticMergeRef(envSha)) {
    envSha = null;
  }
  if (!token || !prNumber) {
    if (isFullSha(envSha) && eventName === 'pull_request') {
      return { sha: envSha, pr: null };
    }
    throw new Error('Cannot resolve exact PR head SHA');
  }
  const pr = await githubJson(`repos/${repository}/pulls/${prNumber}`, {
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
  fetchImpl = fetch,
}) {
  const catalog = await listModels({ apiKey, fetchImpl });
  const listed = await listAgentsForPr(prUrl, { apiKey, fetchImpl });
  const reports = [];
  for (const item of listed) {
    let agent;
    let run;
    let artifacts = { items: [] };
    try {
      agent = await getAgent(item.id, { apiKey, fetchImpl });
      const runId = agent.latestRunId ?? item.latestRunId;
      if (runId) run = await getRun(agent.id, runId, { apiKey, fetchImpl });
      try {
        artifacts = await listArtifacts(agent.id, { apiKey, fetchImpl });
      } catch {
        /* Artifact listing is optional; agent URL still required for PASS. */
      }
    } catch (error) {
      reports.push({
        agentId: item.id,
        error: redactSecrets(error.message),
      });
      continue;
    }
    const result = evaluateIndependentReview({
      expectedHeadSha,
      prUrl,
      catalog,
      agent,
      run,
      artifacts,
      implementerAgentId,
      verifierAgentId,
      recorderAgentId,
    });
    reports.push({ agentId: agent.id, ...result });
    if (result.passed) return result;
  }
  const failures = reports.flatMap((report) => report.failures ?? []);
  return {
    passed: false,
    status: listed.length ? 'FAIL' : 'PENDING',
    failures: failures.length
      ? failures
      : [
          'No authentic Cursor Cloud independent-review agent exists for this PR URL and exact head SHA',
        ],
    reports,
    catalogHasRequiredModel: Boolean(resolveReviewModel(catalog)),
    evidence: null,
  };
}

export async function maybeLaunchReview({
  apiKey,
  launch,
  model,
  prUrl,
  repoUrl,
  headSha,
  ticket,
  fetchImpl = fetch,
}) {
  if (!launch) {
    return {
      launched: false,
      reason:
        'Launch is opt-in via repository variable CURSOR_REVIEW_LAUNCH=true after the API key exists',
    };
  }
  if (!model) {
    return {
      launched: false,
      reason: `${REQUIRED_REVIEW_DISPLAY} is not in GET /v1/models`,
    };
  }
  const created = await createCloudReviewAgent(
    buildLaunchBody({ model, prUrl, repoUrl, headSha, ticket }),
    { apiKey, fetchImpl },
  );
  return {
    launched: true,
    agentId: created?.agent?.id,
    runId: created?.run?.id,
    agentUrl: created?.agent?.url,
  };
}

async function postPrComment({ repository, prNumber, token, body, fetchImpl }) {
  if (!token || !prNumber) return;
  await githubJson(`repos/${repository}/issues/${prNumber}/comments`, {
    token,
    method: 'POST',
    body: { body },
    fetchImpl,
  });
}

export function formatReviewComment(result, { headSha, launch } = {}) {
  const lines = [
    `Independent Cursor Cloud review of \`${headSha}\`: **${result.status}**`,
    '',
    `Required model/role: ${REQUIRED_REVIEW_DISPLAY} / ${INDEPENDENT_REVIEWER}.`,
    'Proof is authenticated `GET https://api.cursor.com/v1/agents` + run payload, not this comment.',
  ];
  if (result.evidence) {
    lines.push(
      '',
      `- Agent: ${result.evidence.agentUrl}`,
      `- Run: \`${result.evidence.runId}\``,
      `- Runtime model: \`${result.evidence.model.runtime ?? result.evidence.model.id}\``,
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

export async function main(env = process.env, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? console;
  const prNumber = Number(env.PR_NUMBER);
  const repository = env.REPOSITORY ?? env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  const apiKey = env.CURSOR_API_KEY?.trim();
  const prUrl =
    env.PR_URL ??
    (repository && prNumber
      ? `https://github.com/${repository}/pull/${prNumber}`
      : null);

  let headSha = env.HEAD_SHA;
  let pr = null;
  if (token && prNumber) {
    const resolved = await resolvePrHead({
      repository,
      prNumber,
      envSha: env.HEAD_SHA,
      eventName: env.EVENT_NAME ?? env.GITHUB_EVENT_NAME,
      token,
      fetchImpl,
    });
    headSha = resolved.sha;
    pr = resolved.pr;
  }
  if (isSyntheticMergeRef(headSha) || !isFullSha(headSha)) {
    throw new Error(
      'Refusing to evaluate a synthetic merge ref; exact PR head SHA is required',
    );
  }

  const ticket = ticketFromBranchOrBody(
    env.HEAD_REF ?? pr?.head?.ref,
    env.PR_BODY ?? pr?.body,
  );

  let result;
  let launch = { launched: false };
  if (!apiKey) {
    result = missingKeyResult();
  } else {
    result = await evaluateFromCursor({
      apiKey,
      prUrl,
      expectedHeadSha: headSha,
      implementerAgentId: env.IMPLEMENTER_AGENT_ID,
      verifierAgentId: env.VERIFIER_AGENT_ID,
      recorderAgentId: env.RECORDER_AGENT_ID,
      fetchImpl,
    });
    if (!result.passed && env.CURSOR_REVIEW_LAUNCH === 'true') {
      const catalog = await listModels({ apiKey, fetchImpl });
      launch = await maybeLaunchReview({
        apiKey,
        launch: true,
        model: resolveReviewModel(catalog),
        prUrl,
        repoUrl: `https://github.com/${repository}`,
        headSha,
        ticket,
        fetchImpl,
      });
      result.status = result.status === 'FAIL' ? 'FAIL' : 'PENDING';
    }
  }

  const comment = formatReviewComment(result, { headSha, launch });
  log.log(comment);
  try {
    await postPrComment({
      repository,
      prNumber,
      token,
      body: comment,
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(redactSecrets(error.message));
    process.exitCode = 1;
  });
}
