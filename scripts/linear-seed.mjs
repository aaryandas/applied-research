// Creates the next-run tickets in Linear from .github/next-run-tickets.json.
// Idempotent by title. Usage: LINEAR_API_KEY=lin_api_... node scripts/linear-seed.mjs
import { readFileSync } from 'node:fs';

const key = process.env.LINEAR_API_KEY;
if (!key)
  throw new Error(
    'Set LINEAR_API_KEY (Linear personal API key; never commit it).',
  );
const { teamId, projectId, issues } = JSON.parse(
  readFileSync('.github/next-run-tickets.json', 'utf8'),
);

async function gql(query, variables) {
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const existing = await gql(
  `query($teamId: String!) { team(id: $teamId) { issues(first: 250) { nodes { title identifier } } } }`,
  { teamId },
);
const known = new Map(
  existing.team.issues.nodes.map((i) => [i.title, i.identifier]),
);

for (const issue of issues) {
  if (known.has(issue.title)) {
    console.log(`exists  ${known.get(issue.title)}  ${issue.title}`);
    continue;
  }
  const created = await gql(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier } } }`,
    {
      input: {
        teamId,
        projectId,
        title: issue.title,
        description: issue.description,
        priority: issue.priority,
      },
    },
  );
  console.log(
    `created ${created.issueCreate.issue.identifier}  ${issue.title}`,
  );
}
