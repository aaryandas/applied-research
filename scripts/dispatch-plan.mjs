export const TARGET_TIME = '2026-09-09T04:00:00Z';
export const MAX_ACTIVE = 10;
export const ACTIVE_STATES = new Set([
  'In Development',
  'In Testing',
  'In Review',
  'Ready to Merge',
]);
const TERMINAL_STATES = new Set(['Done', 'Canceled', 'Duplicate']);

export function validateSnapshot(snapshot, now = Date.now()) {
  if (!Array.isArray(snapshot.issues))
    throw new Error('Snapshot requires issues array.');
  const age = now - Date.parse(snapshot.generatedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 300_000) {
    throw new Error(
      'Refresh Linear snapshot: it must be no older than five minutes.',
    );
  }
  const identifiers = new Set();
  for (const issue of snapshot.issues) {
    if (
      !/^AR-\d+$/.test(issue.identifier) ||
      identifiers.has(issue.identifier)
    ) {
      throw new Error('Every issue must have one unique AR identifier.');
    }
    identifiers.add(issue.identifier);
    if (!Array.isArray(issue.labels) || !Array.isArray(issue.blockedBy)) {
      throw new Error(
        `${issue.identifier}: explicit labels and blockedBy arrays required.`,
      );
    }
    if (!issue.status || !issue.id)
      throw new Error(`${issue.identifier}: missing state or id.`);
  }
}

export function planDispatch({ snapshot, claims = {}, now = Date.now() }) {
  validateSnapshot(snapshot, now);
  const issues = new Map(
    snapshot.issues.map((issue) => [issue.identifier, issue]),
  );
  const active = new Set(
    snapshot.issues
      .filter(
        (issue) => issue.activeRun === true && ACTIVE_STATES.has(issue.status),
      )
      .map((issue) => issue.identifier),
  );
  for (const claim of Object.values(claims)) {
    if (!TERMINAL_STATES.has(issues.get(claim.identifier)?.status))
      active.add(claim.identifier);
  }
  const slots = Math.max(0, MAX_ACTIVE - active.size);
  const ready = snapshot.issues
    .filter((issue) => {
      const excluded = issue.labels.some((label) =>
        /^(epic|playbook|deferred)$/i.test(label),
      );
      const dependenciesComplete = issue.blockedBy.every(
        (id) =>
          issues.get(id)?.status === 'Done' ||
          issue.prerequisiteCheckpoints?.some(
            (checkpoint) =>
              checkpoint.identifier === id &&
              /^[a-f0-9]{7,40}$/.test(checkpoint.revision ?? '') &&
              Boolean(checkpoint.evidence?.trim()),
          ),
      );
      return (
        issue.status === 'Todo' &&
        !claims[issue.identifier] &&
        !excluded &&
        /^lane:[a-z-]+$/.test(issue.lane ?? '') &&
        Boolean(issue.description?.trim()) &&
        dependenciesComplete
      );
    })
    .sort(
      (a, b) =>
        (a.priority || 5) - (b.priority || 5) ||
        String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) ||
        Number(a.identifier.slice(3)) - Number(b.identifier.slice(3)),
    );
  return {
    active: [...active].sort(),
    slots,
    targetTimePassed: now >= Date.parse(TARGET_TIME),
    selected: ready.slice(0, slots),
  };
}

export function normalizeIssue(raw) {
  const scope = raw.assignment?.scope;
  return {
    id: raw.uuid ?? raw.id,
    identifier: raw.identifier ?? raw.id,
    title: raw.title,
    description: `${raw.description ?? ''}${scope ? `\n\nCurrent dispatch ownership (supersedes earlier owner/model descriptions):\n${scope}` : ''}`,
    status: raw.status,
    priority: raw.priority?.value ?? raw.priority ?? 0,
    createdAt: raw.createdAt,
    labels: raw.labels,
    blockedBy:
      raw.blockedBy ??
      raw.relations?.blockedBy?.map((related) => related.identifier),
    lane: raw.lane ?? raw.assignment?.lane,
    activeRun: raw.activeRun === true,
    prerequisiteCheckpoints:
      raw.prerequisiteCheckpoints ??
      raw.assignment?.prerequisiteCheckpoints ??
      [],
    preexistingCode: raw.preexistingCode ?? scope ?? null,
    repairRequest: raw.repairRequest ?? null,
  };
}
