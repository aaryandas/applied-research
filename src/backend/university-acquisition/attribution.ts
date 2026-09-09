import type { AttributionRecord, LicenseComponent } from './types.js';

export const MIT_ABSTRACTION_SOURCE_SHA256 =
  'de5547cb64a7bb0e7e860189d9116f4e036bba9816a727c91be28e820f84c1e4';
export const MIT_ABSTRACTION_SOURCE_BYTES = 24_463;
export const MIT_LICENSE_SHA256 =
  'a4576a2e28d3c1db63c68c8d1878f073e725b8607a2dfb2aae4b37abf37a5b29';
export const MIT_LICENSE_BYTES = 308;
export const DELFT_INTRODUCTION_SHA256 =
  '0554cb267322bfb6034bcbad4c1993d8a6df1502eb05bd794bc915891d1b71da';
export const DELFT_INTRODUCTION_BYTES = 120_676;
export const DELFT_CREDITS_SHA256 =
  '82409edafc57a671a893f440b1058fc6f1a97e0d72e943952a64cb63c8d5c802';
export const DELFT_CREDITS_BYTES = 3_790;
export const DELFT_CONFIG_SHA256 =
  '16c9f07d98b93cf49c7bdc45aec049608ef6c2bc8c2f04a7fb40808208ff1c66';
export const DELFT_CONFIG_BYTES = 4_853;
export const MIT_COMPUTATIONAL_THINKING_COMMIT =
  '78f1369deaa1994515e88bb164cc07a94d12f7bd';
export const DELFT_QUANTUM_SOURCE_COMMIT =
  'f7170416f82825c81bd482820f9f5530ab6f3930';

const MIT_TEXT_LICENSE: LicenseComponent = {
  appliesTo: 'text',
  name: 'Creative Commons Attribution-ShareAlike 4.0 International',
  spdxId: 'CC-BY-SA-4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  shareAlike: true,
  additionalRestrictions: [],
};

const MIT_CODE_LICENSE: LicenseComponent = {
  appliesTo: 'code',
  name: 'MIT License',
  spdxId: 'MIT',
  url: 'https://opensource.org/licenses/MIT',
  shareAlike: false,
  additionalRestrictions: ['Retain the MIT copyright and permission notice.'],
};

const CC_BY_4: LicenseComponent = {
  appliesTo: 'text',
  name: 'Creative Commons Attribution 4.0 International',
  spdxId: 'CC-BY-4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
  shareAlike: false,
  additionalRestrictions: [],
};

export const MIT_ABSTRACTION_ATTRIBUTION: AttributionRecord = {
  authors: ['Alan Edelman', 'David P. Sanders', 'Fons van der Plas'],
  copyrightHolders: ['Alan Edelman', 'David P. Sanders', 'Fons van der Plas'],
  title: 'Abstraction — Introduction to Computational Thinking, Fall 2024',
  edition: 'Fall 2024',
  sourceCommit: MIT_COMPUTATIONAL_THINKING_COMMIT,
  originalUrl:
    'https://computationalthinking.mit.edu/Fall24/images_abstractions/abstraction/',
  acquisitionUrl: `https://raw.githubusercontent.com/mitmath/computational-thinking/${MIT_COMPUTATIONAL_THINKING_COMMIT}/src/images_abstractions/abstraction.jl`,
  licenseComponents: [MIT_TEXT_LICENSE, MIT_CODE_LICENSE],
  licenseEvidenceUrl: `https://raw.githubusercontent.com/mitmath/computational-thinking/${MIT_COMPUTATIONAL_THINKING_COMMIT}/LICENSE.md`,
  licenseEvidenceSha256: MIT_LICENSE_SHA256,
  exceptions: [
    'External images and YouTube embeds are omitted; they are not licensed by the repository text or code grants.',
    'This independently licensed repository is not MIT OCW and is not covered by OCW CC BY-NC-SA.',
  ],
  transformationSummary: [
    'Decoded exact UTF-8 Pluto source without evaluating Julia, macros, interpolation, widgets, or package manifests.',
    'Selected static Markdown/text and literal code cells in notebook Cell-order display order.',
    'Preserved original Markdown and code whitespace; wrapped selected code in Markdown fences for the markdown canonical form.',
    'Omitted TOML/runtime cells, remote download calls, @bind widgets, frontmatter media, and unsupported images/YouTube.',
  ],
  compatibleExportObligations: [
    'ShareAlike text adaptations must remain under CC BY-SA 4.0 or a compatible license, retain attribution, and not add extra restrictions on those rights.',
    'Selected code must retain the MIT copyright notice and permission text.',
    'Do not describe the notebook as a complete lesson or as executed output.',
  ],
};

