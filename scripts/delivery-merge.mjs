import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REPOSITORY = 'aaryandas/applied-research';
export const REQUIRED_CHECKS = [
  'checks / CI gate',
  'Workflow gate rules',
  'Fable review',
  'Linear gate',
  'Lane guard',
  'Cursor Automation: Bugbot PR Review',
];
const SHA = /^[a-f0-9]{40}$/;
const STATUS_GATES = ['Fable review', 'Linear gate'];

export function normalizeChecks(sha, checkRuns, statuses) {
  const combined = checkRuns.filter(
    (check) => !STATUS_GATES.includes(check.name),
  );
  const latest = new Map();
  for (const status of statuses) {
    if (
      !latest.has(status.context) ||
      status.id > latest.get(status.context).id
    )
      latest.set(status.context, status);
  }
  for (const status of latest.values()) {
    if (
      STATUS_GATES.includes(status.context) &&
      status.creator?.login !== 'github-actions[bot]'
    )
      continue;
    combined.push({
      name: status.context,
      head_sha: sha,
      status: status.state === 'pending' ? 'in_progress' : 'completed',
      conclusion: status.state === 'pending' ? null : status.state,
    });
  }
  return combined;
}

export function sonarPassed(receipt, sha) {
  return (
    receipt?.sha === sha &&
    receipt.outcome === 'passed' &&
    receipt.qualityGate === 'OK' &&
    receipt.scanner === 'sonarqube-native' &&
    typeof receipt.analysisId === 'string' &&
    receipt.analysisId.trim().length > 0
  );
}

export function assessMerge(pr, checks, sonarReceipt) {
  const refuse = (reason, kind = 'gate') => ({ eligible: false, kind, reason });
  if (
    pr.state !== 'OPEN' ||
    pr.isDraft ||
    pr.isCrossRepository ||
    pr.baseRefName !== 'main'
  )
    return refuse('PR must be open, ready, same-repository and targeting main');
  if (
    !pr.author ||
    pr.author.is_bot ||
    /bot\]|^dependabot$/i.test(pr.author.login)
  )
    return refuse('Human-authored product PR required');
  if (
    !/\bar-\d+\b/i.test(pr.headRefName) &&
    !/^Linear:\s*AR-\d+\s*$/im.test(pr.body ?? '')
  )
    return refuse('Missing linked AR ticket identity');
  if (!SHA.test(pr.headRefOid))
    return refuse('Missing exact head SHA', 'infra');
  if (!pr.reviewThreads || pr.reviewThreads.pageInfo.hasNextPage)
    return refuse('Review-thread inventory incomplete', 'infra');
  if (
    pr.reviewDecision === 'CHANGES_REQUESTED' ||
    pr.reviewThreads.nodes.some((thread) => !thread.isResolved)
  )
    return refuse('Requested changes or unresolved review threads');
  if (pr.mergeable !== 'MERGEABLE' || pr.mergeStateStatus !== 'CLEAN')
    return refuse(
      `Branch is not clean and up to date: ${pr.mergeable}/${pr.mergeStateStatus}`,
      'infra',
    );
  if (pr.upToDate !== true)
    return refuse(
      'Current main is not an ancestor of the PR head; rebase required',
      'infra',
    );
  for (const name of REQUIRED_CHECKS) {
    const check = checks.find(
      (item) => item.name === name && item.head_sha === pr.headRefOid,
    );
    if (!check) return refuse(`Missing current-head check: ${name}`, 'infra');
    if (check.status !== 'completed')
      return refuse(`Pending check: ${name}`, 'infra');
    if (check.conclusion !== 'success')
      return refuse(`Failed check: ${name} (${check.conclusion})`);
  }
  if (!Array.isArray(pr.files))
    return refuse('Changed-file inventory incomplete', 'infra');
  if (
    pr.files.some((file) => file.startsWith('src/')) &&
    !sonarPassed(sonarReceipt, pr.headRefOid)
  )
    return {
      ...refuse(
        'A successful trusted local Sonar scan is required for this exact source revision',
      ),
      action: 'needs-sonar',
    };
  return {
    eligible: true,
    kind: 'ready',
    reason: 'All exact-head gates passed',
  };
}

