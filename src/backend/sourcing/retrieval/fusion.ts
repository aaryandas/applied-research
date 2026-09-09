import { compareText } from './identity.js';
import type { SelectedPassage } from './types.js';

const RECIPROCAL_RANK_OFFSET = 60;

export function passageKey({ evidence }: SelectedPassage): string {
  const version = evidence.sourceVersion;
  return JSON.stringify([
    version.sourceId,
    version.revisionId,
    version.sha256,
    version.canonicalizationVersion,
    evidence.locator.start,
    evidence.locator.end,
  ]);
}

/** Equal channel weights; raw similarity scores and provider quality labels never enter this score. */
export function fusePassages(passages: SelectedPassage[]): SelectedPassage[] {
  const merged = new Map<string, SelectedPassage>();
  for (const passage of passages) {
    const key = passageKey(passage);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, passage);
      continue;
    }
    const ranks = new Map(
      previous.retrievalSignals.map((signal) => [signal.channel, signal.rank]),
    );
    for (const signal of passage.retrievalSignals)
      ranks.set(
        signal.channel,
        Math.min(ranks.get(signal.channel) ?? Infinity, signal.rank),
      );
    const representative =
      compareText(
        JSON.stringify(previous.evidence),
        JSON.stringify(passage.evidence),
      ) <= 0
        ? previous
        : passage;
    merged.set(key, {
      ...representative,
      observations: [
        ...new Map(
          [...previous.observations, ...passage.observations].map(
            (observation) => [JSON.stringify(observation), observation],
          ),
        ).values(),
      ],
      retrievalSignals: [...ranks].map(([channel, rank]) => ({
        channel,
        rank,
      })),
    });
  }
  return [...merged.values()]
    .map((passage) => ({
      ...passage,
      observations: [...passage.observations].sort((left, right) =>
        compareText(JSON.stringify(left), JSON.stringify(right)),
      ),
      retrievalSignals: passage.retrievalSignals.sort((left, right) =>
        compareText(left.channel, right.channel),
      ),
      fusionScore: passage.retrievalSignals.reduce(
        (sum, { rank }) => sum + 1 / (RECIPROCAL_RANK_OFFSET + rank),
        0,
      ),
    }))
    .sort(
      (left, right) =>
        right.fusionScore - left.fusionScore ||
        compareText(passageKey(left), passageKey(right)),
    );
}
