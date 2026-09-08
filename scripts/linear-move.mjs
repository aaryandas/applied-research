// Moves the September 8 gauntlet tickets to the status the integration branch has earned.
// Usage: LINEAR_API_KEY=lin_api_... node scripts/linear-move.mjs [--dry-run]
const key = process.env.LINEAR_API_KEY;
if (!key)
  throw new Error('Set LINEAR_API_KEY in the environment (never commit it).');
const dryRun = process.argv.includes('--dry-run');
const TEAM = 'b9f474b3-6722-45fd-ab47-c3a1123c9925';
const REVISION = 'ba1630a';
const PR = 'https://github.com/aaryandas/applied-research/pull/3';
const head = `Integrated on codex/integration-20260908 at ${REVISION} (${PR}). npm run check: 764 tests, 90.95% branch coverage. `;

const moves = [
  [
    'AR-15',
    'In Testing',
    head +
      'Opening is the entry screen of the assembled shell; Opening fonts/focus and duplicate-submit Electron specs pass.',
  ],
  [
    'AR-16',
    'In Testing',
    head +
      'Persistent topic sidebar is wired in the shell; shell.spec walks Opening → sidebar → Reader → Canvas → Settings → restart.',
  ],
  [
    'AR-17',
    'In Testing',
    head +
      'Reader integrated with author repairs 2b3574b; independent review PASS; M1/M2 fixes landed.',
  ],
  [
    'AR-18',
    'In Testing',
    head +
      'Canvas integrated at 31964c4 with Sonar fixes; independent review PASS.',
  ],
  [
    'AR-21',
    'In Testing',
    head +
      'Settings integrated at efc89e4; independent review PASS; account state bound to the desktop-auth bridge.',
  ],
  [
    'AR-23',
    'In Testing',
    head +
      'Manim recipes repaired at df1cfc2/0518147; critic PASS on F1/F2; full check 351 tests at the time.',
  ],
  [
    'AR-24',
    'In Testing',
    head +
      'Explanations integrated; all three explanations Electron specs pass on macOS. Five S6747 light-prop findings await founder disposition.',
  ],
  [
    'AR-26',
    'In Testing',
    head +
      'Learning records integrated at 7f6b74b; critic re-review: D1–D4 FIXED, Standards PASS, Spec PASS; idempotent highlight retries added.',
  ],
  [
    'AR-30',
    'In Testing',
    head +
      'Sourcing contract integrated at 17975dd plus Sonar fixes 449970d; critic: Standards PASS, Spec PASS, seven-file acceptance PASS.',
  ],
  [
    'AR-31',
    'In Testing',
    head +
      'OpenAlex discovery integrated at ebd9576 after A1/A2/A3 repairs; adapter acceptance conditional review satisfied by the repair.',
  ],
  [
    'AR-12',
    'In Development',
    `Not yet integrated as done. DA-1 browser callback page is implemented (7fd975f) and independently reviewed with low findings only, but tests/e2e/auth.spec.ts "uses the real Electron SDK for cancellation, encrypted restart and sign-out" still fails: the synthetic /api/auth/electron/token exchange never fires after the second callback. That single spec is the remaining gate. Persistence-failure spec passes.`,
  ],
  [
    'AR-19',
    'In Development',
    `Practical Work component integrated at 844d59e and mounted in the shell, but the independent review of c02a370 requires explicit observation start/stop controls per context/full-app.md and a validated main-side commit path before acceptance. That is the remaining work.`,
  ],
];

async function gql(query, variables) {
  const r = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const body = await r.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

const states = (
  await gql(
    `query($t: String!) { team(id: $t) { states { nodes { id name } } } }`,
    { t: TEAM },
  )
).team.states.nodes;
const stateId = (name) => {
  const s = states.find((x) => x.name === name);
  if (!s)
    throw new Error(
      `No workflow state named "${name}". Have: ${states.map((x) => x.name).join(', ')}`,
    );
  return s.id;
};

for (const [identifier, status, comment] of moves) {
  const [teamKey, number] = identifier.split('-');
  const found = await gql(
    `query($n: Float!, $k: String!) { issues(filter: { number: { eq: $n }, team: { key: { eq: $k } } }) { nodes { id identifier state { name } } } }`,
    { n: Number(number), k: teamKey },
  );
  const issue = found.issues.nodes[0];
  if (!issue) {
    console.log(`missing ${identifier}`);
    continue;
  }
  console.log(
    `${dryRun ? 'would move' : 'move'} ${identifier}: ${issue.state.name} -> ${status}`,
  );
  if (dryRun) continue;
  await gql(
    `mutation($id: String!, $s: String!) { issueUpdate(id: $id, input: { stateId: $s }) { success } }`,
    { id: issue.id, s: stateId(status) },
  );
  await gql(
    `mutation($id: String!, $b: String!) { commentCreate(input: { issueId: $id, body: $b }) { success } }`,
    { id: issue.id, b: comment },
  );
}
