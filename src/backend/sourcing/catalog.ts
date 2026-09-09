import type {
  MetadataOnlySource,
  PermissionDecision,
  SourceKind,
} from '../../contracts/sourcing.js';
import {
  CURATED_SOURCE_MANIFEST,
  curatedSourceDescriptor,
} from './corpus/curated-manifest.js';

const DISCOVERED_AT = '2026-09-09T00:00:00.000Z';

function forbidden(reason: string): PermissionDecision {
  return { status: 'forbidden', reason };
}

function permitted(evidenceUrl: string): PermissionDecision {
  return { status: 'permitted', basis: 'license', evidenceUrl };
}

const python = CURATED_SOURCE_MANIFEST[0]
  ? curatedSourceDescriptor(CURATED_SOURCE_MANIFEST[0])
  : null;

const bccampusBook: MetadataOnlySource = {
  sourceId: 'bccampus_database_design_2e',
  kind: 'textbook',
  title: 'Database Design – 2nd Edition',
  authorship: {
    kind: 'authored',
    creators: ['Adrienne Watt', 'Nelson Eng'],
  },
  providerIds: [{ provider: 'curated-catalog', id: 'bccampus-dbdesign-2e' }],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://opentextbc.ca/dbdesign01/',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: null,
  publicationDate: '2014-01-01',
  discoveredAt: DISCOVERED_AT,
  metadataSummary:
    'BCcampus webbook. Text is CC BY 4.0 except where a chapter notice says otherwise. Chapter 13 is CC BY-NC-SA 3.0 and is excluded. HTML chapters only; PDFs are not acquired.',
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: 'https://opentextbc.ca/dbdesign01/',
    license: {
      status: 'known',
      name: 'Creative Commons Attribution 4.0 International',
      spdxId: 'CC-BY-4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    },
    acquisition: forbidden(
      'Acquire reviewed HTML chapters individually; the book PDF is not parsed.',
    ),
    indexing: forbidden(
      'Index only verified HTML chapters. Remix exceptions including NC-SA chapters are excluded.',
    ),
  },
  content: { state: 'metadata-only' },
};

function bccampusChapter(input: {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  licenseName: string;
  spdxId: string;
  licenseUrl: string;
  summary: string;
}): MetadataOnlySource {
  const permission = permitted(input.licenseUrl);
  return {
    sourceId: input.sourceId,
    kind: 'chapter',
    title: input.title,
    authorship: {
      kind: 'authored',
      creators: ['Adrienne Watt', 'Nelson Eng'],
    },
    providerIds: [{ provider: 'curated-catalog', id: input.id }],
    scholarlyIdentity: { doi: null, arxivId: null },
    originalLocation: {
      url: input.url,
      trust: 'untrusted-public-url',
    },
    acquisitionLocation: {
      url: input.url,
      trust: 'untrusted-public-url',
    },
    publicationDate: '2014-01-01',
    discoveredAt: DISCOVERED_AT,
    metadataSummary: input.summary,
    relationships: [
      {
        kind: 'chapter-of-textbook',
        parentSourceId: bccampusBook.sourceId,
        parentProviderIds: bccampusBook.providerIds,
      },
    ],
    usePolicy: {
      access: 'public',
      accessEvidenceUrl: input.url,
      license: {
        status: 'known',
        name: input.licenseName,
        spdxId: input.spdxId,
        url: input.licenseUrl,
      },
      acquisition: permission,
      indexing: permission,
    },
    content: { state: 'metadata-only' },
  };
}

const bccampusFundamental = bccampusChapter({
  id: 'bccampus-dbdesign-2e-ch2',
  sourceId: 'bccampus_database_design_2e_ch2',
  title: 'Fundamental Concepts',
  url: 'https://opentextbc.ca/dbdesign01/chapter/chapter-2-fundamental-concepts/',
  licenseName: 'Creative Commons Attribution 3.0 Unported',
  spdxId: 'CC-BY-3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  summary:
    'HTML chapter of Database Design 2e. Attribution required for Watt, Eng, and the Nguyen Kim Anh CC BY 3.0 derivative notice. Images and noted exceptions are not acquired. The HTML extractor does not parse PDFs.',
});

