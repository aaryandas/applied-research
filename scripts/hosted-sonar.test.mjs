import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CI_GATE_NAME,
  GITHUB_ACTIONS_APP_ID,
  GITHUB_ACTIONS_APP_SLUG,
  HOSTED_SONAR_WORKFLOW_FILE,
} from './delivery-constants.mjs';
import {
  CI_WORKFLOW_FILE,
  COVERAGE_ARTIFACT_NAME,
  HOSTED_SONAR_PROVENANCE_KIND,
  MACOS_VERIFY_JOB_NAME,
  authenticateHostedSonarCoverage,
  extractCoverageLcovFromZip,
  isSafeCoverageZipEntry,
  parseNativeCheckRunUrl,
  verifyExtractedCoverage,
} from './hosted-sonar.mjs';

const MAIN = 'cf2086c60fd4657e0a8a2503c22876e1fe9adfb7';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REPO = 'aaryandas/applied-research';
const REPO_ID = 1354007797;
const SOURCE_RUN = 34361091759;
const CONSUMER_RUN = 555000111;
const ARTIFACT_ID = 10108182890;
const MACOS_JOB = 102497956848;
const GATE_JOB = 102501038558;
const LCOV =
  'TN:\nSF:src/backend/accounting.ts\nFN:1,utcMonthStart\nend_of_record\n';

const STARTED = '2026-09-09T14:03:40Z';
const CREATED = '2026-09-09T14:11:20Z';
const COMPLETED = '2026-09-09T14:11:36Z';
const EXPIRES = '2026-09-16T14:11:19Z';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function json(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function makeZip(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'ar-hosted-sonar-zip-'));
  const zipPath = join(dir, 'artifact.zip');
  const paths = [];
  for (const [name, body] of Object.entries(entries)) {
    const filePath = join(dir, name.replaceAll('/', '_'));
    writeFileSync(filePath, body);
    paths.push(filePath);
  }
  const zipped = spawnSync('zip', ['-q', '-j', zipPath, ...paths], {
    encoding: 'utf8',
  });
  if (zipped.status !== 0) {
    throw new Error(zipped.stderr || 'zip failed');
  }
  const bytes = readFileSync(zipPath);
  rmSync(dir, { recursive: true, force: true });
  return bytes;
}

function repoBody() {
  return { id: REPO_ID, full_name: REPO };
}

function runBody(overrides = {}) {
  return {
    id: SOURCE_RUN,
    name: 'CI',
    path: CI_WORKFLOW_FILE,
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: MAIN,
    run_attempt: 1,
    repository: repoBody(),
    head_repository: repoBody(),
    ...overrides,
  };
}

function consumerRunBody(overrides = {}) {
  return {
    id: CONSUMER_RUN,
    name: 'Sonar (main only)',
    path: HOSTED_SONAR_WORKFLOW_FILE,
    event: 'workflow_run',
    status: 'in_progress',
    conclusion: null,
    head_branch: 'main',
    head_sha: MAIN,
    run_attempt: 1,
    repository: repoBody(),
    head_repository: repoBody(),
    ...overrides,
  };
}

function macosJob(overrides = {}) {
  return {
    id: MACOS_JOB,
    name: MACOS_VERIFY_JOB_NAME,
    run_id: SOURCE_RUN,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    labels: ['macos-latest'],
    started_at: STARTED,
    completed_at: COMPLETED,
    check_run_url: `https://api.github.com/repos/${REPO}/check-runs/${MACOS_JOB}`,
    ...overrides,
  };
}

function gateJob(overrides = {}) {
  return {
    id: GATE_JOB,
    name: CI_GATE_NAME,
    run_id: SOURCE_RUN,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    labels: ['ubuntu-24.04'],
    started_at: '2026-09-09T14:11:43Z',
    completed_at: '2026-09-09T14:11:46Z',
    check_run_url: `https://api.github.com/repos/${REPO}/check-runs/${GATE_JOB}`,
    ...overrides,
  };
}

function checkBody(job) {
  return {
    id: job.id,
    name: job.name,
    head_sha: MAIN,
    status: 'completed',
    conclusion: job.conclusion,
    html_url: `https://github.com/${REPO}/actions/runs/${SOURCE_RUN}/job/${job.id}`,
    details_url: `https://github.com/${REPO}/actions/runs/${SOURCE_RUN}/job/${job.id}`,
    app: { slug: GITHUB_ACTIONS_APP_SLUG, id: GITHUB_ACTIONS_APP_ID },
  };
}

