#!/usr/bin/env node
// Required PR check: look up the Linear ticket and classify lifecycle.
// Merge eligibility still requires In Review inside delivery-queue assessCandidate.
// Expected In Development / automation-gap is not a code defect: this job stays
// green so coding agents do not autofix stale heads. Does not move Linear status.
// Env: LINEAR_API_KEY (read + attachment write), HEAD_REF, PR_BODY, PR_URL, PR_TITLE,
// PR_STATE, PR_DRAFT.
import { pathToFileURL } from 'node:url';
import {
  classifyLinearGate,
  ticketFromBranchOrBody,
} from './delivery-constants.mjs';

export const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';
export const EXEMPT_LINEAR_GATE_LANES = Object.freeze(['integration']);
export const TEAM_ISSUE_QUERY = `query($n: Float!) { issues(filter: { number: { eq: $n }, team: { key: { eq: "AR" } } }) { nodes { id identifier state { name } attachments { nodes { url } } } } }`;
export const ATTACHMENT_LINK_MUTATION = `mutation($id: String!, $url: String!, $t: String!) { attachmentLinkURL(issueId: $id, url: $url, title: $t) { success } }`;

const DUPLICATE_ATTACHMENT_MESSAGE = /duplicate attachment for duplicate url/i;

export class LinearGraphqlError extends Error {
  constructor(errors, { httpStatus } = {}) {
    const list = Array.isArray(errors) ? errors : [];
    super(JSON.stringify(list));
    this.name = 'LinearGraphqlError';
    this.errors = list;
    this.httpStatus = httpStatus ?? null;
  }
}

export function parseLinearGraphqlErrors(error) {
  if (error instanceof LinearGraphqlError) {
    return error.errors;
  }
  const raw = error?.message;
  if (typeof raw !== 'string' || !raw.startsWith('[')) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every((entry) => entry && typeof entry.message === 'string')
    ) {
      return parsed;
    }
  } catch {
    /* Arbitrary Error messages are not GraphQL errors. */
  }
  return [];
}

export function isDuplicateAttachmentError(error) {
  return parseLinearGraphqlErrors(error).some((entry) => {
    const code = entry?.extensions?.code;
    const message = String(entry?.message ?? '');
    return code === 'INPUT_ERROR' && DUPLICATE_ATTACHMENT_MESSAGE.test(message);
  });
}

export function issueHasExactAttachmentUrl(issue, url) {
  const wanted = String(url ?? '');
  if (!wanted) return false;
  return (issue?.attachments?.nodes ?? []).some((node) => node?.url === wanted);
}

export function ticketNumber(identifier) {
  const match = String(identifier ?? '').match(/^AR-(\d+)$/);
  return match ? Number(match[1]) : null;
}

