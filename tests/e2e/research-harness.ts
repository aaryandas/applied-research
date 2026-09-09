import { createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import type { MetadataOnlySource } from '../../src/contracts/sourcing';
import type { ResearchEntryProps } from '../../src/renderer/research/research-contract';
import '../../src/renderer/styles.css';

const componentUrl = '/src/renderer/research/ResearchEntry.tsx';
const { ResearchEntry }: { ResearchEntry: ComponentType<ResearchEntryProps> } =
  await import(/* @vite-ignore */ componentUrl);

const paper: MetadataOnlySource = {
  sourceId: 'openalex_W123',
  kind: 'paper',
  title:
    'Learning through retrieval practice: how recalling an idea changes what we remember and how we use it in an unfamiliar setting',
  authorship: { kind: 'authored', creators: ['Ada Example', 'Sam Example'] },
  providerIds: [{ provider: 'openalex', id: 'W123' }],
  scholarlyIdentity: { doi: '10.1234/synthetic-example', arxivId: null },
  originalLocation: {
    url: 'https://example.org/synthetic-paper',
    trust: 'untrusted-public-url',
  },
  acquisitionLocation: {
    url: 'https://example.org/synthetic-paper.txt',
    trust: 'untrusted-public-url',
  },
  publicationDate: '2024-01-12',
  discoveredAt: '2026-09-08T18:00:00Z',
  metadataSummary:
    'Synthetic abstract for interaction testing. Learners recall ideas and apply them in a changed situation; this fixture makes no claim about research evidence.',
  relationships: [
    {
      kind: 'paper-associated-with-course',
      parentSourceId: 'synthetic-course',
      parentProviderIds: [
        { provider: 'mit-open-courseware', id: 'synthetic-course' },
      ],
    },
  ],
  usePolicy: {
    access: 'public',
    accessEvidenceUrl: null,
    license: {
      status: 'known',
      name: 'Synthetic fixture permission',
      spdxId: null,
      url: null,
    },
    acquisition: {
      status: 'permitted',
      basis: 'owner-permission',
      evidenceUrl: 'https://example.org/fixture',
    },
    indexing: { status: 'forbidden', reason: 'Test fixture only' },
  },
  content: { state: 'metadata-only' },
};

const props: ResearchEntryProps = {
  context: {
    projectId: 'synthetic-project',
    origin: {
      path: {
        pathId: 'synthetic-path',
        pathRevision: 1,
        topicId: 'synthetic-topic',
      },
    },
  },
  initialQuestion:
    'How can I use retrieval practice while learning something new?',
  onDiscover: async (request, operation) => {
    if (request.query === 'cancel this search') {
      return new Promise((resolve) =>
        operation.signal.addEventListener(
          'abort',
          () =>
            resolve({
              outcome: 'cancelled',
              requestId: request.requestId,
              message: 'The sourcing request was cancelled.',
            }),
          { once: true },
        ),
      );
    }
    if (request.query === 'no results')
      return {
        outcome: 'no-results',
        requestId: request.requestId,
        message: 'No source candidates were found.',
      };
    if (request.query === 'unavailable')
      return {
        outcome: 'unavailable',
        requestId: request.requestId,
        message: 'The sourcing operation is unavailable.',
        retryable: true,
      };
    return {
      outcome: 'partial',
      requestId: request.requestId,
      candidates: [
        paper,
        {
          ...paper,
          sourceId: 'openalex_W124',
          title: 'A catalog reference with no readable text',
          providerIds: [{ provider: 'openalex', id: 'W124' }],
          acquisitionLocation: null,
          metadataSummary: null,
          relationships: [],
          usePolicy: {
            ...paper.usePolicy,
            access: 'subscription-required',
            acquisition: { status: 'forbidden', reason: 'Permission required' },
          },
        },
      ],
      issues: [
        {
          provider: 'mit-open-courseware',
          reason: 'unavailable',
          retryAfterMilliseconds: null,
        },
      ],
    };
  },
  onAcquireAndSave: async (request) => ({
    outcome: 'saved',
    requestId: request.requestId,
    saved: {
      projectId: 'synthetic-project',
      sourceId: 'local-synthetic-paper',
      revisionId: 'local-original-v2',
    },
    source: {
      ...paper,
      content: {
        state: 'acquired',
        revision: {
          sourceId: paper.sourceId,
          revisionId: 'remote-v2',
          title: paper.title,
          canonicalText: 'Synthetic source content for the contract fixture.',
          sha256: 'a'.repeat(64),
          format: 'plain-text',
          canonicalizationVersion: 'plain-text-v1',
          acquiredAt: '2026-09-08T19:00:00Z',
          provenance: {
            kind: 'discovered',
            acquiredFromUrl: 'https://example.org/synthetic-paper.txt',
            providerIdentity: { provider: 'openalex', id: 'W123' },
            discoveredAt: paper.discoveredAt,
          },
          extraction: {
            method: 'synthetic-fixture',
            coverage: 'partial',
            note: 'Only a synthetic excerpt is available in this contract fixture.',
          },
        },
      },
    },
  }),
  onOpenReader: async (target) => {
    const receipt = document.getElementById('reader-target');
    if (receipt) receipt.textContent = JSON.stringify(target);
    return 'blocked';
  },
  onOpenOriginal: async () => 'unavailable',
};

const root = document.getElementById('root');
if (!root) throw new Error('The research fixture root is missing.');
createRoot(root).render(
  createElement(
    'div',
    null,
    createElement(
      'aside',
      { 'aria-label': 'Fixture disclosure' },
      'Synthetic component adapter — no provider, persistence or Reader integration.',
    ),
    createElement(ResearchEntry, props),
    createElement('output', {
      id: 'reader-target',
      'aria-label': 'Synthetic Reader target',
      hidden: true,
    }),
  ),
);
