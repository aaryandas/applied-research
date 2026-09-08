import { describe, expect, it } from 'vitest';
import {
  CURATED_SOURCE_MANIFEST,
  CURATION_LINK_ONLY_CATEGORIES,
} from './curated-manifest.js';

describe('curated source manifest', () => {
  it('records explicit eligibility and release-specific provenance', () => {
    expect(CURATED_SOURCE_MANIFEST).toHaveLength(1);
    const entry = CURATED_SOURCE_MANIFEST[0];
    expect(entry).toMatchObject({
      publisher: 'Python Software Foundation',
      version: '3.14.7',
      acquisitionUrl:
        'https://docs.python.org/release/3.14.7/tutorial/floatingpoint.html',
      sourceBytes: 44_964,
      eligibility: { status: 'eligible', basis: 'license' },
      canonicalization: {
        extraction: { coverage: 'complete' },
      },
      license: {
        spdxId: 'PSF-2.0',
        fullLicenseUrl: 'https://docs.python.org/3.14/license.html',
      },
    });
    expect(entry?.sourceBytesSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(entry?.canonicalTextSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(entry?.canonicalization.changeSummary).not.toHaveLength(0);
  });

  it('does not make linked or unrelated publisher content corpus-eligible', () => {
    const entry = CURATED_SOURCE_MANIFEST[0];
    expect(entry?.eligibility.exactScope).toContain('single official');
    expect(entry?.exclusions.join(' ')).toContain('link-only');
    expect(entry?.exclusions.join(' ')).toContain('No course, curriculum');
    expect(CURATION_LINK_ONLY_CATEGORIES).toHaveLength(3);
  });
});
