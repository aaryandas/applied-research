// Executed only from main's trusted checkout. Candidate code is read by the scanner, never executed.
import {
  appendFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { github, paginate, publishStatus } from './workflow-api.mjs';
import {
  findingsOnDiff,
  validateAnalysis,
  rejectSymlinks,
  stageCoverage,
} from './hosted-sonar-rules.mjs';

const context = 'Sonar gate';
const sha = process.env.SCAN_SHA;
const number = Number(process.env.SCAN_PR);

async function select() {
  const requested = Number(process.env.REQUESTED_PR);
  const pulls = requested
    ? [await github(`pulls/${requested}`)]
    : await paginate('pulls?state=open&base=main&sort=created&direction=asc');
  for (const pr of pulls) {
    if (
      pr.draft ||
      pr.user.type !== 'User' ||
      pr.head.repo?.full_name !== process.env.GITHUB_REPOSITORY ||
      pr.base.ref !== 'main'
    )
      continue;
    const files = await paginate(`pulls/${pr.number}/files`);
    if (
      !files.some(
        (file) =>
          file.filename.startsWith('src/') ||
          file.previous_filename?.startsWith('src/'),
      )
    )
      continue;
    const statuses = await github(`commits/${pr.head.sha}/status`);
    const previous = statuses.statuses.find(
      (status) => status.context === context,
    );
    // A product failure waits for a new revision; explicit dispatch is the manual retry path.
    if (
      !requested &&
      previous &&
      ['success', 'failure'].includes(previous.state)
    )
      continue;
    const previousAttempt = Number(
      previous?.description?.match(/attempt (\d+)/)?.[1] ?? 0,
    );
    if (!requested && previousAttempt >= 2) {
      // The shared publisher reuses an identical exhausted error while its receipt is trusted.
      // Sonar uploads gate receipts even when selection has no scan candidate.
      await publishStatus(pr.head.sha, {
        context,
        state: 'error',
        description:
          'Hosted Sonar attempt 2 exhausted; inspect infrastructure and dispatch explicit retry',
      });
      continue;
    }
    const attempt = requested ? 1 : previousAttempt + 1;
    const runs = await github(
      `actions/workflows/ci.yml/runs?head_sha=${pr.head.sha}&event=pull_request&status=success&per_page=100`,
    );
    const run = runs.workflow_runs.find(
      (candidate) => candidate.head_sha === pr.head.sha,
    );
    if (!run) continue;
    const artifacts = await github(
      `actions/runs/${run.id}/artifacts?per_page=100`,
    );
    if (
      !artifacts.artifacts.some(
        (artifact) => artifact.name === 'coverage' && !artifact.expired,
      )
    )
      continue;
    await publishStatus(pr.head.sha, {
      context,
      state: 'pending',
      description: `Hosted Sonar attempt ${attempt}: analyzing this exact head`,
    });
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `sha=${pr.head.sha}\nnumber=${pr.number}\nrun_id=${run.id}\nattempt=${attempt}\n`,
    );
    writeFileSync(
      join(process.env.RUNNER_TEMP, 'sonar-files.json'),
      JSON.stringify(files),
    );
    return;
  }
  console.log(
    'No unscanned source PR with successful current-head CI and coverage is ready.',
  );
}

