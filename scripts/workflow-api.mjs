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
export async function github(path, body) {
  const response = await fetch(
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
    const run = await github(`actions/runs/${runId}`);
    if (!trustedGateRun(current, run) || run.status !== 'completed')
      return false;
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
    if (!artifact) return false;
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) return false;
    const directory = mkdtempSync(join(tmpdir(), 'gate-cache-'));
    try {
      const path = join(directory, 'receipt.zip');
      writeFileSync(path, Buffer.from(await response.arrayBuffer()));
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
  } catch {
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