function coverageArtifact(overrides = {}) {
  return {
    id: ARTIFACT_ID,
    name: COVERAGE_ARTIFACT_NAME,
    expired: false,
    size_in_bytes: 200,
    digest: 'sha256:pending',
    created_at: CREATED,
    expires_at: EXPIRES,
    workflow_run: {
      id: SOURCE_RUN,
      repository_id: REPO_ID,
      head_repository_id: REPO_ID,
      head_branch: 'main',
      head_sha: MAIN,
    },
    ...overrides,
  };
}

function env(overrides = {}) {
  return {
    GITHUB_TOKEN: 'ghs_test',
    REPOSITORY: REPO,
    DEFAULT_BRANCH: 'main',
    SOURCE_RUN_ID: String(SOURCE_RUN),
    SOURCE_RUN_ATTEMPT: '1',
    CONSUMER_SHA: MAIN,
    GITHUB_SHA: MAIN,
    CONSUMER_REF: 'refs/heads/main',
    CONSUMER_EVENT: 'workflow_run',
    GITHUB_EVENT_NAME: 'workflow_run',
    GITHUB_RUN_ID: String(CONSUMER_RUN),
    GITHUB_RUN_ATTEMPT: '1',
    ...overrides,
  };
}

function mockWorld({
  sourceRun,
  consumerRun,
  jobs,
  artifacts,
  zipBytes,
  currentMain = MAIN,
  extra = {},
} = {}) {
  const lcovZip = zipBytes ?? makeZip({ 'lcov.info': LCOV });
  const digest = `sha256:${sha256(lcovZip)}`;
  const artifactList = (artifacts ?? [coverageArtifact()]).map((artifact) =>
    artifact.digest === 'sha256:pending'
      ? { ...artifact, digest, size_in_bytes: lcovZip.byteLength }
      : artifact,
  );
  const source = sourceRun ?? runBody();
  const consumer = consumerRun ?? consumerRunBody();
  const jobBodies = jobs ?? [macosJob(), gateJob()];
  return {
    zipBytes: lcovZip,
    digest,
    fetchImpl: async (url) => {
      const href = String(url);
      if (href === `https://api.github.com/repos/${REPO}`) {
        return json(repoBody());
      }
      if (href.endsWith(`/git/ref/heads/main`)) {
        return json({ object: { sha: currentMain } });
      }
      if (href.includes(`/actions/runs?head_sha=`)) {
        return json({ workflow_runs: extra.runs ?? [source] });
      }
      const sourceAttemptJobs = href.match(
        new RegExp(
          `/actions/runs/${SOURCE_RUN}/attempts/(\\d+)/jobs\\?per_page=100$`,
        ),
      );
      if (sourceAttemptJobs) {
        const attempt = Number(sourceAttemptJobs[1]);
        return json({
          jobs: jobBodies.filter((job) => Number(job.run_attempt) === attempt),
        });
      }
      const sourceAttempt = href.match(
        new RegExp(`/actions/runs/${SOURCE_RUN}/attempts/(\\d+)$`),
      );
      if (sourceAttempt) {
        return json({
          ...source,
          id: SOURCE_RUN,
          run_attempt: Number(sourceAttempt[1]),
        });
      }
      if (href.endsWith(`/actions/runs/${SOURCE_RUN}/artifacts?per_page=100`)) {
        return json({ artifacts: artifactList });
      }
      if (href.endsWith(`/actions/runs/${SOURCE_RUN}`)) {
        return json(source);
      }
      const consumerAttempt = href.match(
        new RegExp(`/actions/runs/${CONSUMER_RUN}/attempts/(\\d+)$`),
      );
      if (consumerAttempt) {
        return json({
          ...consumer,
          id: CONSUMER_RUN,
          run_attempt: Number(consumerAttempt[1]),
        });
      }
      if (href.endsWith(`/actions/runs/${CONSUMER_RUN}`)) {
        return json(consumer);
      }
      const jobMatch = href.match(/\/actions\/jobs\/(\d+)$/);
      if (jobMatch) {
        if (extra.jobs?.[jobMatch[1]]) return json(extra.jobs[jobMatch[1]]);
        const found = jobBodies.find((job) => String(job.id) === jobMatch[1]);
        return found
          ? json(found)
          : {
              ok: false,
              status: 404,
              async json() {
                return {};
              },
            };
      }
      const checkMatch = href.match(/\/check-runs\/(\d+)$/);
      if (checkMatch) {
        const found = jobBodies.find((job) => String(job.id) === checkMatch[1]);
        if (!found) {
          if (extra.checks?.[checkMatch[1]])
            return json(extra.checks[checkMatch[1]]);
          return {
            ok: false,
            status: 404,
            async json() {
              return {};
            },
          };
        }
        return json(checkBody(found));
      }
      if (href.endsWith(`/actions/artifacts/${ARTIFACT_ID}`)) {
        return json(artifactList[0]);
      }
      const otherArtifact = href.match(/\/actions\/artifacts\/(\d+)$/);
      if (otherArtifact) {
        const found = artifactList.find(
          (artifact) => String(artifact.id) === otherArtifact[1],
        );
        return found
          ? json(found)
          : {
              ok: false,
              status: 404,
              async json() {
                return {};
              },
            };
      }
      if (href.endsWith(`/actions/artifacts/${ARTIFACT_ID}/zip`)) {
        return {
          ok: true,
          status: 200,
          body: lcovZip,
          async arrayBuffer() {
            return lcovZip;
          },
        };
      }
      throw new Error(`unexpected ${href}`);
    },
  };
}

