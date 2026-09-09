import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { allowedLanePaths } from './lane-guard-rules.mjs';
const config = JSON.parse(
  readFileSync(new URL('../.github/lanes.json', import.meta.url), 'utf8'),
);
test('integration cannot bypass the configured lane catalog', () => {
  assert.throws(
    () => allowedLanePaths(config, ['lane:integration']),
    /Unknown lane "integration"/,
  );
  assert.throws(
    () => allowedLanePaths(config, ['lane:delivery', 'lane:integration']),
    /exactly one/,
  );
});
test('only the delivery lane receives workflow ownership', () => {
  for (const lane of Object.keys(config.lanes)) {
    const result = allowedLanePaths(config, [`lane:${lane}`]);
    assert.equal(result.allowed.includes('.github/**'), lane === 'delivery');
  }
});