function prepare() {
  const host = new URL(process.env.SONAR_HOST_URL);
  if (
    host.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(host.hostname)
  )
    throw new Error(
      'Only the configured HTTPS hosted Sonar endpoint may be used',
    );
  const candidate = process.env.CANDIDATE_PATH;
  if (existsSync(join(candidate, '.scannerwork')))
    throw new Error('Candidate must not supply scanner state');
  for (const name of ['sonar-project.properties', '.sonar-tsconfig.json']) {
    try {
      unlinkSync(join(candidate, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  writeFileSync(
    join(candidate, 'sonar-project.properties'),
    readFileSync('sonar-project.properties'),
  );
  rejectSymlinks(join(candidate, 'src'));
  rejectSymlinks(join(candidate, 'tests'));
  stageCoverage({ candidate, coveragePath: process.env.COVERAGE_PATH });
  // Use fixed trusted compiler options instead of evaluating candidate tsconfig inheritance.
  writeFileSync(
    join(candidate, '.sonar-tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2024',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        allowJs: true,
      },
      include: ['src/**/*'],
    }),
  );
}

async function sonar(path) {
  const host = new URL(process.env.SONAR_HOST_URL);
  if (
    host.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(host.hostname)
  )
    throw new Error('Sonar requires the configured HTTPS hosted endpoint');
  const response = await fetch(new URL(path, host), {
    headers: { Authorization: `Bearer ${process.env.SONAR_TOKEN}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Hosted Sonar API returned HTTP ${response.status}`);
  return response.json();
}

async function allFindings(endpoint, collection) {
  const findings = [];
  for (let page = 1; ; page++) {
    const result = await sonar(`${endpoint}&ps=500&p=${page}`);
    findings.push(...result[collection]);
    const total = result.paging?.total ?? result.total;
    if (!Number.isInteger(total))
      throw new Error('Sonar findings inventory is incomplete');
    if (findings.length >= total) return findings;
    if (findings.length >= 10_000 || result[collection].length === 0)
      throw new Error('Sonar findings inventory is truncated');
  }
}

async function finish() {
  if (
    !/^[a-f0-9]{40}$/.test(sha ?? '') ||
    !Number.isSafeInteger(number) ||
    number < 1
  )
    throw new Error('Missing frozen scanner identity');
  let evidence = {
    sha,
    pr: number,
    scanner: 'sonarqube-hosted',
    outcome: 'error',
  };
  let result;
  try {
    const report = Object.fromEntries(
      readFileSync(
        join(process.env.CANDIDATE_PATH, '.scannerwork/report-task.txt'),
        'utf8',
      )
        .trim()
        .split('\n')
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    if (!report.ceTaskId || report.projectKey !== process.env.SONAR_PROJECT_KEY)
      throw new Error('Scanner report has no matching project/task');
    const { task } = await sonar(
      `/api/ce/task?id=${encodeURIComponent(report.ceTaskId)}`,
    );
    if (task.status !== 'SUCCESS' || !task.analysisId)
      throw new Error(`Sonar compute task has not succeeded: ${task.status}`);
    const history = await sonar(
      `/api/project_analyses/search?project=${encodeURIComponent(process.env.SONAR_PROJECT_KEY)}&ps=100`,
    );
    const analysis = history.analyses.find(
      (candidate) => candidate.key === task.analysisId,
    );
    if (!analysis)
      throw new Error(
        'Sonar analysis for this compute task is not visible yet',
      );
    const { projectStatus: gate } = await sonar(
      `/api/qualitygates/project_status?analysisId=${encodeURIComponent(task.analysisId)}`,
    );
    const project = encodeURIComponent(process.env.SONAR_PROJECT_KEY);
    const issues = await allFindings(
      `/api/issues/search?componentKeys=${project}&resolved=false`,
      'issues',
    );
    const hotspots = await allFindings(
      `/api/hotspots/search?projectKey=${project}&status=TO_REVIEW`,
      'hotspots',
    );
    const files = JSON.parse(
      readFileSync(join(process.env.RUNNER_TEMP, 'sonar-files.json'), 'utf8'),
    );
    const findings = findingsOnDiff([...issues, ...hotspots], files);
    evidence = { ...evidence, task, analysis, gate, findings };
    const fresh = await github(`pulls/${number}`);
    const passed =
      process.env.SCAN_OUTCOME === 'success' &&
      fresh.head.sha === sha &&
      validateAnalysis(evidence);
    evidence.outcome = passed ? 'passed' : 'failed';
    result = {
      state: passed ? 'success' : 'failure',
      description: passed
        ? 'Hosted Sonar: exact revision, quality gate OK, zero diff findings'
        : 'Hosted Sonar quality gate, diff findings, or revision validation failed',
    };
  } catch (error) {
    evidence.error = error.message;
    result = {
      state: 'error',
      description:
        `Hosted Sonar attempt ${process.env.SCAN_ATTEMPT ?? 1}: ${error.message}`.slice(
          0,
          140,
        ),
    };
  }
  const directory = join(process.env.RUNNER_TEMP, 'sonar-evidence');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${sha}.json`),
    JSON.stringify(evidence, null, 2),
  );
  await publishStatus(sha, { context, ...result });
  console.log(`PR #${number} ${sha}: ${result.description}`);
  if (result.state !== 'success') process.exitCode = 1;
}

if (process.argv[2] === 'select') await select();
else if (process.argv[2] === 'prepare') prepare();
else if (process.argv[2] === 'finish') await finish();
else throw new Error('Expected select, prepare, or finish');