export function releaseReady(sha, checks) {
  return (
    SHA.test(sha) &&
    checks.some(
      (check) =>
        check.head_sha === sha &&
        check.name === 'checks / CI gate' &&
        check.status === 'completed' &&
        check.conclusion === 'success',
    )
  );
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}
function api(path) {
  return JSON.parse(gh(['api', `repos/${REPOSITORY}/${path}`]));
}
function currentChecks(sha) {
  const pages = JSON.parse(
    gh([
      'api',
      '--paginate',
      '--slurp',
      `repos/${REPOSITORY}/commits/${sha}/check-runs?filter=latest&per_page=100`,
    ]),
  );
  const statusPages = JSON.parse(
    gh([
      'api',
      '--paginate',
      '--slurp',
      `repos/${REPOSITORY}/commits/${sha}/status?per_page=100`,
    ]),
  );
  return normalizeChecks(
    sha,
    pages.flatMap((page) => page.check_runs),
    statusPages.flatMap((page) => page.statuses),
  );
}
function pull(number) {
  const query = `query($number:Int!){repository(owner:"aaryandas",name:"applied-research"){pullRequest(number:$number){number state isDraft isCrossRepository author{login __typename} headRefOid headRefName baseRefName baseRefOid body mergeable mergeStateStatus reviewDecision reviewThreads(first:100){nodes{isResolved} pageInfo{hasNextPage}}}}}`;
  const result = JSON.parse(
    gh(['api', 'graphql', '-f', `query=${query}`, '-F', `number=${number}`]),
  );
  if (result.errors)
    throw new Error('GitHub PR inventory returned GraphQL errors');
  const pr = result.data.repository.pullRequest;
  if (pr.author) pr.author.is_bot = pr.author.__typename !== 'User';
  pr.upToDate = false;
  if (pr.author && !pr.author.is_bot && !pr.isCrossRepository) {
    const comparison = api(`compare/${pr.baseRefOid}...${pr.headRefOid}`);
    pr.upToDate = ['identical', 'ahead'].includes(comparison.status);
    const filePages = JSON.parse(
      gh([
        'api',
        '--paginate',
        '--slurp',
        `repos/${REPOSITORY}/pulls/${number}/files?per_page=100`,
      ]),
    );
    pr.files = filePages.flatMap((page) => page.map((file) => file.filename));
  }
  return pr;
}
function saveState(path, state) {
  writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
function readState(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { receipts: [] };
    throw error;
  }
}

