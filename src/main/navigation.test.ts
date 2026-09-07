import { describe, expect, it } from 'vitest';
import { isAllowedNavigation } from './navigation';

describe('renderer navigation', () => {
  const renderer = 'file:///app/out/renderer/index.html';

  it('permits only the application document and its fragments', () => {
    expect(isAllowedNavigation(renderer, renderer)).toBe(true);
    expect(isAllowedNavigation(`${renderer}#learning-path`, renderer)).toBe(
      true,
    );
  });

  it.each([
    'https://example.com',
    'file:///etc/passwd',
    'file:///app/out/renderer/other.html',
    'file:///app/out/renderer/index.html?redirect=elsewhere',
    'javascript:alert(1)',
    'data:text/html,hello',
    'not a URL',
  ])('rejects navigation to %s', (target) => {
    expect(isAllowedNavigation(target, renderer)).toBe(false);
  });

  it('restricts development navigation to the exact renderer document', () => {
    const dev = 'http://localhost:5173/';
    expect(isAllowedNavigation(`${dev}#reader`, dev)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/', dev)).toBe(false);
    expect(
      isAllowedNavigation('http://localhost:5173.evil.example/', dev),
    ).toBe(false);
  });
});