test('native check-run URL must be this repository API, not html details_url', () => {
  assert.equal(
    parseNativeCheckRunUrl(
      REPO,
      `https://api.github.com/repos/${REPO}/check-runs/${MACOS_JOB}`,
    ),
    MACOS_JOB,
  );
  assert.equal(
    parseNativeCheckRunUrl(
      REPO,
      `https://github.com/${REPO}/actions/runs/${SOURCE_RUN}/job/${MACOS_JOB}`,
    ),
    null,
  );
  assert.equal(
    parseNativeCheckRunUrl(
      REPO,
      `https://api.github.com/repos/evil/applied-research/check-runs/${MACOS_JOB}`,
    ),
    null,
  );
  assert.equal(isSafeCoverageZipEntry('lcov.info'), true);
  assert.equal(isSafeCoverageZipEntry('coverage/lcov.info'), true);
  assert.equal(isSafeCoverageZipEntry('../lcov.info'), false);
  assert.equal(isSafeCoverageZipEntry('evil.sh'), false);
});

test('genuine current-main CI coverage authenticates mac gate, artifact, and lcov', async () => {
  const world = mockWorld();
  const result = await authenticateHostedSonarCoverage(env(), {
    fetchImpl: world.fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.provenance.kind, HOSTED_SONAR_PROVENANCE_KIND);
  assert.equal(result.provenance.analyzedSha, MAIN);
  assert.equal(result.provenance.sourceRunId, SOURCE_RUN);
  assert.equal(result.provenance.sourceRunAttempt, 1);
  assert.equal(result.provenance.sourceWorkflowPath, CI_WORKFLOW_FILE);
  assert.equal(result.provenance.macosCheckRunId, MACOS_JOB);
  assert.equal(result.provenance.gateCheckRunId, GATE_JOB);
  assert.equal(result.provenance.artifactId, ARTIFACT_ID);
  assert.equal(result.provenance.artifactDigest, world.digest);
  assert.match(result.lcov, /SF:src\/backend\/accounting.ts/);
  assert.equal(result.provenance.coverageSha256, sha256(LCOV));
});

test('wrong SHA, repo, workflow, and pull_request source are rejected', async () => {
  const wrongSha = mockWorld({
    sourceRun: runBody({ head_sha: OTHER }),
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: wrongSha.fetchImpl,
      })
    ).reason,
    'wrong-sha',
  );

  const wrongRepo = mockWorld({
    sourceRun: runBody({
      head_repository: { id: 1, full_name: 'evil/applied-research' },
    }),
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: wrongRepo.fetchImpl,
      })
    ).reason,
    'wrong-repo',
  );

  const wrongWorkflow = mockWorld({
    sourceRun: runBody({
      path: '.github/workflows/release.yml',
      name: 'Release',
    }),
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: wrongWorkflow.fetchImpl,
      })
    ).reason,
    'wrong-workflow',
  );

  const prSource = mockWorld({
    sourceRun: runBody({ event: 'pull_request', head_branch: 'feature' }),
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: prSource.fetchImpl,
      })
    ).reason,
    'source-pull-request',
  );
});

