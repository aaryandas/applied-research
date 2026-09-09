import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import type {
  LearningRequest,
  SourceRevisionInput,
} from '../contracts/learning-api.js';
import {
  buildProviderBody,
  makeOpenRouterProvider,
  parseProviderContribution,
  reservationMicrousdFor,
} from './provider.js';
import { MAX_REQUEST_BYTES } from './policy.js';

const source: SourceRevisionInput = {
  sourceId: 'source-01',
  revisionId: 'revision-01',
  title: 'Unicode source',
  canonicalText: 'A😀B explains the concept.',
  sha256: 'a'.repeat(64),
  format: 'plain-text',
  canonicalizationVersion: 'version-01',
  acquiredAt: '2026-09-08T00:00:00.000Z',
  provenance: { kind: 'human-imported', locator: null },
};
const tutorRequest: LearningRequest = {
  apiVersion: '2026-09-08',
  requestId: 'request-01',
  model: 'google/gemini-3.8-flash',
  operation: {
    kind: 'source-grounded-tutor',
    question: 'What does the emoji stand for?',
    sources: [source],
    learnerContext: [],
  },
};
const tutorContent = {
  kind: 'source-grounded-tutor',
  body: 'The source uses an emoji.',
  nextAction: 'Explain it in your own words.',
  citations: [
    {
      sourceId: source.sourceId,
      revisionId: source.revisionId,
      start: 1,
      end: 3,
      quote: '😀',
    },
  ],
};

function completion(content: unknown = tutorContent): object {
  return {
    id: 'generation-01',
    model: tutorRequest.model,
    choices: [
      {
        finish_reason: 'stop',
        message: { content: JSON.stringify(content) },
      },
    ],
    usage: { cost: 0.0000012 },
  };
}

