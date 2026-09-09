import {
  BCCAMPUS_SQL_ATTRIBUTION,
  DELFT_CONFIG_BYTES,
  DELFT_CONFIG_SHA256,
  DELFT_CREDITS_BYTES,
  DELFT_CREDITS_SHA256,
  DELFT_INTRODUCTION_BYTES,
  DELFT_INTRODUCTION_SHA256,
  DELFT_QUANTUM_ATTRIBUTION,
  DELFT_QUANTUM_SOURCE_COMMIT,
  MIT_ABSTRACTION_ATTRIBUTION,
  MIT_ABSTRACTION_SOURCE_BYTES,
  MIT_ABSTRACTION_SOURCE_SHA256,
  MIT_LICENSE_BYTES,
  MIT_LICENSE_SHA256,
} from './attribution.js';
import {
  MYST_EXTRACTION_METHOD,
  PLUTO_EXTRACTION_METHOD,
  freezeUniversityValue,
  type PinnedUniversitySource,
  type UniversityCandidate,
} from './types.js';

export const UNIVERSITY_CANDIDATE_IDS = {
  mitAbstraction: 'univ_mit_ct_abstr',
  delftQuantization: 'univ_tudelft_qm_em',
  bccampusSql: 'univ_bccampus_sql',
} as const;

export const UNIVERSITY_CANDIDATES: readonly UniversityCandidate[] =
  freezeUniversityValue([
    {
      id: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      sourceId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      title: MIT_ABSTRACTION_ATTRIBUTION.title,
      kind: 'lecture',
      institution: 'Massachusetts Institute of Technology',
      courseCode: 'Introduction to Computational Thinking',
      originalUrl: MIT_ABSTRACTION_ATTRIBUTION.originalUrl,
      acquisitionUrl: MIT_ABSTRACTION_ATTRIBUTION.acquisitionUrl,
      licenseEvidenceUrl: MIT_ABSTRACTION_ATTRIBUTION.licenseEvidenceUrl,
      format: 'pluto-static',
      topicTags: ['computational-thinking', 'julia', 'abstraction'],
      reachability: 'reachable-pinned',
      permission: 'hash-verified',
      extraction: 'pending',
      indexing: 'not-indexed',
      publicNotes: [
        'Independently licensed repository text (CC BY-SA 4.0) and code (MIT), not MIT OCW NC.',
        'Extraction-ready after hash admission; not production indexed.',
      ],
    },
    {
      id: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      sourceId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      title: DELFT_QUANTUM_ATTRIBUTION.title,
      kind: 'chapter',
      institution: 'Delft University of Technology',
      courseCode: 'Introduction to Quantum Mechanics',
      originalUrl: DELFT_QUANTUM_ATTRIBUTION.originalUrl,
      acquisitionUrl: DELFT_QUANTUM_ATTRIBUTION.acquisitionUrl,
      licenseEvidenceUrl: DELFT_QUANTUM_ATTRIBUTION.licenseEvidenceUrl,
      format: 'myst-markdown',
      topicTags: ['quantum-mechanics', 'physics', 'nanobiology'],
      reachability: 'reachable-pinned',
      permission: 'hash-verified',
      extraction: 'pending',
      indexing: 'not-indexed',
      publicNotes: [
        'Pinned GitLab Markdown snapshot; not claimed identical to later published revision 1.4.1.',
        'Selected Matter quantization slice is extraction-ready after hash admission; not production indexed.',
      ],
    },
    {
      id: UNIVERSITY_CANDIDATE_IDS.bccampusSql,
      sourceId: UNIVERSITY_CANDIDATE_IDS.bccampusSql,
      title: BCCAMPUS_SQL_ATTRIBUTION.title,
      kind: 'chapter',
      institution: 'BCcampus',
      courseCode: 'Database Design, 2nd edition',
      originalUrl: BCCAMPUS_SQL_ATTRIBUTION.originalUrl,
      acquisitionUrl: BCCAMPUS_SQL_ATTRIBUTION.acquisitionUrl,
      licenseEvidenceUrl: BCCAMPUS_SQL_ATTRIBUTION.licenseEvidenceUrl,
      format: 'html-pending',
      topicTags: ['databases', 'sql'],
      reachability: 'challenge-blocked',
      permission: 'pending-evidence',
      extraction: 'none',
      indexing: 'not-indexed',
      publicNotes: [
        'Operator-reviewed CC BY 4.0 claim is not byte evidence.',
        'Cloud acquisition of the original public URL returned HTTP 403 Cloudflare challenge; no canonical hash is recorded.',
      ],
    },
  ]);

export const PINNED_UNIVERSITY_SOURCES: readonly PinnedUniversitySource[] =
  freezeUniversityValue([
    {
      candidateId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      sourceId: UNIVERSITY_CANDIDATE_IDS.mitAbstraction,
      format: 'pluto-static',
      source: {
        url: MIT_ABSTRACTION_ATTRIBUTION.acquisitionUrl ?? '',
        bytes: MIT_ABSTRACTION_SOURCE_BYTES,
        sha256: MIT_ABSTRACTION_SOURCE_SHA256,
      },
      license: {
        url: MIT_ABSTRACTION_ATTRIBUTION.licenseEvidenceUrl ?? '',
        bytes: MIT_LICENSE_BYTES,
        sha256: MIT_LICENSE_SHA256,
      },
      extraEvidence: [],
      attribution: MIT_ABSTRACTION_ATTRIBUTION,
      extraction: {
        method: PLUTO_EXTRACTION_METHOD,
        slice: null,
        includeFootnotes: [],
      },
    },
    {
      candidateId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      sourceId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      format: 'myst-markdown',
      source: {
        url: DELFT_QUANTUM_ATTRIBUTION.acquisitionUrl ?? '',
        bytes: DELFT_INTRODUCTION_BYTES,
        sha256: DELFT_INTRODUCTION_SHA256,
      },
      license: {
        url: DELFT_QUANTUM_ATTRIBUTION.licenseEvidenceUrl ?? '',
        bytes: DELFT_CREDITS_BYTES,
        sha256: DELFT_CREDITS_SHA256,
      },
      extraEvidence: [
        {
          url: `https://gitlab.tudelft.nl/opentextbooks/quantum-mechanics-for-nanobiology/-/raw/${DELFT_QUANTUM_SOURCE_COMMIT}/_config.yml`,
          bytes: DELFT_CONFIG_BYTES,
          sha256: DELFT_CONFIG_SHA256,
        },
      ],
      attribution: DELFT_QUANTUM_ATTRIBUTION,
      extraction: {
        method: MYST_EXTRACTION_METHOD,
        slice: { startLine: 52, endLine: 128 },
        includeFootnotes: ['6'],
      },
    },
  ]);

export function universityCandidate(
  candidateId: string,
): UniversityCandidate | null {
  return (
    UNIVERSITY_CANDIDATES.find((candidate) => candidate.id === candidateId) ??
    null
  );
}

export function pinnedUniversitySource(
  candidateId: string,
): PinnedUniversitySource | null {
  return (
    PINNED_UNIVERSITY_SOURCES.find(
      (entry) => entry.candidateId === candidateId,
    ) ?? null
  );
}
