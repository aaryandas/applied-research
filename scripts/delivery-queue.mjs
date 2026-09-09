import {
  closeSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CI_GATE_NAME,
  HOSTED_SONAR_NAMES,
  HOSTED_SONAR_WORKFLOW_FILE,
  LANE_GUARD_NAME,
  LINEAR_GATE_NAME,
  PARTIAL_ACCEPTANCE,
  REVIEW_CHECK_NAME,
  TRUSTED_DEFAULT_BRANCH_ENV,
  TRUSTED_GITHUB_EVENTS,
  TRUSTED_REVIEW_JOB_NAME,
  TRUSTED_WORKFLOW_FILE,
  githubActionsAppOk,
  isFullSha,
  isSonarWorkflowPath,
  isSyntheticMergeRef,
  redactSecrets,
  ticketFromBranchOrBody,
  touchesApplication,
  explainLinearLifecycleGap,
} from './delivery-constants.mjs';
import {
  bindIndependentReviewDisplay,
  fetchCommitCheckRuns,
  fetchCompare,
  fetchDefaultBranchSha,
  fetchPullFiles,
  fetchPullRequest,
  fetchReviewThreads,
} from './delivery-github.mjs';
import {
  assertTrustedCursorInvocation,
  githubEventName,
  isUntrustedGithubEvent,
} from './delivery-trust.mjs';

export const MERGE_ACTIVATION_ENV = 'DELIVERY_MERGE_ACTIVATION';
export const DEPLOY_ACTIVATION_ENV = 'DELIVERY_DEPLOY_ACTIVATION';

export function mergeActivationEnabled(env = process.env) {
  return env[MERGE_ACTIVATION_ENV] === 'true';
}

export function deployActivationEnabled(env = process.env) {
  return env[DEPLOY_ACTIVATION_ENV] === 'true';
}

export function checkAtHead(checks, name, headSha) {
  return (checks ?? []).find(
    (check) => check.name === name && check.head_sha === headSha,
  );
}

export function actionsCheckOk(check) {
  return (
    check &&
    check.status === 'completed' &&
    check.conclusion === 'success' &&
    githubActionsAppOk(check)
  );
}

export function trustedReviewPublisherOk(
  check,
  { defaultBranch = 'main' } = {},
) {
  if (!actionsCheckOk(check)) return false;
  if (check.name !== REVIEW_CHECK_NAME) return false;
  const binding = check.independentReviewBinding;
  if (!binding?.ok) return false;
  if (Number(binding.customCheckId) !== Number(check.id)) return false;
  if (binding.workflowPath !== TRUSTED_WORKFLOW_FILE) return false;
  if (binding.jobName !== TRUSTED_REVIEW_JOB_NAME) return false;
  if (!TRUSTED_GITHUB_EVENTS.includes(binding.event)) return false;
  if (
    binding.event === 'workflow_dispatch' &&
    binding.headBranch &&
    binding.headBranch !== defaultBranch
  ) {
    return false;
  }
  if (!binding.githubRunId) return false;
  if (binding.passed !== true) return false;
  if (binding.headSha && binding.headSha !== check.head_sha) return false;
  return true;
}

export function nonemptyMp4(attachment) {
  if (!attachment) return false;
  const type = String(attachment.contentType ?? attachment.subtype ?? '');
  const url = String(attachment.url ?? '');
  const size = Number(attachment.size ?? attachment.filesize ?? 0);
  const title = String(attachment.title ?? '');
  const isMp4 =
    type.includes('mp4') ||
    url.toLowerCase().endsWith('.mp4') ||
    title.toLowerCase().endsWith('.mp4');
  return isMp4 && size > 0;
}

