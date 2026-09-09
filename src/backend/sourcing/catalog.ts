import type {
  MetadataOnlySource,
  PermissionDecision,
  SourceKind,
} from '../../contracts/sourcing.js';
import {
  CURATED_SOURCE_MANIFEST,
  curatedSourceDescriptor,
} from './corpus/curated-manifest.js';
import { boundUniversityLane } from './university-join.js';

const DISCOVERED_AT = '2026-09-09T00:00:00.000Z';

function forbidden(reason: string): PermissionDecision {
  return { status: 'forbidden', reason };
}

const python = CURATED_SOURCE_MANIFEST[0]
  ? curatedSourceDescriptor(CURATED_SOURCE_MANIFEST[0])
  : null;

function linkOnly(input: {
  id: string;
  sourceId: string;
  kind: SourceKind;
  title: string;
  creators: string[];
  url: string;
  summary: string;
  reason: string;
}): MetadataOnlySource {
  return {
    sourceId: input.sourceId,
    kind: input.kind,
    title: input.title,
    authorship: { kind: 'authored', creators: input.creators },
    providerIds: [{ provider: 'curated-catalog', id: input.id }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: input.url,
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: null,
    publicationDate: null,
    discoveredAt: DISCOVERED_AT,
    metadataSummary: input.summary,
    relationships: [],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: input.url,
      license: { status: 'unknown' },
      acquisition: forbidden(input.reason),
      indexing: forbidden(input.reason),
    },
    content: { state: 'metadata-only' },
  };
}

/** Official course/lecture links remain discoverable without indexing grants. */
export const OFFICIAL_LINK_ONLY_SOURCES: readonly MetadataOnlySource[] = [
  linkOnly({
    id: 'mit-ocw-6-006',
    sourceId: 'mit_ocw_6_006',
    kind: 'course',
    title: 'Introduction to Algorithms (MIT OpenCourseWare 6.006)',
    creators: ['Massachusetts Institute of Technology'],
    url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
    summary:
      'Current MIT OCW licenses are CC BY-NC-SA. Listed for discovery and original-link coverage only; this record does not grant commercial indexing, transcripts, or treat metadata as grounding evidence.',
    reason:
      'MIT OpenCourseWare current notices are non-commercial ShareAlike; commercial indexing is not granted.',
  }),
  linkOnly({
    id: 'mit-ocw-18-06',
    sourceId: 'mit_ocw_18_06',
    kind: 'course',
    title: 'Linear Algebra (MIT OpenCourseWare 18.06)',
    creators: ['Massachusetts Institute of Technology'],
    url: 'https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/',
    summary:
      'University course discovery/link coverage. NC-SA terms block commercial indexing. Metadata is not treated as retrieved evidence.',
    reason:
      'MIT OpenCourseWare current notices are non-commercial ShareAlike; commercial indexing is not granted.',
  }),
  linkOnly({
    id: 'openstax-university-physics',
    sourceId: 'openstax_university_physics',
    kind: 'textbook',
    title: 'University Physics (OpenStax)',
    creators: ['OpenStax'],
    url: 'https://openstax.org/details/books/university-physics-volume-1',
    summary:
      'OpenStax current notices restrict commercial and AI reuse. Discovery/link only; not acquired or indexed.',
    reason:
      'OpenStax current notices restrict commercial/AI reuse; indexing rights are not granted.',
  }),
];

/**
 * Shared catalog defaults: reviewed PSF HTML plus official link-only courses.
 * BCcampus is not a default acquisition grant. AR-57 injects university
 * MetadataOnlySource[] through `composeCatalogSources`.
 */
export const STARTER_CATALOG_SOURCES: readonly MetadataOnlySource[] = [
  ...(python ? [python] : []),
  ...OFFICIAL_LINK_ONLY_SOURCES,
];

export const STARTER_CATALOG_LIMITATIONS = [
  'Discovery metadata is not full text and is not treated as grounding evidence.',
  'HTML text extraction only; PDF and other binary formats are not acquired.',
  'MIT OCW current terms are CC BY-NC-SA; courses are link-only.',
  'OpenStax current notices restrict commercial/AI reuse; titles are link-only.',
  'Official course and lecture URLs may be listed for discovery without transcript or index permission.',
  'University extractors (MIT/Delft and later Stanford/Berkeley/Harvard grants) are injected by AR-57; this lane does not invent that catalog.',
  'Images and chapter-noted third-party exceptions are not acquired.',
] as const;

function uniqueSources(
  sources: readonly MetadataOnlySource[],
): MetadataOnlySource[] {
  const seen = new Set<string>();
  const unique: MetadataOnlySource[] = [];
  for (const source of sources) {
    if (seen.has(source.sourceId)) continue;
    seen.add(source.sourceId);
    unique.push(source);
  }
  return unique;
}

export function composeCatalogSources(
  injected?: readonly MetadataOnlySource[],
): readonly MetadataOnlySource[] {
  const university = injected ?? boundUniversityLane()?.catalog ?? [];
  return uniqueSources([...university, ...STARTER_CATALOG_SOURCES]);
}

function matchesQuery(source: MetadataOnlySource, query: string): boolean {
  const haystack = [
    source.title,
    source.metadataSummary ?? '',
    source.authorship.kind === 'authored'
      ? source.authorship.creators.join(' ')
      : '',
  ]
    .join(' ')
    .toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.some((term) => haystack.includes(term)) || terms.length === 0;
}

export function discoverStarterCatalog(input: {
  query: string;
  kinds: readonly SourceKind[];
  limit: number;
  sources?: readonly MetadataOnlySource[];
}): MetadataOnlySource[] {
  const sources = input.sources ?? composeCatalogSources();
  return sources
    .filter(
      (source) =>
        input.kinds.includes(source.kind) && matchesQuery(source, input.query),
    )
    .slice(0, input.limit);
}