function readSonarReceipt(directory, sha) {
  if (!SHA.test(sha)) return null;
  try {
    return JSON.parse(
      readFileSync(join(directory, 'sonar', `${sha}.json`), 'utf8'),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function observeDeployments(sha) {
  const deployments = api(`deployments?sha=${sha}&per_page=20`);
  return deployments.map((deployment) => ({
    id: deployment.id,
    environment: deployment.environment,
    statuses: api(`deployments/${deployment.id}/statuses?per_page=1`).map(
      (status) => ({
        state: status.state,
        environmentUrl: status.environment_url,
      }),
    ),
  }));
}

function processRelease(options) {
  const { state, path, apply } = options;
  const receipt = state.receipts.find((item) => item.mergeSha && !item.release);
  if (!receipt) return null;
  const main = api('git/ref/heads/main').object.sha;
  const comparison = api(`compare/${receipt.mergeSha}...${main}`);
  if (!['identical', 'ahead'].includes(comparison.status))
    return {
      kind: 'infra',
      reason: 'Merged revision is no longer an ancestor of main',
    };
  const deployments = observeDeployments(main);
  if (!releaseReady(main, currentChecks(main)))
    return {
      kind: 'infra',
      reason: 'Waiting for successful main CI',
      sha: main,
      deployments,
    };
  if (!apply)
    return {
      kind: 'ready',
      action: 'release-candidate',
      sha: main,
      deployments,
    };
  // Persist intent before dispatch: an uncertain response must not duplicate a release.
  receipt.release = {
    status: 'dispatching',
    requestedForSha: main,
    at: new Date().toISOString(),
    deployments,
  };
  saveState(path, state);
  if (api('git/ref/heads/main').object.sha !== main)
    throw new Error(
      'Main advanced before release dispatch; inspect recorded intent',
    );
  gh(['workflow', 'run', 'release.yml', '--repo', REPOSITORY, '--ref', 'main']);
  receipt.release.status = 'requested';
  saveState(path, state);
  return {
    kind: 'requested',
    action: 'release-candidate',
    sha: main,
    deployments,
    note: 'Request recorded; actual release run revision and Railway outcome still require verification',
  };
}

export function runTick(options) {
  const directory = resolve(options.stateDir);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, 'merge.lock');
  let lock;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      return {
        kind: 'infra',
        reason:
          'Merge lock exists; inspect owning PID before removing stale lock',
        lockPath,
      };
    throw error;
  }
  try {
    writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
    );
    const path = join(directory, 'state.json');
    const state = readState(path);
    const uncertain = state.receipts.find(
      (item) =>
        item.status === 'merging' || item.release?.status === 'dispatching',
    );
    if (uncertain)
      return {
        kind: 'infra',
        reason:
          'Previous mutation has uncertain outcome; reconcile recorded PR or release before retry',
        receipt: uncertain,
      };
    const release = processRelease({ state, path, apply: options.apply });
    if (release) return release;
    const candidates = JSON.parse(
      gh([
        'pr',
        'list',
        '--repo',
        REPOSITORY,
        '--state',
        'open',
        '--base',
        'main',
        '--limit',
        '100',
        '--json',
        'number,createdAt',
      ]),
    ).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const blocked = [];
    for (const candidate of candidates) {
      const pr = pull(candidate.number);
      const sonarReceipt = readSonarReceipt(directory, pr.headRefOid);
      const decision = assessMerge(
        pr,
        currentChecks(pr.headRefOid),
        sonarReceipt,
      );
      if (decision.action === 'needs-sonar')
        return {
          ...decision,
          number: pr.number,
          sha: pr.headRefOid,
          receiptPath: join(directory, 'sonar', `${pr.headRefOid}.json`),
          instruction:
            'Luna must serialize a trusted local native scan at this exact SHA. Run PR tests with all credentials removed; only the trusted installed scanner process receives the Sonar token, never PR npm scripts. Verify Sonar task and quality gate before writing {sha,outcome:"passed",qualityGate:"OK",scanner:"sonarqube-native",analysisId}. See context/next-run.md. No receipt from the PR author or repository is accepted.',
        };
      if (!decision.eligible) {
        blocked.push({ number: pr.number, ...decision });
        continue;
      }
      if (!options.apply)
        return {
          kind: 'ready',
          action: 'merge',
          number: pr.number,
          sha: pr.headRefOid,
          blocked,
        };
      const fresh = pull(pr.number);
      if (
        fresh.headRefOid !== pr.headRefOid ||
        !assessMerge(
          fresh,
          currentChecks(fresh.headRefOid),
          readSonarReceipt(directory, fresh.headRefOid),
        ).eligible
      )
        return {
          kind: 'infra',
          reason: 'PR changed during eligibility check; retry next tick',
          number: pr.number,
        };
      const receipt = {
        number: pr.number,
        headSha: pr.headRefOid,
        status: 'merging',
        at: new Date().toISOString(),
      };
      state.receipts.push(receipt);
      saveState(path, state);
      gh([
        'pr',
        'merge',
        String(pr.number),
        '--repo',
        REPOSITORY,
        '--squash',
        '--match-head-commit',
        pr.headRefOid,
      ]);
      const merged = api(`pulls/${pr.number}`);
      if (!merged.merged || !SHA.test(merged.merge_commit_sha))
        throw new Error(
          'Merge outcome not confirmed; inspect persisted receipt',
        );
      receipt.status = 'merged';
      receipt.mergeSha = merged.merge_commit_sha;
      saveState(path, state);
      return {
        kind: 'merged',
        receipt,
        note: 'Deployment not yet verified; next tick waits for main CI',
      };
    }
    return { kind: 'idle', blocked };
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const { values } = parseArgs({
      options: {
        apply: { type: 'boolean', default: false },
        'state-dir': { type: 'string' },
      },
    });
    const stateDir =
      values['state-dir'] ??
      join(homedir(), '.codex', 'delivery', 'applied-research');
    console.log(
      JSON.stringify(runTick({ apply: values.apply, stateDir }), null, 2),
    );
  } catch (error) {
    console.error(JSON.stringify({ kind: 'infra', reason: error.message }));
    process.exitCode = 1;
  }
}
