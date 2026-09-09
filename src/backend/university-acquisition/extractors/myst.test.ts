import { describe, expect, it } from 'vitest';
import { extractMystMarkdown } from './myst.js';
import { isUnicodeScalarBoundary } from '../../text.js';

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe('myst markdown extraction', () => {
  it('preserves nested fences, TeX, footnotes, tables and reports unknown directives', () => {
    const source = `# Outer

\`\`\`\`markdown
\`\`\`sql
SELECT id
FROM t
WHERE id = 1;
\`\`\`
\`\`\`\`

\`\`\`{math}
:label: sample-eq
E = mc^2
\`\`\`

\`\`\`{mystery}
should not run
\`\`\`

$$
a_{n}^{2} + b_{n}^{2}
$$ (pythagoras)

| Col A | Col B |
| ----- | ----- |
| left  | right |

See the label {eq}\`sample-eq\` and note[^1].

[^1]: Footnote with $x^{2}$ math.

{{ must_not_execute }}
`;
    const extracted = extractMystMarkdown(bytesOf(source), {
      slice: null,
      includeFootnotes: ['1'],
    });
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.text).toContain('SELECT id\nFROM t');
    expect(extracted.document.text).toContain('E = mc^2');
    expect(extracted.document.text).toContain('a_{n}^{2} + b_{n}^{2}');
    expect(extracted.document.text).toContain('| Col A | Col B |');
    expect(extracted.document.text).toContain('| left  | right |');
    expect(extracted.document.text).not.toMatch(/left\s*right/u);
    expect(extracted.document.text).toContain(
      '[^1]: Footnote with $x^{2}$ math.',
    );
    expect(extracted.document.text).not.toContain('must_not_execute');
    expect(extracted.document.text).not.toContain('should not run');
    expect(extracted.document.gaps.map((gap) => gap.kind)).toEqual(
      expect.arrayContaining([
        'unknown-directive',
        'interpolation',
        'unresolved-crossref',
      ]),
    );
  });

  it('omits media directives and keeps scalar-safe unicode offsets', () => {
    const source = `# Café 😀

Paragraph with 😀 emoji.

\`\`\`{figure} images/cover.jpg
:name: cover
Cover image
\`\`\`
`;
    const extracted = extractMystMarkdown(bytesOf(source), {
      slice: null,
      includeFootnotes: [],
    });
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.text).toContain('Café 😀');
    expect(extracted.document.text).not.toContain('images/cover.jpg');
    expect(
      extracted.document.gaps.some((gap) => gap.kind === 'unsupported-media'),
    ).toBe(true);
    for (const locator of extracted.document.locators) {
      expect(
        isUnicodeScalarBoundary(
          extracted.document.text,
          locator.canonicalStart,
        ),
      ).toBe(true);
      expect(
        isUnicodeScalarBoundary(extracted.document.text, locator.canonicalEnd),
      ).toBe(true);
      expect(
        extracted.document.text.slice(
          locator.canonicalStart,
          locator.canonicalEnd,
        ),
      ).toBeTruthy();
    }
  });

  it('fails closed on invalid slices, unclosed fences, and empty selections', () => {
    expect(
      extractMystMarkdown(bytesOf('ok\n'), {
        slice: { startLine: 8, endLine: 9 },
        includeFootnotes: [],
      }),
    ).toMatchObject({ outcome: 'malformed-content', reason: 'invalid-slice' });
    expect(
      extractMystMarkdown(bytesOf('```python\nprint(1)\n'), {
        slice: null,
        includeFootnotes: [],
      }),
    ).toMatchObject({ outcome: 'malformed-content', reason: 'unclosed-fence' });
    expect(
      extractMystMarkdown(bytesOf('$$\nE=mc^2\n'), {
        slice: null,
        includeFootnotes: [],
      }),
    ).toMatchObject({ outcome: 'malformed-content' });
    expect(
      extractMystMarkdown(bytesOf(':::{note}\nHi\n'), {
        slice: null,
        includeFootnotes: [],
      }),
    ).toMatchObject({ outcome: 'malformed-content' });
    expect(
      extractMystMarkdown(bytesOf('\n\n'), {
        slice: null,
        includeFootnotes: [],
      }),
    ).toMatchObject({ outcome: 'unsupported', reason: 'empty-selection' });
    expect(
      extractMystMarkdown(Uint8Array.of(0xff), {
        slice: null,
        includeFootnotes: [],
      }),
    ).toMatchObject({ outcome: 'malformed-content', reason: 'utf8' });
  });

  it('keeps labeled targets, tilde fences, index omissions, and missing footnotes as gaps', () => {
    const source = `(eq-label)=
# Kept

~~~julia
1 + 1
~~~

\`\`\`{index}
hidden
\`\`\`

\`\`\`{math}
:label: only-label
\`\`\`

See [^missing].

:::{note}
Ignored directive
:::
`;
    const extracted = extractMystMarkdown(bytesOf(source), {
      slice: null,
      includeFootnotes: ['missing'],
    });
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.text).toContain('# Kept');
    expect(extracted.document.text).toContain('1 + 1');
    expect(extracted.document.text).not.toContain('hidden');
    expect(extracted.document.gaps.map((gap) => gap.kind)).toEqual(
      expect.arrayContaining(['unresolved-crossref', 'unknown-directive']),
    );
  });
});
