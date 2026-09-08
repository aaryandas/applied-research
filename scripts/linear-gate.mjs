// Required PR check: the PR's Linear ticket must be In Review before the PR can merge.
// Ticket id comes from the head branch (…/ar-17-…) or the PR body (AR-17). Also links the PR on the ticket.
// Env: LINEAR_API_KEY (read + attachment write), HEAD_REF, PR_BODY, PR_URL, PR_TITLE.
const key = process.env.LINEAR_API_KEY;
const ALLOWED = new Set(['In Review']);
const EXEMPT_LANES = new Set(['integration']); // coordinator merges of the branch itself

const branch = process.env.HEAD_REF ?? '';
const body = process.env.PR_BODY ?? '';
const labels = (process.env.LABELS ?? '').split(',').filter(Boolean);
const lane = labels.find((l) => l.startsWith('lane:'))?.slice(5);
if (lane && EXEMPT_LANES.has(lane)) {
  console.log(`lane:${lane} is exempt from the Linear gate`);
  process.exit(0);
}

const match = branch.match(/\bar-(\d+)\b/i) ?? body.match(/\bAR-(\d+)\b/);
if (!match) {
  console.error(
    'No Linear ticket found. Name the branch after the ticket (…/ar-17-…) or put AR-17 in the PR body.',
  );
  process.exit(1);
}
const identifier = `AR-${match[1]}`;
if (!key) {
  console.error(
    `LINEAR_API_KEY secret is not set; cannot verify ${identifier}.`,
  );
  process.exit(1);
}

async function gql(query, variables) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}
const data = await gql(
  `query($n: Float!) { issues(filter: { number: { eq: $n }, team: { key: { eq: "AR" } } }) { nodes { id identifier state { name } attachments { nodes { url } } } } }`,
  { n: Number(match[1]) },
);
const issue = data.issues.nodes[0];
if (!issue) {
  console.error(`${identifier} does not exist in team AR.`);
  process.exit(1);
}

const prUrl = process.env.PR_URL ?? '';
if (prUrl && !issue.attachments.nodes.some((a) => a.url === prUrl)) {
  await gql(
    `mutation($id: String!, $url: String!, $t: String!) { attachmentLinkURL(issueId: $id, url: $url, title: $t) { success } }`,
    { id: issue.id, url: prUrl, t: process.env.PR_TITLE ?? 'Pull request' },
  );
  console.log(`linked ${prUrl} on ${identifier}`);
}
console.log(`${identifier} is "${issue.state.name}"`);
if (!ALLOWED.has(issue.state.name)) {
  console.error(
    `Merge blocked: ${identifier} must be In Review (cloud verification passed). Current: ${issue.state.name}.`,
  );
  process.exit(1);
}
console.log('Linear gate ok');
