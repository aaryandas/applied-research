import { trustedExecutable } from '../../render-worker/trusted-runtime.js';

export interface TrustedRenderRuntime {
  readonly docker: string;
  readonly dockerContext: string;
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

const CONTEXT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function trustedDockerContextName(context: string): string {
  if (!CONTEXT_PATTERN.test(context)) {
    throw new Error('Docker context name is not a trusted identifier.');
  }
  return context;
}

/**
 * Production/cloud render hosts must name a real Docker context.
 * OrbStack is local development only and is never inferred for deployment.
 */
export async function resolveTrustedRenderRuntime(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<TrustedRenderRuntime> {
  const contextName = environment.AR_MANIM_DOCKER_CONTEXT;
  if (!contextName) {
    throw new Error(
      'AR_MANIM_DOCKER_CONTEXT must name the trusted Docker context. OrbStack is not a deployed runtime.',
    );
  }
  const dockerContext = trustedDockerContextName(contextName);
  if (
    dockerContext === 'orbstack' &&
    environment.AR_MANIM_ALLOW_ORBSTACK !== 'true'
  ) {
    throw new Error(
      'OrbStack is a local development context, not a cloud or Railway runtime.',
    );
  }
  return {
    docker: await trustedExecutable(environment.AR_MANIM_DOCKER, 'Docker'),
    dockerContext,
    ffmpeg: await trustedExecutable(environment.AR_FFMPEG_PATH, 'FFmpeg'),
    ffprobe: await trustedExecutable(environment.AR_FFPROBE_PATH, 'FFprobe'),
  };
}
