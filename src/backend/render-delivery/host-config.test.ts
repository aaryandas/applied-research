import { describe, expect, it } from 'vitest';
import { readRenderHostConfig } from './host-config.js';

describe('render host configuration', () => {
  it('fails closed when worker host variables are missing or partial', () => {
    expect(readRenderHostConfig({})).toBeNull();
    expect(
      readRenderHostConfig({
        AR_RENDER_WORKER_ORIGIN: 'https://worker.example',
      }),
    ).toBeNull();
    expect(
      readRenderHostConfig({
        AR_RENDER_WORKER_ORIGIN: 'http://worker.example',
        AR_RENDER_WORKER_TLS_CERT: '/tmp/cert.pem',
        AR_RENDER_WORKER_TLS_KEY: '/tmp/key.pem',
        AR_RENDER_WORKER_TLS_CA: '/tmp/ca.pem',
        AR_RENDER_STAGING_DIRECTORY: '/tmp/stage',
        AR_RENDER_ARTIFACT_DIRECTORY: '/tmp/art',
      }),
    ).toBeNull();
    expect(
      readRenderHostConfig({
        AR_RENDER_WORKER_ORIGIN: 'https://worker.example',
        AR_RENDER_WORKER_TLS_CERT: '/tmp/cert.pem',
        AR_RENDER_WORKER_TLS_KEY: '/tmp/key.pem',
        AR_RENDER_WORKER_TLS_CA: '/tmp/ca.pem',
        AR_RENDER_STAGING_DIRECTORY: '/tmp/stage',
        AR_RENDER_ARTIFACT_DIRECTORY: '/tmp/art',
      }),
    ).toEqual({
      origin: 'https://worker.example',
      certificates: {
        cert: '/tmp/cert.pem',
        key: '/tmp/key.pem',
        ca: '/tmp/ca.pem',
      },
      stagingDirectory: '/tmp/stage',
      artifactDirectory: '/tmp/art',
    });
  });
});
