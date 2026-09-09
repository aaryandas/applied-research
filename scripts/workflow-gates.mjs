// Pure rules shared by trusted workflow entry points; no credentials or side effects.
export function ticketIdentifier(pr) {
  const match =
    pr.head.ref.match(/\bar-(\d+)\b/i) ??
    pr.body?.match(/^Linear:\s*AR-(\d+)\s*$/im);
  return match ? `AR-${match[1]}` : null;
}

const DELIVERY_PATH =
  /^(?:\.gitignore|\.github\/lanes\.json|\.github\/workflows\/[^/]+\.ya?ml|scripts\/(?:dispatch[\w.-]*|workflow[\w.-]*|linear-gate|fable-review|merge-group-gates|gate-provenance(?:\.test)?|delivery-merge(?:\.test)?|hosted-sonar(?:-rules|\.test)?)\.mjs|context\/(?:next-run|code-map|development|releases|automation-run|sonar-local)\.md)$/;

function verificationVideo(body, sha) {
  const values = ['SHA', 'RESULT', 'VIDEO'].map((key) =>
    [
      ...body.matchAll(new RegExp(`^VERIFICATION_${key}: ([^\\r\\n]+)$`, 'gm')),
    ].map((match) => match[1].trim()),
  );
  if (values.some((value) => value.length !== 1)) return null;
  if (values[0][0] !== sha || values[1][0] !== 'PASS') return null;
  if (values[2][0] === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  try {
    const url = new URL(values[2][0]);
    const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'uploads.linear.app' ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !new RegExp(`^/${uuid}/${uuid}/${uuid}$`).test(url.pathname)
    )
      return null;
    // Linear renews signed query parameters; asset identity is its exact path.
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function verificationPassed(
  issue,
  sha,
  { files = [], attestations = [], linearUserId } = {},
) {
  const deliveryOnly =
    files.length > 0 && files.every((file) => DELIVERY_PATH.test(file));
  if (
    !linearUserId ||
    issue.state.name !== 'In Review' ||
    !/^[a-f0-9]{40}$/.test(sha)
  )
    return false;
  return issue.comments.nodes.some(({ body, user }) => {
    if (user?.id !== linearUserId) return false;
    const video = verificationVideo(body, sha);
    if (!video || (video === 'NOT_APPLICABLE' && !deliveryOnly)) return false;
    // Cursor's Linear MCP shares the founder's identity. Require independent
    // corroboration by the actual Cursor GitHub App bot, not another member.
    return attestations.some(
      (attestation) =>
        attestation.user?.id === 206951365 &&
        attestation.user?.login === 'cursor[bot]' &&
        attestation.user?.type === 'Bot' &&
        (!attestation.commit_id || attestation.commit_id === sha) &&
        verificationVideo(attestation.body ?? '', sha) === video,
    );
  });
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