export const DELFT_QUANTUM_ATTRIBUTION: AttributionRecord = {
  authors: ['Timon Idema'],
  copyrightHolders: ['Delft University of Technology'],
  title:
    'Matter: quantization of (angular) momentum — Introduction to Quantum Mechanics',
  edition:
    'Pinned GitLab source f7170416; later published revision 1.4.1 is not this byte snapshot',
  sourceCommit: DELFT_QUANTUM_SOURCE_COMMIT,
  originalUrl:
    'https://interactivetextbooks.tudelft.nl/introduction-to-quantum-mechanics/content/introduction.html',
  acquisitionUrl: `https://gitlab.tudelft.nl/opentextbooks/quantum-mechanics-for-nanobiology/-/raw/${DELFT_QUANTUM_SOURCE_COMMIT}/content/introduction.md`,
  licenseComponents: [CC_BY_4],
  licenseEvidenceUrl: `https://gitlab.tudelft.nl/opentextbooks/quantum-mechanics-for-nanobiology/-/raw/${DELFT_QUANTUM_SOURCE_COMMIT}/content/credits.md`,
  licenseEvidenceSha256: DELFT_CREDITS_SHA256,
  exceptions: [
    'Hydrogen-spectrum imagery credited CC BY-SA 3.0 is excluded.',
    'xkcd cartoon credited CC BY-NC-SA 2.5 is excluded.',
    'Unsplash cover imagery is excluded.',
    'General CC BY 4.0 on the text does not grant those third-party assets.',
  ],
  transformationSummary: [
    'Decoded exact UTF-8 MyST Markdown without executing directives, interpolation, or notebooks.',
    'Selected original lines 52-128 plus mathematical footnote 6.',
    'Preserved TeX, equation labels, section names, and code/table syntax where present in the slice.',
    'Unknown directives, unresolved cross-references, and media remain explicit gaps.',
  ],
  compatibleExportObligations: [
    'Retain attribution to T. Idema, TU Delft Open (2025), and Delft University of Technology copyright.',
    'Retain the CC BY 4.0 notice and a change notice for adapted text.',
    'Do not claim the published 2025 HTML bytes are identical to this GitLab snapshot.',
  ],
};

export const BCCAMPUS_SQL_ATTRIBUTION: AttributionRecord = {
  authors: ['Adrienne Watt', 'Nelson Eng'],
  copyrightHolders: ['Adrienne Watt', 'Nelson Eng'],
  title: 'SQL Structured Query Language — Database Design, 2nd edition',
  edition:
    'Version history latest listed 1.4 (2022-01-27); original bytes not acquired',
  sourceCommit: null,
  originalUrl:
    'https://opentextbc.ca/dbdesign01/chapter/sql-structured-query-language/',
  acquisitionUrl:
    'https://opentextbc.ca/dbdesign01/chapter/sql-structured-query-language/',
  licenseComponents: [CC_BY_4],
  licenseEvidenceUrl: 'https://opentextbc.ca/dbdesign01/',
  licenseEvidenceSha256: null,
  exceptions: [
    'Noted book assets remain excepted until original bytes and attribution are verified.',
    'Images are excluded.',
    'Web-tool readable copies are not original bytes and must not become canonical hashes.',
  ],
  transformationSummary: [],
  compatibleExportObligations: [
    'If original bytes are later acquired, retain author, copyright, license, and free-source link before activation.',
  ],
};