export async function linearGraphql(
  query,
  variables,
  { apiKey, fetchImpl = fetch } = {},
) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('LINEAR_API_KEY is missing');
  }
  const response = await fetchImpl(LINEAR_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (payload?.errors?.length) {
    throw new LinearGraphqlError(payload.errors, {
      httpStatus: response.status,
    });
  }
  if (!response.ok) {
    throw new Error(`Linear GraphQL returned ${response.status}`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Linear GraphQL returned ${response.status} without JSON`);
  }
  return payload.data;
}

export async function queryTeamIssue(identifier, gql) {
  const number = ticketNumber(identifier);
  if (number == null) {
    throw new Error(`Linear identifier ${identifier} is invalid`);
  }
  const data = await gql(TEAM_ISSUE_QUERY, { n: number });
  return data?.issues?.nodes?.[0] ?? null;
}

export async function linkIssueUrl(gql, { issueId, url, title }) {
  return gql(ATTACHMENT_LINK_MUTATION, {
    id: issueId,
    url,
    t: title,
  });
}

export async function confirmExactIssueUrl({ gql, identifier, issueId, url }) {
  const again = await queryTeamIssue(identifier, gql);
  if (!again) {
    throw new Error(
      `${identifier} is missing after a duplicate attachment error; refusing to treat the link as present`,
    );
  }
  if (again.id !== issueId) {
    throw new Error(
      `Linear re-query returned ${again.id}, not intended issue ${issueId}`,
    );
  }
  if (again.identifier !== identifier) {
    throw new Error(
      `Linear re-query returned ${again.identifier}, not intended ${identifier}`,
    );
  }
  if (!issueHasExactAttachmentUrl(again, url)) {
    throw new Error(
      `Duplicate attachment error for ${url} but ${identifier} still has no matching attachment`,
    );
  }
  return again;
}

export async function ensureIssueHasPrUrl({
  gql,
  issue,
  identifier,
  prUrl,
  title,
}) {
  const url = String(prUrl ?? '');
  if (!url) {
    return { status: 'skipped', reason: 'no-pr-url' };
  }
  if (issueHasExactAttachmentUrl(issue, url)) {
    return { status: 'already-linked', reason: 'existing-attachment' };
  }
  try {
    await linkIssueUrl(gql, {
      issueId: issue.id,
      url,
      title: title || 'Pull request',
    });
    return { status: 'created', reason: 'attachment-link-url' };
  } catch (error) {
    if (!isDuplicateAttachmentError(error)) {
      throw error;
    }
    await confirmExactIssueUrl({
      gql,
      identifier,
      issueId: issue.id,
      url,
    });
    return { status: 'already-linked', reason: 'duplicate-confirmed' };
  }
}

function labelsFromEnv(env) {
  return String(env.LABELS ?? '')
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
}

function gateLane(env) {
  return labelsFromEnv(env)
    .find((label) => label.startsWith('lane:'))
    ?.slice(5);
}

function prFromEnv(env) {
  return {
    state:
      String(env.PR_STATE ?? 'open').toLowerCase() === 'closed'
        ? 'CLOSED'
        : 'OPEN',
    isDraft: env.PR_DRAFT === 'true',
  };
}

export async function main(
  env = process.env,
  { gql, log = console, fetchImpl = fetch } = {},
) {
  const lane = gateLane(env);
  if (lane && EXEMPT_LINEAR_GATE_LANES.includes(lane)) {
    log.log(`lane:${lane} is exempt from the Linear gate`);
    return { exitCode: 0, kind: 'exempt' };
  }

  const identifier = ticketFromBranchOrBody(
    env.HEAD_REF ?? '',
    env.PR_BODY ?? '',
  );
  if (!identifier) {
    log.error(
      'No Linear ticket found. Name the branch after the ticket (…/ar-17-…) or put `Linear: AR-17` on its own line in the PR body. Other mentions of tickets in the body are ignored.',
    );
    return { exitCode: 1, kind: 'missing-ticket' };
  }

  const apiKey = env.LINEAR_API_KEY;
  if (!apiKey) {
    log.error(`LINEAR_API_KEY secret is not set; cannot verify ${identifier}.`);
    return { exitCode: 1, kind: 'missing-key' };
  }

  const request =
    gql ??
    ((query, variables) =>
      linearGraphql(query, variables, { apiKey, fetchImpl }));
  const issue = await queryTeamIssue(identifier, request);
  if (!issue) {
    log.error(`${identifier} does not exist in team AR.`);
    return { exitCode: 1, kind: 'missing-issue' };
  }

  const prUrl = env.PR_URL ?? '';
  const linked = await ensureIssueHasPrUrl({
    gql: request,
    issue,
    identifier,
    prUrl,
    title: env.PR_TITLE ?? 'Pull request',
  });
  if (linked.status === 'created') {
    log.log(`linked ${prUrl} on ${identifier}`);
  } else if (linked.status === 'already-linked') {
    log.log(`PR already linked on ${identifier} (${linked.reason})`);
  }

  log.log(`${identifier} is "${issue.state.name}"`);
  const classification = classifyLinearGate({
    pr: prFromEnv(env),
    linear: { identifier, state: issue.state.name },
    ticket: identifier,
  });
  log.log(
    JSON.stringify({ classification: classification.kind, autofix: false }),
  );
  log.log(classification.message);
  if (classification.kind === 'merge-eligible-linear') {
    log.log('Linear gate ok');
  }
  return {
    exitCode: classification.exitCode,
    kind: classification.kind,
    identifier,
    link: linked,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await main();
    process.exit(result.exitCode);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