describe('OpenRouter provider boundary', () => {
  it('builds a bounded structured request without search, tools, or fallback', () => {
    const body = JSON.parse(buildProviderBody(tutorRequest));
    expect(body).toMatchObject({
      model: tutorRequest.model,
      max_tokens: 2048,
      reasoning: { effort: 'low', exclude: true },
      provider: {
        only: ['google-ai-studio'],
        allow_fallbacks: false,
        require_parameters: true,
        max_price: { prompt: 0.75, completion: 3.75, request: 0 },
      },
      response_format: { type: 'json_schema' },
    });
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('plugins');
    expect(body).not.toHaveProperty('usage');
    expect(body.messages[0].content).toContain('untrusted reference');
  });

  it('derives admission cost from the full serialized payload and bounded output', () => {
    const escapedCanonicalText = '"\\'.repeat(14_500);
    const expensiveSerialization: LearningRequest = {
      ...tutorRequest,
      operation: {
        kind: 'source-grounded-tutor',
        question: '"\\'.repeat(1_000),
        sources: [
          {
            ...source,
            canonicalText: escapedCanonicalText,
            sha256: createHash('sha256')
              .update(escapedCanonicalText)
              .digest('hex'),
          },
        ],
        learnerContext: [],
      },
    };
    const serializedBytes = Buffer.byteLength(
      buildProviderBody(expensiveSerialization),
      'utf8',
    );
    const expected = Math.ceil(serializedBytes * 0.75 + 3_072 * 3.75);
    expect(reservationMicrousdFor(expensiveSerialization)).toBe(expected);
    expect(
      reservationMicrousdFor(expensiveSerialization),
    ).toBeGreaterThanOrEqual(Math.ceil(serializedBytes * 0.75 + 2_048 * 3.75));
    expect(
      Buffer.byteLength(JSON.stringify(expensiveSerialization)),
    ).toBeLessThanOrEqual(MAX_REQUEST_BYTES);
    expect(serializedBytes).toBeGreaterThan(48_000);
  });

  it('validates exact JavaScript UTF-16 citation offsets and charged usage', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(completion()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await Effect.runPromise(
      makeOpenRouterProvider('synthetic-key', request).complete(tutorRequest),
    );
    expect(result.actualMicrousd).toBe(2);
    expect(result.contribution).toEqual(tutorContent);
    expect(request).toHaveBeenCalledTimes(1);
    const options = request.mock.calls[0]?.[1];
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer synthetic-key',
      'Content-Type': 'application/json',
    });
    expect(options?.body).not.toContain('synthetic-key');
  });

  it.each([
    {
      ...tutorContent,
      citations: [{ ...tutorContent.citations[0], end: 2 }],
    },
    { ...tutorContent, recipe: { name: 'execute-code' } },
    { ...tutorContent, citations: [] },
    { kind: 'unexpected' },
  ])(
    'rejects unsupported output and retains its known charge',
    async (content) => {
      const provider = makeOpenRouterProvider(
        'synthetic-key',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify(completion(content)), { status: 200 }),
          ),
      );
      const failure = await Effect.runPromise(
        Effect.flip(provider.complete(tutorRequest)),
      );
      expect(failure).toMatchObject({
        _tag: 'ProviderFailure',
        charge: { kind: 'known', actualMicrousd: 2 },
      });
    },
  );

  it.each([
    { ...tutorContent, body: 'bad\uD800text' },
    { ...tutorContent, nextAction: 'bad\u0000text' },
    {
      ...tutorContent,
      citations: [{ ...tutorContent.citations[0], start: 2 }],
    },
  ])(
    'rejects non-scalar provider text with a known charge',
    async (content) => {
      const provider = makeOpenRouterProvider(
        'synthetic-key',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify(completion(content)), { status: 200 }),
          ),
      );
      const failure = await Effect.runPromise(
        Effect.flip(provider.complete(tutorRequest)),
      );
      expect(failure.charge).toEqual({ kind: 'known', actualMicrousd: 2 });
    },
  );

  it('rejects generated tool calls and unknown-cost malformed envelopes', async () => {
    const malformed = completion();
    const choice = (malformed as { choices: Array<{ message: object }> })
      .choices[0];
    if (choice) choice.message = { ...choice.message, tool_calls: [] };
    delete (malformed as { usage?: unknown }).usage;
    const provider = makeOpenRouterProvider(
      'synthetic-key',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify(malformed), { status: 200 }),
        ),
    );
    const failure = await Effect.runPromise(
      Effect.flip(provider.complete(tutorRequest)),
    );
    expect(failure.charge).toEqual({ kind: 'unknown' });
  });

  it('rejects a PostgreSQL-incompatible provider request id with known cost', async () => {
    const invalid = { ...completion(), id: 'generation\u0000invalid' };
    const provider = makeOpenRouterProvider(
      'synthetic-key',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify(invalid), { status: 200 }),
        ),
    );
    const failure = await Effect.runPromise(
      Effect.flip(provider.complete(tutorRequest)),
    );
    expect(failure.charge).toEqual({ kind: 'known', actualMicrousd: 2 });
  });

  it.each(['not-json', 'x'.repeat(128 * 1024 + 1)])(
    'rejects malformed or oversized provider bytes with unknown cost',
    async (body) => {
      const provider = makeOpenRouterProvider(
        'synthetic-key',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(body, { status: 200 })),
      );
      const failure = await Effect.runPromise(
        Effect.flip(provider.complete(tutorRequest)),
      );
      expect(failure).toMatchObject({
        _tag: 'ProviderFailure',
        charge: { kind: 'unknown' },
      });
    },
  );

  it('rejects malformed provider UTF-8 instead of accepting replacement text', async () => {
    const provider = makeOpenRouterProvider(
      'synthetic-key',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(new Uint8Array([0xff]), { status: 200 }),
        ),
    );
    const failure = await Effect.runPromise(
      Effect.flip(provider.complete(tutorRequest)),
    );
    expect(failure.charge).toEqual({ kind: 'unknown' });
  });

  it.each([
    [400, 'none'],
    [429, 'none'],
    [408, 'unknown'],
    [500, 'unknown'],
  ] as const)(
    'classifies HTTP %s charge certainty as %s',
    async (status, kind) => {
      const provider = makeOpenRouterProvider(
        'synthetic-key',
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('private', { status })),
      );
      const failure = await Effect.runPromise(
        Effect.flip(provider.complete(tutorRequest)),
      );
      expect(failure.charge.kind).toBe(kind);
      expect(failure.message).not.toContain('private');
    },
  );

  it('cancels the upstream response when its body exceeds the byte bound', async () => {
    let resolveClosed: (() => void) | undefined;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    const upstream = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      const interval = setInterval(() => response.write('x'.repeat(8_192)), 1);
      response.once('close', () => {
        clearInterval(interval);
        resolveClosed?.();
      });
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') {
      throw new Error('Synthetic upstream did not bind.');
    }
    try {
      const provider = makeOpenRouterProvider(
        'synthetic-key',
        (_url, init) =>
          fetch(`http://127.0.0.1:${address.port}`, init) as ReturnType<
            typeof fetch
          >,
      );
      const failure = await Effect.runPromise(
        Effect.flip(provider.complete(tutorRequest)),
      );
      expect(failure.charge).toEqual({ kind: 'unknown' });
      await Promise.race([
        closed,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Upstream remained open.')), 500),
        ),
      ]);
    } finally {
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        upstream.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});

describe('learning-path validation', () => {
  const operation: LearningRequest['operation'] = {
    kind: 'generate-learning-path',
    goal: 'Understand Unicode',
    sources: [source],
    learnerContext: [],
  };

  it('accepts bounded path steps without inferring mastery', () => {
    const contribution = parseProviderContribution(
      {
        kind: 'learning-path',
        title: 'Unicode foundations',
        steps: [
          {
            title: 'Read',
            objective: 'Notice code units.',
            activity: 'Compare string lengths.',
            citations: [],
          },
          {
            title: 'Apply',
            objective: 'Use exact offsets.',
            activity: 'Anchor a quote.',
            citations: [],
          },
        ],
      },
      operation,
    );
    expect(contribution.kind).toBe('learning-path');
    expect(JSON.stringify(contribution)).not.toContain('master');
  });
});
