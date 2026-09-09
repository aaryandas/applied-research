import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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

export async function publishStatus(sha, result) {
  const directory = join(process.env.RUNNER_TEMP, 'gate-receipts');
  mkdirSync(directory, { recursive: true });
  const filename = `${result.context.toLowerCase().replace(/[^a-z0-9]+/g, '-')}--${sha}.json`;
  writeFileSync(
    join(directory, filename),
    JSON.stringify({
      sha,
      context: result.context,
      state: result.state,
      runId: process.env.GITHUB_RUN_ID,
      workflowRef: process.env.GITHUB_WORKFLOW_REF,
      workflowSha: process.env.GITHUB_WORKFLOW_SHA,
    }),
  );
  const existing = await github(`commits/${sha}/status`);
  const current = existing.statuses.find(
    (status) => status.context === result.context,
  );
  if (
    current?.creator?.login === 'github-actions[bot]' &&
    current.target_url ===
      `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}` &&
    current.state === result.state &&
    current.description === result.description
  )
    return;
  await github(`statuses/${sha}`, {
    ...result,
    target_url: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
}