test('failed macOS Verify or CI gate is not coverage proof', async () => {
  const failedMac = mockWorld({
    jobs: [macosJob({ conclusion: 'failure' }), gateJob()],
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: failedMac.fetchImpl,
      })
    ).reason,
    'failed-macos',
  );

  const failedGate = mockWorld({
    jobs: [macosJob(), gateJob({ conclusion: 'failure' })],
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: failedGate.fetchImpl,
      })
    ).reason,
    'failed-gate',
  );
});

test('forged check_run_url is not native macOS Verify proof', async () => {
  const ubuntuId = 102497955970;
  const forged = mockWorld({
    jobs: [
      macosJob({
        check_run_url: `https://api.github.com/repos/${REPO}/check-runs/${ubuntuId}`,
      }),
      gateJob(),
    ],
    extra: {
      checks: {
        [ubuntuId]: {
          id: ubuntuId,
          name: 'checks / Verify (ubuntu-24.04)',
          head_sha: MAIN,
          status: 'completed',
          conclusion: 'success',
          app: { slug: GITHUB_ACTIONS_APP_SLUG, id: GITHUB_ACTIONS_APP_ID },
        },
      },
    },
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: forged.fetchImpl,
      })
    ).reason,
    'forged-check-url',
  );

  const htmlUrl = mockWorld({
    jobs: [
      macosJob({
        check_run_url: `https://github.com/${REPO}/actions/runs/${SOURCE_RUN}/job/${MACOS_JOB}`,
      }),
      gateJob(),
    ],
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: htmlUrl.fetchImpl,
      })
    ).reason,
    'forged-check-url',
  );
});

test('jobs from a later rerun attempt cannot satisfy an earlier attempt', async () => {
  const world = mockWorld({
    extra: {
      jobs: {
        [String(MACOS_JOB)]: macosJob({ run_attempt: 2 }),
      },
    },
  });
  const result = await authenticateHostedSonarCoverage(
    env({ SOURCE_RUN_ATTEMPT: '1' }),
    { fetchImpl: world.fetchImpl },
  );
  assert.equal(result.reason, 'wrong-rerun-attempt');
});

test('missing, expired, and ambiguous coverage artifacts fail closed', async () => {
  const missing = mockWorld({ artifacts: [] });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: missing.fetchImpl,
      })
    ).reason,
    'missing-artifact',
  );

  const expired = mockWorld({
    artifacts: [coverageArtifact({ expired: true })],
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: expired.fetchImpl,
      })
    ).reason,
    'expired-artifact',
  );

  const ambiguous = mockWorld({
    artifacts: [
      coverageArtifact({ id: ARTIFACT_ID }),
      coverageArtifact({
        id: 10108182891,
        created_at: '2026-09-09T14:11:21Z',
      }),
    ],
  });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: ambiguous.fetchImpl,
      })
    ).reason,
    'ambiguous-artifact',
  );
});

test('main advancing past the consumer SHA fails closed', async () => {
  const world = mockWorld({ currentMain: OTHER });
  assert.equal(
    (
      await authenticateHostedSonarCoverage(env(), {
        fetchImpl: world.fetchImpl,
      })
    ).reason,
    'main-advanced',
  );
});

