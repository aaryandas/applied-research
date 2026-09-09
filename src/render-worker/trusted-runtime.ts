import { constants } from 'node:fs';
import { access, lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { trustedDockerContext } from './docker.js';

export interface TrustedWorkerRuntime {
  readonly docker: string;
  readonly dockerContext: string;
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

const EXECUTABLE_UNWRITABLE = 0o022;
const RUNTIME_FLAGS = {
  '--docker': 'docker',
  '--docker-context': 'dockerContext',
  '--ffmpeg': 'ffmpeg',
  '--ffprobe': 'ffprobe',
} as const;

type RuntimeFlag = keyof typeof RUNTIME_FLAGS;
type ParsedRuntimeFlags = {
  docker?: string;
  dockerContext?: string;
  ffmpeg?: string;
  ffprobe?: string;
};

function isRuntimeFlag(value: string): value is RuntimeFlag {
  return value in RUNTIME_FLAGS;
}

export async function trustedExecutable(
  value: string | undefined,
  name: string,
): Promise<string> {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(`${name} must be an absolute installed executable path.`);
  }
  const resolved = await realpath(value);
  const entry = await lstat(resolved);
  if (!entry.isFile() || (entry.mode & EXECUTABLE_UNWRITABLE) !== 0) {
    throw new Error(
      `${name} must be a regular executable without group or public write access.`,
    );
  }
  await access(resolved, constants.X_OK);
  return resolved;
}

/** Structured argv only. Environment variables do not configure this seam. */
export function parseTrustedRuntimeArgv(
  argv: readonly string[],
): ParsedRuntimeFlags {
  const parsed: ParsedRuntimeFlags = {};
  const seen = new Set<RuntimeFlag>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined || !isRuntimeFlag(flag)) {
      throw new Error(
        'Runtime flags must be --docker, --docker-context, --ffmpeg and --ffprobe.',
      );
    }
    if (seen.has(flag)) throw new Error(`Duplicate ${flag}.`);
    seen.add(flag);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value.`);
    }
    parsed[RUNTIME_FLAGS[flag]] = value;
    index += 1;
  }
  return parsed;
}

export async function resolveTrustedWorkerRuntime(
  argv: readonly string[],
): Promise<TrustedWorkerRuntime> {
  const parsed = parseTrustedRuntimeArgv(argv);
  if (parsed.dockerContext === undefined) {
    throw new Error(
      'Pass --docker-context with a named, already verified Docker context. Do not infer orbstack or default.',
    );
  }
  return {
    docker: await trustedExecutable(parsed.docker, 'Docker'),
    dockerContext: trustedDockerContext(parsed.dockerContext),
    ffmpeg: await trustedExecutable(parsed.ffmpeg, 'FFmpeg'),
    ffprobe: await trustedExecutable(parsed.ffprobe, 'FFprobe'),
  };
}

export function workerCreateOptions(runtime: TrustedWorkerRuntime): {
  docker: string;
  dockerContext: string;
  ffmpeg: string;
  ffprobe: string;
} {
  return {
    docker: runtime.docker,
    dockerContext: runtime.dockerContext,
    ffmpeg: runtime.ffmpeg,
    ffprobe: runtime.ffprobe,
  };
}

/** Every Docker CLI spawn must name the selected context as argv, never an alias. */
export function dockerCliArgs(
  context: string,
  command: readonly string[],
): string[] {
  return ['--context', trustedDockerContext(context), ...command];
}
