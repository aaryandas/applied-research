import { constants } from 'node:fs';
import { access, lstat, readFile, realpath } from 'node:fs/promises';
import https from 'node:https';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { workerRenderEngine } from './delivery-engine.js';
import {
  createRenderDaemon,
  handleWorkerDaemonHttp,
  type DaemonEngine,
} from './daemon-server.js';
import {
  resolveTrustedWorkerRuntime,
  workerCreateOptions,
  type TrustedWorkerRuntime,
} from './trusted-runtime.js';
import { AnimationRenderWorker } from './worker.js';

const TLS_UNWRITABLE = 0o022;
const LISTEN_FLAGS = {
  '--listen-host': 'host',
  '--listen-port': 'port',
  '--tls-cert': 'cert',
  '--tls-key': 'key',
  '--tls-ca': 'ca',
} as const;

type ListenFlag = keyof typeof LISTEN_FLAGS;

export interface DaemonListenConfig {
  readonly host: string;
  readonly port: number;
  readonly cert: string;
  readonly key: string;
  readonly ca: string;
  readonly runtimeArgv: readonly string[];
}

export function parseDaemonArgv(argv: readonly string[]): DaemonListenConfig {
  const parsed: Partial<{
    host: string;
    port: string;
    cert: string;
    key: string;
    ca: string;
  }> = {};
  const runtime: string[] = [];
  const seen = new Set<ListenFlag>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined) continue;
    if (flag in LISTEN_FLAGS) {
      const key = flag as ListenFlag;
      if (seen.has(key)) throw new Error(`Duplicate ${flag}.`);
      seen.add(key);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${flag} requires a value.`);
      }
      parsed[LISTEN_FLAGS[key]] = value;
      index += 1;
      continue;
    }
    runtime.push(flag);
  }
  if (
    parsed.host === undefined ||
    parsed.port === undefined ||
    parsed.cert === undefined ||
    parsed.key === undefined ||
    parsed.ca === undefined
  ) {
    throw new Error(
      'Pass --listen-host, --listen-port, --tls-cert, --tls-key and --tls-ca.',
    );
  }
  if (!/^[A-Za-z0-9.-]+$/.test(parsed.host)) {
    throw new Error('Listen host is not a trusted hostname.');
  }
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Listen port must be an integer 1–65535.');
  }
  return {
    host: parsed.host,
    port,
    cert: parsed.cert,
    key: parsed.key,
    ca: parsed.ca,
    runtimeArgv: runtime,
  };
}

export async function trustedTlsFile(
  value: string,
  name: string,
): Promise<Buffer> {
  if (!isAbsolute(value)) {
    throw new Error(`${name} must be an absolute file path.`);
  }
  const resolved = await realpath(value);
  const entry = await lstat(resolved);
  if (!entry.isFile() || (entry.mode & TLS_UNWRITABLE) !== 0) {
    throw new Error(
      `${name} must be a regular file without group or public write access.`,
    );
  }
  await access(resolved, constants.R_OK);
  return readFile(resolved);
}

export function daemonEngineFromWorker(
  engine: ReturnType<typeof workerRenderEngine>,
): DaemonEngine {
  return {
    async render(json, signal) {
      const outcome = await engine.render(json, signal);
      if (outcome.status !== 'succeeded') return outcome;
      return {
        status: 'succeeded',
        jobId: outcome.jobId,
        artifactPath: outcome.artifactPath,
        artifact: {
          renderer: outcome.artifact.renderer,
          recipe: outcome.artifact.recipe,
          recipeHash: outcome.artifact.recipeHash,
          sha256: outcome.artifact.sha256,
          bytes: outcome.artifact.bytes,
          durationSeconds: outcome.artifact.durationSeconds,
          width: outcome.artifact.width,
          height: outcome.artifact.height,
          stages: outcome.artifact.stages,
          endpoint: outcome.artifact.endpoint,
          timings: outcome.artifact.timings,
        },
      };
    },
    release: (jobId) => engine.release(jobId),
    close: () => engine.close(),
  };
}

export interface DaemonMainHooks {
  resolveRuntime?: (argv: readonly string[]) => Promise<TrustedWorkerRuntime>;
  createEngine?: (runtime: TrustedWorkerRuntime) => Promise<DaemonEngine>;
  readArtifact?: (path: string) => Promise<Buffer>;
  createServer?: typeof https.createServer;
  listen?: (server: https.Server, port: number, host: string) => Promise<void>;
}

export async function startRenderWorkerDaemon(
  argv: readonly string[],
  hooks: DaemonMainHooks = {},
): Promise<{ close: () => Promise<void> }> {
  const config = parseDaemonArgv(argv);
  const resolveRuntime = hooks.resolveRuntime ?? resolveTrustedWorkerRuntime;
  const runtime = await resolveRuntime(config.runtimeArgv);
  const cert = await trustedTlsFile(config.cert, 'TLS certificate');
  const key = await trustedTlsFile(config.key, 'TLS key');
  const ca = await trustedTlsFile(config.ca, 'TLS CA');
  const createEngine =
    hooks.createEngine ??
    (async (resolved: TrustedWorkerRuntime) => {
      const worker = await AnimationRenderWorker.create(
        workerCreateOptions(resolved),
      );
      return daemonEngineFromWorker(workerRenderEngine(worker));
    });
  const engine = await createEngine(runtime);
  const daemon = createRenderDaemon({
    engine,
    readArtifact: hooks.readArtifact ?? ((path) => readFile(path)),
  });
  const createServer = hooks.createServer ?? https.createServer;
  const server = createServer(
    {
      cert,
      key,
      ca,
      requestCert: true,
      rejectUnauthorized: true,
    },
    (request, response) => {
      void handleWorkerDaemonHttp(daemon, request, response);
    },
  );
  const listen =
    hooks.listen ??
    ((httpsServer, port, host) =>
      new Promise<void>((resolve, reject) => {
        httpsServer.once('error', reject);
        httpsServer.listen(port, host, () => resolve());
      }));
  await listen(server, config.port, config.host);
  return {
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }).catch(() => undefined);
      await daemon.close();
    },
  };
}

async function runMain(): Promise<void> {
  const started = await startRenderWorkerDaemon(process.argv.slice(2));
  const shutdown = (): void => {
    void started.close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const invoked = process.argv[1];
if (invoked && import.meta.url === pathToFileURL(invoked).href) {
  void runMain().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Render worker failed to start.'}\n`,
    );
    process.exit(1);
  });
}
