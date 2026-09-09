import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
  gateRunId,
  trustedGateRun,
  trustedGateStatus,
  gateReceiptFilename,
} from './gate-provenance.mjs';
import { join } from 'node:path';

export const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  : {};
export const repository = process.env.GITHUB_REPOSITORY;
// These caches live for one reconciliation process, never across workflow runs.
const runs = new Map();
const archives = new Map();
let rateLimitError;

async function request(url, options) {
  if (rateLimitError) throw rateLimitError;
  const response = await fetch(url, options);
  const forbiddenMessage =
    response.status === 403
      ? await response
          .clone()
          .json()
          .then((body) => String(body.message ?? ''))
          .catch(() => '')
      : '';
  if (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' ||
        response.headers.has('retry-after') ||
        /rate limit/i.test(forbiddenMessage)))
  ) {
    rateLimitError = new Error(
      'GitHub rate limit exhausted; reconciliation stopped until a later run',
    );
    throw rateLimitError;
  }
  return response;
}

function cached(cache, key, read) {
  if (!cache.has(key)) cache.set(key, read());
  return cache.get(key);
}

async function receiptArchive(runId) {
  const { artifacts } = await github(
    `actions/runs/${runId}/artifacts?per_page=100`,
  );
  const artifact = artifacts.find(
    (item) =>
      item.name === `gate-receipts-${runId}` &&
      !item.expired &&
      Date.parse(item.expires_at) > Date.now() &&
      item.size_in_bytes <= 1024 * 1024,
  );
  if (!artifact) return null;
  const response = await request(
    `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) return null;
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    expiresAt: Date.parse(artifact.expires_at),
  };
}

export async function github(path, body) {
  const response = await request(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(`GitHub ${path}: HTTP ${response.status}`);
  return response.json();
}

export async function paginate(path) {
  const items = [];
  for (let page = 1; ; page++) {
    const result = await github(
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    items.push(...result);
    if (result.length < 100) return items;
  }
}

async function reusableStatus(sha, result, current) {
  if (
    !current ||
    current.state !== result.state ||
    current.description !== result.description
  )
    return false;
  const runId = gateRunId(current);
  if (!runId) return false;
  try {
    const run = await cached(runs, runId, () =>
      github(`actions/runs/${runId}`),
    );
    if (!trustedGateRun(current, run, sha) || run.status !== 'completed')
      return false;
    const archive = await cached(archives, runId, () => receiptArchive(runId));
    if (!archive || archive.expiresAt <= Date.now()) return false;
    const directory = mkdtempSync(join(tmpdir(), 'gate-cache-'));
    try {
      const path = join(directory, 'receipt.zip');
      writeFileSync(path, archive.bytes);
      const receipt = JSON.parse(
        execFileSync(
          'unzip',
          ['-p', path, gateReceiptFilename(current.context, sha)],
          { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 },
        ),
      );
      return trustedGateStatus({ sha, status: current, run, receipt });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  } catch (error) {
    if (error === rateLimitError) throw error;
    return false;
  }
}

export async function publishStatus(sha, result) {
  const existing = await github(`commits/${sha}/status`);
  const current = existing.statuses.find(
    (status) => status.context === result.context,
  );
  // Preserve the original trusted run URL and artifact while unchanged evidence is valid.
  if (await reusableStatus(sha, result, current)) return;
  const directory = join(process.env.RUNNER_TEMP, 'gate-receipts');
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, gateReceiptFilename(result.context, sha)),
    JSON.stringify({
      sha,
      context: result.context,
      state: result.state,
      runId: process.env.GITHUB_RUN_ID,
      workflowRef: process.env.GITHUB_WORKFLOW_REF,
      workflowSha: process.env.GITHUB_WORKFLOW_SHA,
    }),
  );
  await github(`statuses/${sha}`, {
    ...result,
    target_url: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
}
