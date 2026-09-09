import {
  CS231N_CASE_STUDY_ATTRIBUTION,
  CS231N_CASE_STUDY_BYTES,
  CS231N_CASE_STUDY_SHA256,
  CS231N_LICENSE_BYTES,
  CS231N_LICENSE_SHA256,
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
  HTML_EXTRACTION_METHOD,
  MYST_EXTRACTION_METHOD,
  PLUTO_EXTRACTION_METHOD,
  freezeUniversityValue,
  type PinnedUniversitySource,
  type UniversityCandidate,
} from './types.js';

export const UNIVERSITY_CANDIDATE_IDS = {
  mitAbstraction: 'univ_mit_ct_abstr',
  delftQuantization: 'univ_tudelft_qm_em',
  stanfordCs231nCaseStudy: 'univ_stan_cs231n_nncs',
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
      authors: MIT_ABSTRACTION_ATTRIBUTION.authors,
      originalUrl: MIT_ABSTRACTION_ATTRIBUTION.originalUrl,
      acquisitionUrl: MIT_ABSTRACTION_ATTRIBUTION.acquisitionUrl,
      licenseEvidenceUrl: MIT_ABSTRACTION_ATTRIBUTION.licenseEvidenceUrl,
      format: 'pluto-static',
      topicTags: ['computational-thinking', 'julia', 'abstraction'],
      metadataSummary:
        'Learn how images become abstractions in MIT Introduction to Computational Thinking, with static Julia and Markdown from the official Fall 2024 Abstraction lesson.',
      relationships: [],
      license: {
        status: 'known',
        name: 'Creative Commons Attribution-ShareAlike 4.0 International',
        spdxId: 'CC-BY-SA-4.0',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      },
      reachability: 'reachable-pinned',
      permission: 'hash-verified',
      extraction: 'pending',
      indexing: 'not-indexed',
    },
    {
      id: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      sourceId: UNIVERSITY_CANDIDATE_IDS.delftQuantization,
      title: DELFT_QUANTUM_ATTRIBUTION.title,
      kind: 'chapter',
      institution: 'Delft University of Technology',
      courseCode: 'Introduction to Quantum Mechanics',
      authors: DELFT_QUANTUM_ATTRIBUTION.authors,
      originalUrl: DELFT_QUANTUM_ATTRIBUTION.originalUrl,
      acquisitionUrl: DELFT_QUANTUM_ATTRIBUTION.acquisitionUrl,
      licenseEvidenceUrl: DELFT_QUANTUM_ATTRIBUTION.licenseEvidenceUrl,
      format: 'myst-markdown',
      topicTags: ['quantum-mechanics', 'physics', 'quantization'],
      metadataSummary:
        'Study quantization of angular momentum, including TeX and the photon-momentum footnote, from TU Delft Introduction to Quantum Mechanics.',
      relationships: [],
      license: {
        status: 'known',
        name: 'Creative Commons Attribution 4.0 International',
        spdxId: 'CC-BY-4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      },
      reachability: 'reachable-pinned',
      permission: 'hash-verified',
      extraction: 'pending',
      indexing: 'not-indexed',
    },
    {
      id: UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
      sourceId: UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
      title: CS231N_CASE_STUDY_ATTRIBUTION.title,
      kind: 'chapter',
      institution: 'Stanford University',
      courseCode: 'CS231n',
      authors: CS231N_CASE_STUDY_ATTRIBUTION.authors,
      originalUrl: CS231N_CASE_STUDY_ATTRIBUTION.originalUrl,
      acquisitionUrl: CS231N_CASE_STUDY_ATTRIBUTION.acquisitionUrl,
      licenseEvidenceUrl: CS231N_CASE_STUDY_ATTRIBUTION.licenseEvidenceUrl,
      format: 'html',
      topicTags: [
        'neural-networks',
        'computer-vision',
        'linear-classifier',
        'backpropagation',
        'numpy',
      ],
      metadataSummary:
        'Walk through a linear softmax classifier and then a two-layer neural network in Python/NumPy, with the math used to train both on a toy spiral dataset.',
      relationships: [
        {
          kind: 'chapter-of-course',
          parentSourceId: 'univ_stan_cs231n',
          parentProviderIds: [
            { provider: 'curated-catalog', id: 'univ_stan_cs231n' },
          ],
        },
      ],
      license: {
        status: 'known',
        name: 'MIT License',
        spdxId: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      reachability: 'reachable-pinned',
      permission: 'hash-verified',
      extraction: 'pending',
      indexing: 'not-indexed',
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
    {
      candidateId: UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
      sourceId: UNIVERSITY_CANDIDATE_IDS.stanfordCs231nCaseStudy,
      format: 'html',
      source: {
        url: CS231N_CASE_STUDY_ATTRIBUTION.acquisitionUrl ?? '',
        bytes: CS231N_CASE_STUDY_BYTES,
        sha256: CS231N_CASE_STUDY_SHA256,
      },
      license: {
        url: CS231N_CASE_STUDY_ATTRIBUTION.licenseEvidenceUrl ?? '',
        bytes: CS231N_LICENSE_BYTES,
        sha256: CS231N_LICENSE_SHA256,
      },
      extraEvidence: [],
      attribution: CS231N_CASE_STUDY_ATTRIBUTION,
      extraction: {
        method: HTML_EXTRACTION_METHOD,
        slice: null,
        includeFootnotes: [],
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