test('unexpected artifact entries are not treated as coverage data', () => {
  const extra = makeZip({
    'lcov.info': LCOV,
    'evil.sh': '#!/bin/sh\necho pwned\n',
  });
  assert.equal(
    extractCoverageLcovFromZip(extra).reason,
    'unexpected-artifact-entry',
  );

  const dir = mkdtempSync(join(tmpdir(), 'ar-hosted-sonar-zip-trav-'));
  const zipPath = join(dir, 'artifact.zip');
  const py = spawnSync(
    'python3',
    [
      '-c',
      `import zipfile; z=zipfile.ZipFile(${JSON.stringify(zipPath)},'w'); z.writestr('../evil.sh','#!/bin/sh')`,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(py.status, 0, py.stderr);
  const traversal = extractCoverageLcovFromZip(readFileSync(zipPath));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(traversal.reason, 'unexpected-artifact-entry');

  const scriptNamedLcov = makeZip({ 'lcov.info': '#!/bin/sh\necho pwned\n' });
  assert.equal(
    extractCoverageLcovFromZip(scriptNamedLcov).reason,
    'coverage-not-lcov',
  );
});

test('action-extracted coverage must match authenticated digest and stay non-executable data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ar-hosted-sonar-extract-'));
  try {
    writeFileSync(join(dir, 'lcov.info'), LCOV);
    const ok = verifyExtractedCoverage({
      downloadDir: dir,
      destinationPath: join(dir, 'out', 'lcov.info'),
      provenance: {
        kind: HOSTED_SONAR_PROVENANCE_KIND,
        coverageSha256: sha256(LCOV),
      },
    });
    assert.equal(ok.ok, true);
    assert.equal(readFileSync(join(dir, 'out', 'lcov.info'), 'utf8'), LCOV);

    writeFileSync(join(dir, 'evil.sh'), '#!/bin/sh\n');
    assert.equal(
      verifyExtractedCoverage({
        downloadDir: dir,
        destinationPath: join(dir, 'out2', 'lcov.info'),
        provenance: {
          kind: HOSTED_SONAR_PROVENANCE_KIND,
          coverageSha256: sha256(LCOV),
        },
      }).reason,
      'unexpected-artifact-entry',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const linked = mkdtempSync(join(tmpdir(), 'ar-hosted-sonar-link-'));
  try {
    const target = join(linked, 'lcov.info');
    writeFileSync(target, LCOV);
    const download = join(linked, 'download');
    mkdirSync(download);
    symlinkSync(target, join(download, 'lcov.info'));
    assert.equal(
      verifyExtractedCoverage({
        downloadDir: download,
        destinationPath: join(linked, 'out', 'lcov.info'),
        provenance: {
          kind: HOSTED_SONAR_PROVENANCE_KIND,
          coverageSha256: sha256(LCOV),
        },
      }).reason,
      'unexpected-artifact-entry',
    );
  } finally {
    rmSync(linked, { recursive: true, force: true });
  }
});

test('workflow_dispatch without SOURCE_RUN_ID resolves the unique successful main CI run', async () => {
  const world = mockWorld({
    consumerRun: consumerRunBody({ event: 'workflow_dispatch' }),
    extra: { runs: [runBody()] },
  });
  const result = await authenticateHostedSonarCoverage(
    env({
      CONSUMER_EVENT: 'workflow_dispatch',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      SOURCE_RUN_ID: '',
      SOURCE_RUN_ATTEMPT: '',
    }),
    { fetchImpl: world.fetchImpl },
  );
  assert.equal(result.ok, true);
  assert.equal(result.provenance.sourceRunId, SOURCE_RUN);
});

test('hosted Sonar workflow is a main-only CI coverage consumer, not a second verify.yml', () => {
  const sonar = readFileSync('.github/workflows/sonar.yml', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(sonar, /^name: Sonar \(main only\)$/m);
  assert.match(sonar, /workflow_run:/);
  assert.match(sonar, /workflows:\s*\n\s*-\s*CI/);
  assert.match(sonar, /branches: \[main\]/);
  assert.equal(sonar.includes('uses: ./.github/workflows/verify.yml'), false);
  assert.match(sonar, /node scripts\/hosted-sonar\.mjs authenticate/);
  assert.match(sonar, /node scripts\/hosted-sonar\.mjs verify-coverage/);
  assert.match(
    sonar,
    /actions\/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093/,
  );
  assert.match(sonar, /artifact-ids:/);
  assert.match(sonar, /run-id:/);
  assert.match(sonar, /github-token:/);
  assert.match(sonar, /runner\.temp/);
  assert.match(sonar, /sonar\.qualitygate\.wait=true/);
  assert.match(sonar, /sonar\.scm\.revision=\$\{\{ github\.sha \}\}/);
  assert.match(sonar, /^ {2}analyze:/m);
  assert.match(sonar, /persist-credentials: false/);
  assert.equal(sonar.includes('POST /check-runs'), false);
  assert.equal(sonar.includes('actions/github-script'), false);
  assert.equal(sonar.includes('SONAR_TOKEN'), true);
  const provenanceJob = sonar.split('analyze:')[0];
  assert.equal(provenanceJob.includes('secrets.SONAR_TOKEN'), false);
  assert.equal(ci.includes('SONAR_TOKEN'), false);
  assert.equal(ci.includes('uses: ./.github/workflows/verify.yml'), true);
});
