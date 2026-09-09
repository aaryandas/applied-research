import { expect, it } from 'vitest';
import { MAX_PRACTICAL_FIELD_LENGTH } from '../contracts/practical-work';
import { previewRetainedPracticalFile } from './practical-preview';

const selectionId = 'c1234567-1234-4234-8234-123456789012';

it('preserves exact JSON and CSV text, bytes and provenance, and reports PDF as unsupported', () => {
  const json = Buffer.from('{\n  "observed": 12\n}\n', 'utf8');
  const csv = Buffer.from('trial,value\nA,12\n', 'utf8');
  expect(
    previewRetainedPracticalFile(
      selectionId,
      'trial.json',
      'application/json',
      {
        displayName: 'trial.json',
        bytes: json,
        sha256: 'json-hash',
      },
    ),
  ).toEqual({
    status: 'ready',
    selectionId,
    displayName: 'trial.json',
    mediaType: 'application/json',
    byteLength: json.length,
    provenanceId: 'sha256:json-hash',
    completeness: 'complete',
    text: '{\n  "observed": 12\n}\n',
  });
  expect(
    previewRetainedPracticalFile(selectionId, 'trial.csv', 'text/csv', {
      displayName: 'trial.csv',
      bytes: csv,
      sha256: 'csv-hash',
    }),
  ).toMatchObject({
    status: 'ready',
    mediaType: 'text/csv',
    completeness: 'complete',
    text: 'trial,value\nA,12\n',
  });
  expect(
    previewRetainedPracticalFile(selectionId, 'trial.pdf', 'application/pdf', {
      displayName: 'trial.pdf',
      bytes: Buffer.from('%PDF-1.4 retained'),
      sha256: 'pdf-hash',
    }),
  ).toMatchObject({
    status: 'unsupported-preview',
    mediaType: 'application/pdf',
    message: expect.stringMatching(/Export the exact retained bytes/),
  });
});

it('refuses invalid UTF-8 and NUL at the preview boundary', () => {
  expect(
    previewRetainedPracticalFile(selectionId, 'bad.txt', 'text/plain', {
      displayName: 'bad.txt',
      bytes: Buffer.from([0xff]),
      sha256: 'bad',
    }),
  ).toEqual({ status: 'failed' });
  expect(
    previewRetainedPracticalFile(selectionId, 'nul.txt', 'text/plain', {
      displayName: 'nul.txt',
      bytes: Buffer.from('a\0b', 'utf8'),
      sha256: 'nul',
    }),
  ).toEqual({ status: 'failed' });
  const long = 'x'.repeat(MAX_PRACTICAL_FIELD_LENGTH + 3);
  const truncated = previewRetainedPracticalFile(
    selectionId,
    'long.txt',
    'text/plain',
    {
      displayName: 'long.txt',
      bytes: Buffer.from(long, 'utf8'),
      sha256: 'long',
    },
  );
  expect(truncated).toMatchObject({
    status: 'ready',
    completeness: 'truncated',
    text: 'x'.repeat(MAX_PRACTICAL_FIELD_LENGTH),
  });
});
