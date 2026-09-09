import { describe, expect, it } from 'vitest';
import {
  SOURCING_API_VERSION,
  type DiscoverSourcesRequest,
} from '../../contracts/sourcing.js';
import { parseDiscoverSourcesResponse } from './contract-validation.js';
import {
  discoverStarterCatalog,
  STARTER_CATALOG_LIMITATIONS,
  STARTER_CATALOG_SOURCES,
} from './catalog.js';

describe('permission-verified starter catalog', () => {
  it('round-trips discovery metadata without treating it as full text', () => {
    const request: DiscoverSourcesRequest = {
      apiVersion: SOURCING_API_VERSION,
      requestId: 'catalog-01',
      query: 'database sql algorithms physics',
      intent: 'learning',
      kinds: ['chapter', 'textbook', 'course', 'paper', 'lecture'],
      limit: 20,
    };
    const candidates = discoverStarterCatalog(request);
    expect(candidates.length).toBeGreaterThan(3);
    const parsed = parseDiscoverSourcesResponse(
      { outcome: 'success', requestId: request.requestId, candidates },
      { ...request, kinds: [...request.kinds] },
    );
    expect(parsed.outcome).toBe('success');
    expect(
      STARTER_CATALOG_LIMITATIONS.some((item) => item.includes('PDF')),
    ).toBe(true);
  });

  it('permits reviewed BCcampus HTML chapters and forbids MIT OCW and OpenStax indexing', () => {
    const chapters = STARTER_CATALOG_SOURCES.filter((source) =>
      source.sourceId.startsWith('bccampus_database_design_2e_ch'),
    );
    expect(chapters).toHaveLength(2);
    expect(
      chapters.every(
        (source) =>
          source.usePolicy.acquisition.status === 'permitted' &&
          source.usePolicy.indexing.status === 'permitted' &&
          source.acquisitionLocation !== null,
      ),
    ).toBe(true);
    const book = STARTER_CATALOG_SOURCES.find(
      (source) => source.sourceId === 'bccampus_database_design_2e',
    );
    expect(book?.usePolicy.acquisition.status).toBe('forbidden');
    expect(book?.usePolicy.indexing.status).toBe('forbidden');
    for (const sourceId of [
      'mit_ocw_6_006',
      'mit_ocw_18_06',
      'openstax_university_physics',
    ]) {
      const source = STARTER_CATALOG_SOURCES.find(
        (item) => item.sourceId === sourceId,
      );
      expect(source?.usePolicy.indexing.status).toBe('forbidden');
      expect(source?.acquisitionLocation).toBeNull();
      expect(source?.metadataSummary).toMatch(/link/i);
    }
    const otl = STARTER_CATALOG_SOURCES.find(
      (source) => source.sourceId === 'otl_database_design_2e',
    );
    expect(otl?.usePolicy.license).toMatchObject({ spdxId: 'CC0-1.0' });
    expect(otl?.usePolicy.indexing.status).toBe('forbidden');
  });
});
