export { acquireUniversitySource } from './acquire.js';
export { admitUniversityBytes } from './admission.js';
export {
  publicLicenseDescriptor,
  toAcquiredSource,
  type ProducerIndexingGrant,
} from './adapter.js';
export {
  CS231N_CASE_STUDY_ATTRIBUTION,
  CS231N_CASE_STUDY_SHA256,
  CS231N_HTML_ACQUIRED_AT,
  CS231N_LICENSE_SHA256,
  DELFT_CONFIG_SHA256,
  DELFT_CREDITS_SHA256,
  DELFT_INTRODUCTION_SHA256,
  DELFT_QUANTUM_ATTRIBUTION,
  MIT_ABSTRACTION_ATTRIBUTION,
  MIT_ABSTRACTION_SOURCE_SHA256,
  MIT_LICENSE_SHA256,
} from './attribution.js';
export {
  PINNED_UNIVERSITY_SOURCES,
  UNIVERSITY_CANDIDATES,
  UNIVERSITY_CANDIDATE_IDS,
  pinnedUniversitySource,
  universityCandidate,
} from './catalog.js';
export { universityCatalogSources } from './catalog-sources.js';
export {
  EXTERNAL_COURSE_DIRECTORY,
  UNIVERSITY_DIRECTORY_IDS,
  externalCourseEntry,
} from './directory.js';
export { extractAdmittedUniversitySource } from './extract.js';
export { extractReviewedHtmlSource } from './extractors/html.js';
export { extractMystMarkdown } from './extractors/myst.js';
export { extractPlutoStaticSource } from './extractors/pluto.js';
export { FIXTURE_URLS } from './fixtures.js';
export { sha256Bytes, sha256Utf8 } from './hashes.js';
export {
  canonicalRevisionFromExtraction,
  sourcePassagesFromExtraction,
} from './passages.js';
export { createGuardedUniversityTransport } from './transport.js';
export {
  HTML_EXTRACTION_METHOD,
  MYST_EXTRACTION_METHOD,
  PLUTO_EXTRACTION_METHOD,
  UNIVERSITY_CANONICALIZATION_VERSION,
  UNIVERSITY_PUBLIC_MESSAGES,
  type UniversityByteTransport,
  type UniversityExtractionResult,
} from './types.js';
