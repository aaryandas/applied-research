// Runs only from the trusted base checkout. Never executes pull-request code.
import {
  event,
  github,
  paginate,
  publishStatus,
  repository,
} from './workflow-api.mjs';
import { ticketIdentifier, verificationPassed } from './workflow-gates.mjs';

async function linear(query, variables) {
  if (!process.env.LINEAR_API_KEY)
    throw new Error('LINEAR_API_KEY is not configured');
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: process.env.LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok || result.errors)
    throw new Error('Linear request failed; verification remains blocked');
  return result.data;
}

async function checkPull(pr) {
  if (pr.user?.type !== 'User' || pr.head.repo?.full_name !== repository)
    return {
      state: 'failure',
      description:
        'Linear verification requires a human-authored same-repository PR',
    };
  const identifier = ticketIdentifier(pr);
  if (!identifier)
    return {
      state: 'failure',
      description: 'Missing branch ticket or explicit Linear: AR-N line',
    };
  const { issue } = await linear(
    'query($id: String!) { issue(id: $id) { id state { name } comments(last: 100) { nodes { body user { id } } } attachments { nodes { url } } } }',
    { id: identifier },
  );
  if (!issue) throw new Error(`${identifier} not found`);
  if (
    !issue.attachments.nodes.some(
      (attachment) => attachment.url === pr.html_url,
    )
  ) {
    await linear(
      'mutation($id: String!, $url: String!, $title: String!) { attachmentLinkURL(issueId: $id, url: $url, title: $title) { success } }',
      { id: issue.id, url: pr.html_url, title: pr.title },
    );
  }
  const files = await paginate(`pulls/${pr.number}/files`);
  const attestations = (
    await Promise.all([
      paginate(`issues/${pr.number}/comments`),
      paginate(`pulls/${pr.number}/reviews`),
    ])
  ).flat();
  const passed =
    !pr.draft &&
    verificationPassed(issue, pr.head.sha, {
      files: files.flatMap((file) =>
        file.previous_filename
          ? [file.filename, file.previous_filename]
          : [file.filename],
      ),
      attestations,
      linearUserId: process.env.CURSOR_LINEAR_USER_ID,
    });
  return {
    state: passed ? 'success' : 'failure',
    description: passed
      ? `${identifier}: exact-head cloud verification passed`
      : `${identifier}: needs In Review, Cursor bot attestation and matching video`,
  };
}

const pulls = event.pull_request
  ? [await github(`pulls/${event.pull_request.number}`)]
  : await paginate('pulls?state=open');
const results = await Promise.allSettled(
  pulls.map(async (pr) => {
    let result;
    try {
      result = await checkPull(pr);
    } catch (error) {
      result = { state: 'error', description: error.message.slice(0, 140) };
    }
    await publishStatus(pr.head.sha, { context: 'Linear gate', ...result });
  }),
);
if (results.some((result) => result.status === 'rejected'))
  throw new Error('Some Linear statuses could not be published');
