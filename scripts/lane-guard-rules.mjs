export function allowedLanePaths(config, labels) {
  const lanes = labels
    .filter((label) => label.startsWith('lane:'))
    .map((label) => label.slice(5));
  if (lanes.length !== 1) {
    throw new Error(
      `Expected exactly one lane:<name> label, found: ${lanes.join(', ') || 'none'}`,
    );
  }
  const [lane] = lanes;
  if (!Object.hasOwn(config.lanes, lane)) {
    throw new Error(
      `Unknown lane "${lane}". Known: ${Object.keys(config.lanes).join(', ')}`,
    );
  }
  return { lane, allowed: [...config.lanes[lane], ...config.shared] };
}