export function recordingCoversRevision(attachment, headSha) {
  const hay = [
    attachment.title,
    attachment.subtitle,
    attachment.body,
    attachment.url,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return hay.includes(headSha.toLowerCase());
}

export function evaluateAcceptance({
  ticket,
  files = [],
  attachments = [],
  headSha,
}) {
  if (!isFullSha(headSha)) {
    return {
      ok: false,
      reason: 'Acceptance evidence requires the exact 40-character head SHA',
    };
  }
  if (!touchesApplication(files)) {
    return {
      ok: true,
      reason:
        'Delivery-only change: desktop MP4 is not product acceptance evidence for this slice',
    };
  }
  const mp4s = attachments.filter(nonemptyMp4);
  if (!mp4s.length) {
    return {
      ok: false,
      reason:
        'Product change requires a nonempty MP4 from linear-demo-record (actual desktop recorder) attached before In Review',
    };
  }
  const atRevision = mp4s.filter((item) =>
    recordingCoversRevision(item, headSha),
  );
  if (!atRevision.length) {
    const partial = PARTIAL_ACCEPTANCE[ticket];
    return {
      ok: false,
      reason: partial
        ? `${partial} Preserve the existing file; attach a new exact-revision recording.`
        : 'Attached MP4 is not bound to this exact head SHA, so it cannot prove the current revision',
    };
  }
  return { ok: true, reason: 'Nonempty exact-revision MP4 attached' };
}

export function evaluateSonar({
  files = [],
  checks = [],
  headSha,
  mainSonar,
  phase = 'premerge',
} = {}) {
  if (files.some(isSonarWorkflowPath)) {
    return {
      ok: false,
      phase,
      reason:
        'This orchestration must not own Sonar workflow edits; hosted Sonar stays on cursor/enable-hosted-sonar-main-acd0',
    };
  }
  if (phase === 'postmerge') {
    const trustedMain =
      mainSonar?.sha === headSha &&
      mainSonar?.conclusion === 'success' &&
      githubActionsAppOk(mainSonar) &&
      mainSonar.publisher?.workflowPath === HOSTED_SONAR_WORKFLOW_FILE;
    if (trustedMain) {
      return {
        ok: true,
        phase,
        reason: 'Hosted main Sonar passed this exact SHA',
      };
    }
    const named = HOSTED_SONAR_NAMES.map((name) =>
      checkAtHead(checks, name, headSha),
    ).find(Boolean);
    if (
      named &&
      actionsCheckOk(named) &&
      named.publisher?.workflowPath === HOSTED_SONAR_WORKFLOW_FILE
    ) {
      return {
        ok: true,
        phase,
        reason: 'Hosted main Sonar passed this exact SHA',
      };
    }
    return {
      ok: false,
      phase,
      reason:
        'Post-merge hosted Sonar is required at this exact main SHA; PR-head checks and fabricated provenance are not that analysis',
    };
  }
  if (!touchesApplication(files)) {
    return {
      ok: true,
      phase: 'premerge',
      reason:
        'Delivery-only change: hosted Sonar remains required on the resulting main SHA after merge',
    };
  }
  return {
    ok: true,
    phase: 'premerge',
    reason:
      'Pre-merge: hosted Sonar is main-only and PR code receives no SONAR_TOKEN. Eligibility requires independent source review at this head; exact main analysis is required after merge.',
  };
}

export function assessCandidate({
  pr,
  checks,
  linear,
  review,
  acceptance,
  sonar,
  liveMainSha,
  activation = false,
  eventName,
} = {}) {
  const refuse = (reason, kind = 'gate') => ({
    eligible: false,
    kind,
    reason,
    merge: false,
  });

  if (eventName === 'merge_group') {
    return refuse(
      'Native merge-group / merge-queue refs are not reviewed-head proof',
      'infra',
    );
  }
  if (!pr || pr.state !== 'OPEN' || pr.isDraft || pr.baseRefName !== 'main') {
    return refuse('PR must be open, ready, and targeting main');
  }
  if (pr.isCrossRepository) {
    return refuse('Fork PRs cannot consume repository review secrets or merge');
  }
  if (!isFullSha(pr.headRefOid) || isSyntheticMergeRef(pr.headRefOid)) {
    return refuse(
      'Missing exact PR head SHA; synthetic merge refs are rejected',
      'infra',
    );
  }
  if (!isFullSha(liveMainSha)) {
    return refuse('Live main SHA is unavailable', 'infra');
  }
  if (pr.mainSha && pr.mainSha !== liveMainSha) {
    return refuse(
      `Main moved from ${pr.mainSha} to ${liveMainSha}; rebase and re-gather evidence`,
      'infra',
    );
  }
  if (pr.upToDate !== true) {
    return refuse(
      'Current main is not an ancestor of the PR head; rebase required',
      'infra',
    );
  }
  const ticket = ticketFromBranchOrBody(pr.headRefName, pr.body);
  if (!ticket) return refuse('Missing Linear ticket identity');
  if (linear?.identifier && linear.identifier !== ticket) {
    return refuse(
      `Linear identity ${linear.identifier} does not match ${ticket}`,
    );
  }
  if (linear?.state !== 'In Review') {
    return refuse(
      explainLinearLifecycleGap({ pr, linear, ticket }) ??
        `Linear ${ticket} must be In Review (current: ${linear?.state ?? 'unknown'})`,
    );
  }
  if (pr.reviewThreads?.nodes?.some((thread) => !thread.isResolved)) {
    return refuse('Unresolved review conversations remain');
  }

  const required = [
    CI_GATE_NAME,
    LANE_GUARD_NAME,
    LINEAR_GATE_NAME,
    REVIEW_CHECK_NAME,
  ];
  for (const name of required) {
    if (name === REVIEW_CHECK_NAME) {
      const proven = (checks ?? []).find(
        (entry) =>
          entry.name === name &&
          entry.head_sha === pr.headRefOid &&
          trustedReviewPublisherOk(entry),
      );
      if (!proven) {
        if (!checkAtHead(checks, name, pr.headRefOid)) {
          return refuse(`Missing current-head check: ${name}`, 'infra');
        }
        return refuse(
          'Independent review check is missing a trusted-run Actions artifact receipt bound to this custom check',
        );
      }
      continue;
    }
    const check = checkAtHead(checks, name, pr.headRefOid);
    if (!check) return refuse(`Missing current-head check: ${name}`, 'infra');
    if (check.status !== 'completed') {
      return refuse(`Pending check: ${name}`, 'infra');
    }
    if (check.conclusion !== 'success') {
      return refuse(`Failed check: ${name} (${check.conclusion})`);
    }
    if (!githubActionsAppOk(check)) {
      return refuse(`Untrusted app for ${name}`);
    }
  }

  if (!review?.passed || review.evidence?.headSha !== pr.headRefOid) {
    return refuse(
      'Independent Cursor Cloud Grok 4.6 Extra High PASS is missing for this exact head',
    );
  }
  if (!acceptance?.ok) {
    return refuse(
      acceptance?.reason ?? 'Cloud acceptance evidence is incomplete',
    );
  }
  if (!sonar?.ok) {
    return refuse(sonar?.reason ?? 'Hosted Sonar evidence is missing');
  }
  if (pr.files?.some(isSonarWorkflowPath)) {
    return refuse(
      'Candidate edits the hosted Sonar workflow owned by another branch',
    );
  }

  if (!activation) {
    return {
      eligible: true,
      kind: 'ready',
      reason:
        'All exact-head gates passed; merge activation is off (DELIVERY_MERGE_ACTIVATION)',
      merge: false,
      ticket,
      sha: pr.headRefOid,
    };
  }

  return {
    eligible: true,
    kind: 'ready',
    reason: 'All exact-head gates passed and merge activation is on',
    merge: true,
    ticket,
    sha: pr.headRefOid,
  };
}

export function acquireQueueLock(directory, { open = openSync } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, 'queue.lock');
  try {
    const fd = open(lockPath, 'wx', 0o600);
    writeFileSync(
      fd,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
    );
    return { ok: true, fd, lockPath };
  } catch (error) {
    if (error.code === 'EEXIST') {
      return {
        ok: false,
        lockPath,
        reason:
          'Local same-filesystem queue.lock is held; this is not a cross-runner lease',
      };
    }
    throw error;
  }
}

