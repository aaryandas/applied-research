import { fileURLToPath } from 'node:url';
import { loadBackendConfig } from './config.js';
import { ConfigurationError } from './config.js';
import { consoleDiagnostics } from './diagnostics.js';
import { startBackend } from './runtime.js';

export async function runBackend(): Promise<void> {
  const config = loadBackendConfig(process.env);
  const backend = await startBackend(config);
  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await backend.stop();
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  console.log(`Applied Research backend listening on port ${backend.port}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBackend().catch((cause) => {
    consoleDiagnostics.report(
      cause instanceof ConfigurationError
        ? 'backend.configuration-invalid'
        : 'backend.start-failed',
      cause,
    );
    process.exitCode = 1;
  });
}