const bccampusSql = bccampusChapter({
  id: 'bccampus-dbdesign-2e-ch15',
  sourceId: 'bccampus_database_design_2e_ch15',
  title: 'SQL Structured Query Language',
  url: 'https://opentextbc.ca/dbdesign01/chapter/sql-structured-query-language/',
  licenseName: 'Creative Commons Attribution 4.0 International',
  spdxId: 'CC-BY-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  summary:
    'HTML SQL chapter of Database Design 2e (Watt/Eng). Book notice is CC BY 4.0 except where otherwise noted; this chapter has no NC-SA exception in the reviewed edition. Images are not acquired. PDFs are unsupported.',
});

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

const mitOcwIntro = linkOnly({
  id: 'mit-ocw-6-006',
  sourceId: 'mit_ocw_6_006',
  kind: 'course',
  title: 'Introduction to Algorithms (MIT OpenCourseWare 6.006)',
  creators: ['Massachusetts Institute of Technology'],
  url: 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/',
  summary:
    'Current MIT OCW licenses are CC BY-NC-SA. Listed for discovery and original-link coverage only; this record does not grant commercial indexing or treat metadata as grounding evidence.',
  reason:
    'MIT OpenCourseWare current notices are non-commercial ShareAlike; commercial indexing is not granted.',
});

const mitOcwMath = linkOnly({
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
});

const openStax = linkOnly({
  id: 'openstax-university-physics',
  sourceId: 'openstax_university_physics',
  kind: 'textbook',
  title: 'University Physics (OpenStax)',
  creators: ['OpenStax'],
  url: 'https://openstax.org/details/books/university-physics-volume-1',
  summary:
    'OpenStax current notices restrict commercial and AI reuse. Discovery/link only; not acquired or indexed.',
  reason:
    'OpenStax current notices restrict commercial and AI reuse; indexing rights are not granted.',
});

const openTextbookLibrary: MetadataOnlySource = {
  sourceId: 'otl_database_design_2e',
  kind: 'textbook',
  title: 'Database Design – 2nd Edition (Open Textbook Library record)',
  authorship: {
    kind: 'authored',
    creators: ['Adrienne Watt', 'Nelson Eng'],
  },
  providerIds: [{ provider: 'curated-catalog', id: 'otl-dbdesign-2e' }],
  scholarlyIdentity: { doi: null, arxivId: null },
  originalLocation: {
    url: 'https://open.umn.edu/opentextbooks/textbooks/database-design-2nd-edition',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: null,
  publicationDate: null,
  discoveredAt: DISCOVERED_AT,
  metadataSummary:
    'Open Textbook Library catalog metadata is CC0. Per-book text licenses still require edition-specific verification; this metadata record does not authorize acquisition or indexing of book files.',
  relationships: [],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl:
      'https://open.umn.edu/opentextbooks/textbooks/database-design-2nd-edition',
    license: {
      status: 'known',
      name: 'CC0 1.0 Universal (metadata only)',
      spdxId: 'CC0-1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    acquisition: forbidden(
      'OTL metadata is CC0; the underlying book text must be acquired from its reviewed publisher HTML edition, not this catalog page.',
    ),
    indexing: forbidden(
      'Catalog metadata is not full text and is not indexed as evidence.',
    ),
  },
  content: { state: 'metadata-only' },
};

/** Permission-verified starter set. AR-57 expands institutional courses via this array. */
export const STARTER_CATALOG_SOURCES: readonly MetadataOnlySource[] = [
  ...(python ? [python] : []),
  bccampusBook,
  bccampusFundamental,
  bccampusSql,
  openTextbookLibrary,
  mitOcwIntro,
  mitOcwMath,
  openStax,
];

export const STARTER_CATALOG_LIMITATIONS = [
  'Discovery metadata is not full text and is not treated as grounding evidence.',
  'HTML text extraction only; PDF and other binary formats are not acquired.',
  'MIT OCW current terms are CC BY-NC-SA; courses are link-only.',
  'OpenStax current notices restrict commercial/AI reuse; titles are link-only.',
  'BCcampus Database Design 2e Chapter 13 is CC BY-NC-SA 3.0 and is excluded.',
  'Images and chapter-noted third-party exceptions are not acquired.',
] as const;

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
}): MetadataOnlySource[] {
  return STARTER_CATALOG_SOURCES.filter(
    (source) =>
      input.kinds.includes(source.kind) && matchesQuery(source, input.query),
  ).slice(0, input.limit);
}
