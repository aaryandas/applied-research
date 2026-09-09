import { isAbsolute } from 'node:path';
import { parseWorkerOrigin } from './remote-transport.js';

export interface RenderHostConfig {
  readonly origin: string;
  readonly certificates: {
    readonly cert: string;
    readonly key: string;
    readonly ca: string;
  };
  readonly stagingDirectory: string;
  readonly artifactDirectory: string;
}

/**
 * Operator-supplied worker host. Missing or partial configuration is null so
 * learning still starts; render routes fail closed. This does not generate
 * certificates or purchase a host.
 */
export function readRenderHostConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RenderHostConfig | null {
  const origin = environment.AR_RENDER_WORKER_ORIGIN;
  const cert = environment.AR_RENDER_WORKER_TLS_CERT;
  const key = environment.AR_RENDER_WORKER_TLS_KEY;
  const ca = environment.AR_RENDER_WORKER_TLS_CA;
  const stagingDirectory = environment.AR_RENDER_STAGING_DIRECTORY;
  const artifactDirectory = environment.AR_RENDER_ARTIFACT_DIRECTORY;
  const values = [origin, cert, key, ca, stagingDirectory, artifactDirectory];
  if (values.every((value) => value === undefined || value === '')) {
    return null;
  }
  if (
    typeof origin !== 'string' ||
    origin === '' ||
    typeof cert !== 'string' ||
    cert === '' ||
    typeof key !== 'string' ||
    key === '' ||
    typeof ca !== 'string' ||
    ca === '' ||
    typeof stagingDirectory !== 'string' ||
    stagingDirectory === '' ||
    typeof artifactDirectory !== 'string' ||
    artifactDirectory === ''
  ) {
    return null;
  }
  try {
    parseWorkerOrigin(origin);
  } catch {
    return null;
  }
  if (
    !isAbsolute(cert) ||
    !isAbsolute(key) ||
    !isAbsolute(ca) ||
    !isAbsolute(stagingDirectory) ||
    !isAbsolute(artifactDirectory)
  ) {
    return null;
  }
  return {
    origin,
    certificates: { cert, key, ca },
    stagingDirectory,
    artifactDirectory,
  };
}
