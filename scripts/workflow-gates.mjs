// Pure rules shared by trusted workflow entry points; no credentials or side effects.
export function ticketIdentifier(pr) {
  const match =
    pr.head.ref.match(/\bar-(\d+)\b/i) ??
    pr.body?.match(/^Linear:\s*AR-(\d+)\s*$/im);
  return match ? `AR-${match[1]}` : null;
}

const DELIVERY_PATH =
  /^(?:\.github\/lanes\.json|\.github\/workflows\/[^/]+\.ya?ml|scripts\/(?:dispatch[\w.-]*|workflow[\w.-]*|linear-gate|fable-review|merge-group-gates)\.mjs|context\/(?:next-run|code-map|development|releases|automation-run)\.md)$/;

export function verificationPassed(issue, sha, files = []) {
  const deliveryOnly =
    files.length > 0 && files.every((file) => DELIVERY_PATH.test(file));
  if (issue.state.name !== 'In Review' || !/^[a-f0-9]{40}$/.test(sha))
    return false;
  return issue.comments.nodes.some(
    ({ body }) =>
      body
        .split('\n')
        .some((line) => line.trim() === `VERIFICATION_SHA: ${sha}`) &&
      /^VERIFICATION_RESULT: PASS\s*$/m.test(body) &&
      (/^VERIFICATION_VIDEO: https:\/\/\S+\s*$/m.test(body) ||
        (deliveryOnly &&
          /^VERIFICATION_VIDEO: NOT_APPLICABLE\s*$/m.test(body))),
  );
}

export function reviewPassed(review, sha) {
  return (
    review !== null &&
    typeof review === 'object' &&
    /^[a-f0-9]{40}$/.test(sha) &&
    review.sha === sha &&
    review.standards === 'PASS' &&
    review.spec === 'PASS' &&
    Array.isArray(review.required_fixes) &&
    review.required_fixes.length === 0 &&
    typeof review.summary === 'string' &&
    review.summary.trim().length > 0
  );
}

export function queuePulls(pulls, commits, ref) {
  const lead = ref.match(/\/pr-(\d+)-/);
  const included = pulls.filter((pr) => commits.includes(pr.head.sha));
  if (!lead || !included.some((pr) => pr.number === Number(lead[1]))) {
    throw new Error(
      'Cannot resolve every merge-group PR at its current head; retry the queue.',
    );
  }
  return included;
}
