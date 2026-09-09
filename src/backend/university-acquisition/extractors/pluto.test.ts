import { describe, expect, it } from 'vitest';
import { extractPlutoStaticSource } from './pluto.js';
import { sha256Utf8 } from '../hashes.js';

const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const UUID_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UUID_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UUID_TOML = '00000000-0000-0000-0000-000000000001';

function notebook(source: string): Uint8Array {
  return new TextEncoder().encode(source);
}

describe('pluto static extraction', () => {
  it('uses Cell-order display order rather than file order', () => {
    const bytes = notebook(`### A Pluto.jl notebook ###
# v0.19.45

# ╔═╡ ${UUID_A}
md"File-first later-display"

# ╔═╡ ${UUID_B}
md"## Display first"

# ╔═╡ Cell order:
# ╟─${UUID_B}
# ╟─${UUID_A}
`);
    const extracted = extractPlutoStaticSource(bytes);
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.text.indexOf('Display first')).toBeLessThan(
      extracted.document.text.indexOf('File-first later-display'),
    );
    expect(extracted.document.locators[0]?.cellId).toBe(UUID_B);
    expect(extracted.document.locators[0]?.displayIndex).toBe(0);
  });

  it('refuses duplicate and malformed cell identifiers', () => {
    const duplicate = extractPlutoStaticSource(
      notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"one"

# ╔═╡ ${UUID_A}
md"two"

# ╔═╡ Cell order:
# ╟─${UUID_A}
`),
    );
    expect(duplicate).toMatchObject({ outcome: 'malformed-content' });
    const malformed = extractPlutoStaticSource(
      notebook(`### A Pluto.jl notebook ###

# ╔═╡ not-a-uuid
md"bad"

# ╔═╡ Cell order:
# ╟─${UUID_A}
`),
    );
    expect(malformed).toMatchObject({ outcome: 'malformed-content' });
  });

  it('records interpolation, widgets, TOML and remote downloads as gaps', () => {
    const bytes = notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"Static $(interpolated) text"

# ╔═╡ ${UUID_B}
md"""
## Kept
"""

# ╔═╡ ${UUID_C}
begin
	oneimage = load(download("https://example.com/one.png"))
end

# ╔═╡ ${UUID_TOML}
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
"""

# ╔═╡ Cell order:
# ╟─${UUID_A}
# ╟─${UUID_B}
# ╠═${UUID_C}
# ╟─${UUID_TOML}
`);
    const extracted = extractPlutoStaticSource(bytes);
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.text).toContain('## Kept');
    expect(extracted.document.text).not.toContain('interpolated');
    expect(extracted.document.text).not.toContain('PLUTO_PROJECT_TOML');
    expect(extracted.document.text).not.toContain('download(');
    expect(extracted.document.extraction.coverage).toBe('partial');
    expect(extracted.document.gaps.map((gap) => gap.kind)).toEqual(
      expect.arrayContaining([
        'interpolation',
        'remote-download',
        'toml-runtime',
      ]),
    );
    expect(extracted.document.text).not.toContain('text/plain');
  });

  it('is deterministic for a second extraction', () => {
    const bytes = notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_B}
md"## Same"

# ╔═╡ Cell order:
# ╟─${UUID_B}
`);
    const first = extractPlutoStaticSource(bytes);
    const second = extractPlutoStaticSource(bytes);
    expect(first).toEqual(second);
    if (first.outcome === 'success') {
      expect(sha256Utf8(first.document.text)).toHaveLength(64);
    }
  });

  it('refuses non-UTF8 bytes', () => {
    expect(
      extractPlutoStaticSource(Uint8Array.of(0xff, 0xfe, 0x00)),
    ).toMatchObject({ outcome: 'malformed-content' });
  });

  it('fails closed on missing, malformed, unknown, and unordered Cell-order lists', () => {
    expect(extractPlutoStaticSource(notebook('not a notebook'))).toMatchObject({
      outcome: 'unsupported',
      reason: 'not-pluto',
    });
    expect(
      extractPlutoStaticSource(
        notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"one"
`),
      ),
    ).toMatchObject({
      outcome: 'malformed-content',
      reason: 'missing-cell-order',
    });
    expect(
      extractPlutoStaticSource(
        notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"one"

# ╔═╡ Cell order:
# garbage
`),
      ),
    ).toMatchObject({
      outcome: 'malformed-content',
      reason: 'malformed-cell-order',
    });
    expect(
      extractPlutoStaticSource(
        notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"one"

# ╔═╡ Cell order:
# ╟─${UUID_B}
`),
      ),
    ).toMatchObject({
      outcome: 'malformed-content',
      reason: 'unknown-cell-order-id',
    });
    expect(
      extractPlutoStaticSource(
        notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"one"

# ╔═╡ ${UUID_B}
md"two"

# ╔═╡ Cell order:
# ╟─${UUID_A}
`),
      ),
    ).toMatchObject({ outcome: 'malformed-content', reason: 'unordered-cell' });
  });

  it('omits widgets and macros and reports media gaps from static Markdown', () => {
    const bytes = notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"""
## Kept heading
![diagram](https://example.com/a.png)
<img src="https://example.com/b.png">
https://youtu.be/abcdefghijk
![unfinished
"""

# ╔═╡ ${UUID_B}
@bind x Slider(1:10)

# ╔═╡ ${UUID_C}
@macrocall foo()

# ╔═╡ Cell order:
# ╟─${UUID_A}
# ╠═${UUID_B}
# ╠═${UUID_C}
`);
    const extracted = extractPlutoStaticSource(bytes);
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.text).toContain('## Kept heading');
    expect(extracted.document.text).not.toContain('Slider');
    expect(extracted.document.gaps.map((gap) => gap.kind)).toEqual(
      expect.arrayContaining([
        'unsupported-media',
        'widget',
        'executable-macro',
      ]),
    );
  });

  it('does not treat TOML-only notebooks as a complete lesson', () => {
    const extracted = extractPlutoStaticSource(
      notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_TOML}
PLUTO_PROJECT_TOML_CONTENTS = """
[deps]
"""

# ╔═╡ Cell order:
# ╟─${UUID_TOML}
`),
    );
    expect(extracted).toMatchObject({
      outcome: 'unsupported',
      reason: 'no-static-cells',
    });
  });

  it('preserves unclosed-string refusal and escaped delimiters in Markdown cells', () => {
    const unclosed = extractPlutoStaticSource(
      notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"unterminated

# ╔═╡ Cell order:
# ╟─${UUID_A}
`),
    );
    expect(unclosed.outcome).not.toBe('success');
    const escaped = extractPlutoStaticSource(
      notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"quote \\"inside\\""

# ╔═╡ Cell order:
# ╟─${UUID_A}
`),
    );
    expect(escaped.outcome).toBe('success');
    if (escaped.outcome !== 'success') return;
    expect(escaped.document.text).toContain('quote "inside"');
  });

  it('keeps a static Markdown cell whose text is exactly interpolation', () => {
    const bytes = notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"interpolation"

# ╔═╡ Cell order:
# ╟─${UUID_A}
`);
    const extracted = extractPlutoStaticSource(bytes);
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.text).toBe('interpolation');
    expect(extracted.document.gaps).toEqual([]);
    expect(extracted.document.locators[0]?.cellId).toBe(UUID_A);
  });

  it('uses the first Markdown heading and ignores trailing cell LFs only', () => {
    const bytes = notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"""
intro
# First heading
# Later heading
"""

# ╔═╡ Cell order:
# ╟─${UUID_A}
`);
    const extracted = extractPlutoStaticSource(bytes);
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.sections[0]?.title).toBe('First heading');
    expect(extracted.document.text).toContain('# Later heading');
  });

  it('keeps whitespace-only first ATX text and does not skip to a later heading', () => {
    const bytes = notebook(`### A Pluto.jl notebook ###

# ╔═╡ ${UUID_A}
md"""
#${'  '}
# Real heading
kept body
"""

# ╔═╡ Cell order:
# ╟─${UUID_A}
`);
    const extracted = extractPlutoStaticSource(bytes);
    expect(extracted.outcome).toBe('success');
    if (extracted.outcome !== 'success') return;
    expect(extracted.document.sections[0]?.title).toBe('');
    expect(extracted.document.text).toContain('# Real heading');
    expect(extracted.document.text).toContain('kept body');
  });
});
