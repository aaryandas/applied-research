import { ACQUISITION_CANONICALIZATION_VERSION } from '../acquisition/types.js';
import {
  PARSE5_LICENSE,
  SUPPORTED_PARSE5_VERSION,
} from '../acquisition/parse5-tree.js';

export interface CuratedSourceManifestEntry {
  id: string;
  sourceId: string;
  title: string;
  kind: 'chapter';
  publisher: string;
  authorAttribution: readonly string[];
  version: string;
  landingUrl: string;
  acquisitionUrl: string;
  acquiredAt: string;
  sourceBytes: number;
  sourceBytesSha256: string;
  canonicalTextSha256: string;
  license: {
    name: string;
    spdxId: string;
    pageLicenseUrl: string;
    fullLicenseUrl: string;
    evidenceBytesSha256: string;
    copyrightNotice: string;
    codeExamplesAdditionalLicense: {
      name: string;
      spdxId: string;
    };
  };
  eligibility: {
    status: 'eligible';
    basis: 'license';
    approvedUses: readonly ['acquire', 'canonicalize', 'segment', 'index'];
    exactScope: string;
    conditions: readonly string[];
  };
  canonicalization: {
    version: typeof ACQUISITION_CANONICALIZATION_VERSION;
    parser: {
      name: 'parse5';
      version: typeof SUPPORTED_PARSE5_VERSION;
      license: typeof PARSE5_LICENSE;
    };
    extraction: {
      method: string;
      coverage: 'complete' | 'partial';
      note: string;
    };
    changeSummary: readonly string[];
  };
  exclusions: readonly string[];
}

export const CURATION_LINK_ONLY_CATEGORIES = [
  'MIT OpenCourseWare pending a source-specific permission review',
  'non-commercial licensed material pending an approved use-policy decision',
  'third-party publisher content without source-specific license evidence',
] as const;

export const CURATED_SOURCE_MANIFEST: readonly CuratedSourceManifestEntry[] = [
  {
    id: 'python-floating-point-3-14-7',
    sourceId: 'curated_python_floating_point_3_14_7',
    title: 'Floating-Point Arithmetic: Issues and Limitations',
    kind: 'chapter',
    publisher: 'Python Software Foundation',
    authorAttribution: ['Python Software Foundation'],
    version: '3.14.7',
    landingUrl: 'https://docs.python.org/3.14/tutorial/floatingpoint.html',
    acquisitionUrl:
      'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
    acquiredAt: '2026-09-08T20:57:15.222Z',
    sourceBytes: 44_964,
    sourceBytesSha256:
      '3e30be2b838466b39de0ef64c15d5dbee765454362fca983900310c560ad64a7',
    canonicalTextSha256:
      '2d1e157d0f663e71b9abef9c8e22c2b1059222633b0d85d9f6feb596e109fd20',
    license: {
      name: 'Python Software Foundation License Version 2',
      spdxId: 'PSF-2.0',
      pageLicenseUrl:
        'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
      fullLicenseUrl: 'https://docs.python.org/3.14/license.html',
      evidenceBytesSha256:
        '5b41b1f2ada61628ca9d7f6e5e3c72ee3808b561979500fa77e5cef6519d43f4',
      copyrightNotice:
        'Copyright © 2001 Python Software Foundation; All Rights Reserved',
      codeExamplesAdditionalLicense: {
        name: 'Zero-Clause BSD License',
        spdxId: '0BSD',
      },
    },
    eligibility: {
      status: 'eligible',
      basis: 'license',
      approvedUses: ['acquire', 'canonicalize', 'segment', 'index'],
      exactScope:
        'The single official Python 3.14.7 Floating-Point Arithmetic tutorial page.',
      conditions: [
        'Retain the Python Software Foundation License Version 2 reference.',
        'Retain the Python Software Foundation copyright notice.',
        'Retain this canonicalization change summary with the derived text.',
      ],
    },
    canonicalization: {
      version: ACQUISITION_CANONICALIZATION_VERSION,
      parser: {
        name: 'parse5',
        version: SUPPORTED_PARSE5_VERSION,
        license: PARSE5_LICENSE,
      },
      extraction: {
        method: 'structured-html-v1 (parse5 8.0.1)',
        coverage: 'complete',
        note: 'Executable, navigation, form, style, and embedded media elements were excluded.',
      },
      changeSummary: [
        'Decoded the exact response bytes as strict UTF-8 and parsed HTML without script execution.',
        'Selected the semantic role=main reading subtree and excluded navigation, forms, scripts, styles, and embedded media.',
        'Decoded HTML entities, normalized rendered-flow whitespace and line endings, preserved preformatted code whitespace, and separated content blocks with two LF characters.',
        'Stored the page license, full-license URL, copyright notice, byte hash, and this summary outside the canonical reading text.',
      ],
    },
    exclusions: [
      'Linked third-party pages are link-only and were not fetched, copied, licensed, or made corpus-eligible.',
      'MIT OpenCourseWare and non-commercial licensed material remain link-only pending separate review.',
      'No course, curriculum, or topic restriction is implied by this acceptance asset.',
    ],
  },
];
