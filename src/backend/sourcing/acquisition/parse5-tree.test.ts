import { describe, expect, it } from 'vitest';
import { createParse5TreeAdapter } from './parse5-tree.js';

describe('parse5 tree boundary', () => {
  it('projects only deterministic tree data and ignores comments and doctypes', () => {
    const parser = createParse5TreeAdapter({
      parse: () => ({
        nodeName: '#document',
        childNodes: [
          { nodeName: '#documentType' },
          { nodeName: '#comment', data: 'ignored' },
          {
            nodeName: 'html',
            tagName: 'html',
            attrs: [
              { name: 'lang', value: 'en' },
              { name: 'role', value: 'main' },
              { name: '__proto__', value: 'blocked' },
            ],
            childNodes: [
              { nodeName: '#text', value: 'Readable' },
              {
                nodeName: 'script',
                tagName: 'script',
                attrs: [],
                childNodes: [{ nodeName: '#text', value: 'not executed' }],
              },
            ],
          },
        ],
      }),
    });

    expect(parser.parse('<ignored by injected parser>')).toEqual({
      kind: 'element',
      name: 'document',
      attributes: {},
      children: [
        {
          kind: 'element',
          name: 'html',
          attributes: { role: 'main' },
          children: [
            { kind: 'text', value: 'Readable' },
            {
              kind: 'element',
              name: 'script',
              attributes: {},
              children: [{ kind: 'text', value: 'not executed' }],
            },
          ],
        },
      ],
    });
  });

  it('fails closed on malformed parser output', () => {
    const parser = createParse5TreeAdapter({
      parse: () => ({ nodeName: '#text', value: 42 }),
    });
    expect(() => parser.parse('anything')).toThrow(
      'The HTML parser returned invalid text.',
    );
  });
});
