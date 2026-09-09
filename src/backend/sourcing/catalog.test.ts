import { describe, expect, it } from 'vitest';
import {
  SOURCING_API_VERSION,
  type DiscoverSourcesRequest,
  type MetadataOnlySource,
} from '../../contracts/sourcing.js';
import { parseDiscoverSourcesResponse } from './contract-validation.js';
import {
  composeCatalogSources,
  discoverStarterCatalog,
  OFFICIAL_LINK_ONLY_SOURCES,
  STARTER_CATALOG_LIMITATIONS,
  STARTER_CATALOG_SOURCES,
} from './catalog.js';

describe('permission-verified starter catalog', () => {
  it('round-trips discovery metadata without treating it as full text', () => {
    const request: DiscoverSourcesRequest = {
      apiVersion: SOURCING_API_VERSION,
      requestId: 'catalog-01',
      query: 'floating algorithms physics',
      intent: 'learning',
      kinds: ['chapter', 'textbook', 'course', 'paper', 'lecture'],
      limit: 20,
    };
    const candidates = discoverStarterCatalog(request);
    expect(candidates.length).toBeGreaterThan(1);
    const parsed = parseDiscoverSourcesResponse(
      { outcome: 'success', requestId: request.requestId, candidates },
      { ...request, kinds: [...request.kinds] },
    );
    expect(parsed.outcome).toBe('success');
    expect(
      STARTER_CATALOG_LIMITATIONS.some((item) => item.includes('PDF')),
    ).toBe(true);
  });

  it('does not default to BCcampus acquisition grants and keeps official links discoverable', () => {
    expect(
      STARTER_CATALOG_SOURCES.some((source) =>
        source.sourceId.includes('bccampus'),
      ),
    ).toBe(false);
    expect(
      composeCatalogSources().some((source) =>
        source.sourceId.includes('bccampus'),
      ),
    ).toBe(false);
    const python = STARTER_CATALOG_SOURCES.find((source) =>
      source.sourceId.includes('python'),
    );
    expect(python?.usePolicy.indexing.status).toBe('permitted');
    for (const sourceId of [
      'mit_ocw_6_006',
      'mit_ocw_18_06',
      'openstax_university_physics',
    ]) {
      const source = OFFICIAL_LINK_ONLY_SOURCES.find(
        (item) => item.sourceId === sourceId,
      );
      expect(source?.usePolicy.indexing.status).toBe('forbidden');
      expect(source?.usePolicy.acquisition.status).toBe('forbidden');
      expect(source?.acquisitionLocation).toBeNull();
      expect(source?.originalLocation.url).toMatch(/^https:\/\//);
    }
  });

  it('injects an optional university MetadataOnlySource[] ahead of shared defaults', () => {
    const injected: MetadataOnlySource = {
      ...OFFICIAL_LINK_ONLY_SOURCES[0]!,
      sourceId: 'univ_injected_cs231n',
      title: 'Injected university lecture',
      providerIds: [
        { provider: 'curated-catalog', id: 'univ_injected_cs231n' },
      ],
    };
    const sources = composeCatalogSources([injected]);
    expect(sources[0]?.sourceId).toBe('univ_injected_cs231n');
    expect(
      discoverStarterCatalog({
        query: 'university lecture',
        kinds: ['course'],
        limit: 5,
        sources,
      }).some((source) => source.sourceId === 'univ_injected_cs231n'),
    ).toBe(true);
  });
});