export function releaseQueueLock(
  lock,
  { close = closeSync, unlink = unlinkSync } = {},
) {
  if (lock?.fd != null) close(lock.fd);
  if (lock?.lockPath) {
    try {
      unlink(lock.lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export function runQueueTick({
  candidates,
  load,
  lockDir,
  activation = false,
  eventName,
  applyMerge,
} = {}) {
  const lock = acquireQueueLock(lockDir);
  if (!lock.ok) {
    return { kind: 'busy', reason: lock.reason, lockPath: lock.lockPath };
  }
  try {
    const blocked = [];
    for (const candidate of candidates) {
      const snapshot = load(candidate);
      if (snapshot.liveMainSha !== snapshot.pr?.mainSha && snapshot.pr) {
        snapshot.pr = { ...snapshot.pr };
      }
      const decision = assessCandidate({ ...snapshot, activation, eventName });
      if (!decision.eligible) {
        blocked.push({ number: candidate.number, ...decision });
        continue;
      }
      if (!decision.merge || !applyMerge) {
        return {
          kind: 'ready',
          action: activation ? 'merge-held-for-activation' : 'evaluate-only',
          number: candidate.number,
          sha: decision.sha,
          blocked,
          decision,
        };
      }
      const fresh = load(candidate);
      if (fresh.pr.headRefOid !== snapshot.pr.headRefOid) {
        return {
          kind: 'infra',
          reason: 'PR head changed during eligibility; evidence is stale',
          number: candidate.number,
        };
      }
      if (fresh.liveMainSha !== snapshot.liveMainSha) {
        return {
          kind: 'infra',
          reason: 'main changed during eligibility; recheck required',
          number: candidate.number,
        };
      }
      const second = assessCandidate({ ...fresh, activation, eventName });
      if (!second.eligible || !second.merge) {
        return {
          kind: 'infra',
          reason: 'Candidate stopped being eligible during the merge recheck',
          number: candidate.number,
        };
      }
      const merged = applyMerge(fresh.pr);
      return { kind: 'merged', receipt: merged, blocked };
    }
    return { kind: 'idle', blocked };
  } finally {
    releaseQueueLock(lock);
  }
}

export function bindDeployment({
  mergedMainSha,
  liveMainSha,
  ci,
  sonar,
  activation = false,
}) {
  if (!isFullSha(mergedMainSha) || isSyntheticMergeRef(mergedMainSha)) {
    return {
      ok: false,
      halt: true,
      reason: 'Deployment requires the exact resulting main SHA',
    };
  }
  if (liveMainSha !== mergedMainSha) {
    return {
      ok: false,
      halt: true,
      reason: `main is ${liveMainSha}, not merged SHA ${mergedMainSha}; halt for regression`,
    };
  }
  if (ci !== 'success') {
    return {
      ok: false,
      halt: true,
      reason: `Main CI at ${mergedMainSha} is ${ci}; deployment halted`,
    };
  }
  if (sonar !== 'success') {
    return {
      ok: false,
      halt: true,
      reason: `Post-merge hosted Sonar at ${mergedMainSha} is ${sonar ?? 'missing'}; deployment halted`,
    };
  }
  if (!activation) {
    return {
      ok: true,
      halt: false,
      dispatched: false,
      reason:
        'Exact main SHA is healthy; deploy activation is off (DELIVERY_DEPLOY_ACTIVATION)',
      sha: mergedMainSha,
    };
  }
  return {
    ok: true,
    halt: false,
    dispatched: true,
    reason: 'Release workflow may be requested for this exact main SHA only',
    sha: mergedMainSha,
  };
}

export function captureRetrospective({
  sha,
  failure,
  cause,
  processFix,
  at = new Date().toISOString(),
} = {}) {
  if (!failure || !cause || !processFix) {
    throw new Error(
      'Retrospective requires actual failure, cause, and bounded process fix',
    );
  }
  return {
    sha: sha ?? null,
    at,
    failure,
    cause,
    processFix,
    reviewImprovements: [
      'Re-run independent Cursor Cloud review at the exact head before the next merge tick',
      'Keep merge and deploy activation off until the process fix is itself reviewed',
    ],
  };
}

export function untrustedQueueNotice(env = process.env) {
  return {
    kind: 'untrusted-notice',
    live: false,
    activation: mergeActivationEnabled(env),
    reason:
      'pull_request jobs do not load GitHub/Linear/main/checks and must not claim live eligibility. Cross-runner serialization is the Actions concurrency group delivery-queue-live on default-branch workflow_dispatch. Local queue.lock is same-filesystem only.',
  };
}

export async function fetchLinearIssue(
  identifier,
  { apiKey, fetchImpl = fetch },
) {
  if (!apiKey) {
    throw new Error('LINEAR_API_KEY is required for trusted queue evaluation');
  }
  const match = String(identifier).match(/^AR-(\d+)$/);
  if (!match) throw new Error(`Linear identifier ${identifier} is invalid`);
  const response = await fetchImpl('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: `query($n: Float!) { issues(filter: { number: { eq: $n }, team: { key: { eq: "AR" } } }) { nodes { id identifier state { name } attachments { nodes { url title subtitle body contentType size filesize } } } } }`,
      variables: { n: Number(match[1]) },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors) {
    throw new Error(redactSecrets(`Linear lookup for ${identifier} failed`));
  }
  const issue = payload?.data?.issues?.nodes?.[0];
  if (!issue) throw new Error(`${identifier} does not exist in team AR`);
  return {
    identifier: issue.identifier,
    state: issue.state?.name,
    attachments: issue.attachments?.nodes ?? [],
  };
}

export function reviewFromChecks(
  checks,
  headSha,
  { defaultBranch = 'main' } = {},
) {
  const check = (checks ?? []).find(
    (entry) =>
      entry.head_sha === headSha &&
      trustedReviewPublisherOk(entry, { defaultBranch }),
  );
  const passed = Boolean(check);
  return {
    passed,
    evidence: passed
      ? {
          headSha: check.head_sha,
          checkId: check.id,
          customCheckId: check.independentReviewBinding.customCheckId,
          githubRunId: check.independentReviewBinding.githubRunId,
          workflowPath: check.independentReviewBinding.workflowPath,
          jobName: check.independentReviewBinding.jobName,
          nativeJobCheckId: check.independentReviewBinding.nativeJobCheckId,
          runHeadSha: check.independentReviewBinding.runHeadSha,
        }
      : null,
  };
}

export async function loadLiveCandidate(
  env = process.env,
  { fetchImpl = fetch, extractZipFile } = {},
) {
  if (env[TRUSTED_DEFAULT_BRANCH_ENV] !== 'true') {
    throw new Error(
      'Live queue evaluation requires TRUSTED_DEFAULT_BRANCH=true on default-branch workflow_dispatch',
    );
  }
  if (isUntrustedGithubEvent(env)) {
    throw new Error('Live queue evaluation cannot run on pull_request events');
  }
  const repository = env.REPOSITORY ?? env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  const prNumber = Number(env.PR_NUMBER);
  const defaultBranch = env.GITHUB_DEFAULT_BRANCH ?? 'main';
  if (!repository || !token || !prNumber) {
    throw new Error(
      'Trusted queue evaluation requires repository, GITHUB_TOKEN, and PR_NUMBER',
    );
  }
  const github = { token, fetchImpl };
  const prPayload = await fetchPullRequest(repository, prNumber, github);
  const headSha = prPayload.head?.sha;
  const liveMainSha = await fetchDefaultBranchSha(
    repository,
    defaultBranch,
    github,
  );
  const compare = await fetchCompare(
    repository,
    defaultBranch,
    headSha,
    github,
  );
  const files = await fetchPullFiles(repository, prNumber, github);
  const rawChecks = await fetchCommitCheckRuns(repository, headSha, github);
  const checks = [];
  for (const check of rawChecks) {
    if (check.name === REVIEW_CHECK_NAME) {
      checks.push(
        await bindIndependentReviewDisplay(check, {
          repository,
          prNumber,
          headSha,
          defaultBranch,
          ...github,
          extractZipFile,
        }),
      );
    } else {
      checks.push(check);
    }
  }
  const reviewThreads = await fetchReviewThreads(repository, prNumber, github);
  const ticket = ticketFromBranchOrBody(prPayload.head?.ref, prPayload.body);
  const linear = ticket
    ? await fetchLinearIssue(ticket, {
        apiKey: env.LINEAR_API_KEY,
        fetchImpl,
      })
    : null;
  const pr = {
    state:
      prPayload.state === 'open'
        ? 'OPEN'
        : String(prPayload.state).toUpperCase(),
    isDraft: Boolean(prPayload.draft),
    isCrossRepository:
      prPayload.head?.repo?.full_name !== prPayload.base?.repo?.full_name,
    baseRefName: prPayload.base?.ref,
    headRefName: prPayload.head?.ref,
    headRefOid: headSha,
    mainSha: liveMainSha,
    upToDate: compare?.status === 'ahead' || compare?.status === 'identical',
    body: prPayload.body,
    files,
    reviewThreads,
  };
  const acceptance = evaluateAcceptance({
    ticket,
    files,
    attachments: linear?.attachments ?? [],
    headSha,
  });
  const sonar = evaluateSonar({
    files,
    checks,
    headSha,
    mainSonar: null,
    phase: 'premerge',
  });
  return {
    pr,
    checks,
    linear,
    review: reviewFromChecks(checks, headSha),
    acceptance,
    sonar,
    liveMainSha,
  };
}

export async function trustedEvaluate(env = process.env, deps = {}) {
  const log = deps.log ?? console;
  if (env[TRUSTED_DEFAULT_BRANCH_ENV] !== 'true') {
    throw new Error(
      'Trusted queue evaluate refuses to run without TRUSTED_DEFAULT_BRANCH=true',
    );
  }
  assertTrustedCursorInvocation({
    ...env,
    [TRUSTED_DEFAULT_BRANCH_ENV]: 'true',
    GITHUB_EVENT_NAME:
      env.GITHUB_EVENT_NAME ?? env.EVENT_NAME ?? 'workflow_dispatch',
    GITHUB_REF:
      env.GITHUB_REF ?? `refs/heads/${env.GITHUB_DEFAULT_BRANCH ?? 'main'}`,
  });
  const eventName = githubEventName(env);
  if (eventName === 'merge_group') {
    log.error('merge_group is not a reviewed-head proof');
    process.exitCode = 1;
    return { kind: 'infra' };
  }
  const snapshot = await loadLiveCandidate(env, deps);
  const activation =
    mergeActivationEnabled(env) && eventName === 'workflow_dispatch';
  const decision = assessCandidate({
    ...snapshot,
    activation,
    eventName,
  });
  const result = {
    kind: decision.eligible ? 'ready' : 'gate',
    live: true,
    serializer: 'github-actions-concurrency:delivery-queue-live',
    action: 'evaluate-only',
    merge: false,
    ...decision,
    review: snapshot.review,
  };
  log.log(JSON.stringify(result));
  if (!decision.eligible) process.exitCode = 1;
  return result;
}

export async function main(env = process.env, deps = {}) {
  const log = deps.log ?? console;
  const command = deps.command ?? process.argv[2];
  const eventName = githubEventName(env);
  if (eventName === 'merge_group') {
    log.error('merge_group is not a reviewed-head proof');
    process.exitCode = 1;
    return { kind: 'infra' };
  }
  if (
    command === 'untrusted' ||
    (!command && isUntrustedGithubEvent(env)) ||
    env[TRUSTED_DEFAULT_BRANCH_ENV] !== 'true'
  ) {
    const notice = untrustedQueueNotice(env);
    log.log(JSON.stringify(notice));
    return notice;
  }
  if (command === 'evaluate' || env[TRUSTED_DEFAULT_BRANCH_ENV] === 'true') {
    return trustedEvaluate(env, deps);
  }
  const notice = untrustedQueueNotice(env);
  log.log(JSON.stringify(notice));
  return notice;
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
