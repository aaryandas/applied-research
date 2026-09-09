import {
  DESKTOP_E2E_TEST_ENVIRONMENT,
  type DesktopTestEnvironment,
} from '../../src/contracts/desktop';

export const DESKTOP_E2E_ENV_VALUE: DesktopTestEnvironment =
  DESKTOP_E2E_TEST_ENVIRONMENT;

/** Explicit bounded Electron test seam. Never a real-user or live-provider claim. */
export function desktopE2EEnv(
  directory: string,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APPLIED_RESEARCH_DATA_DIR: directory,
    APPLIED_RESEARCH_TEST_ENVIRONMENT: DESKTOP_E2E_ENV_VALUE,
    APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR: 'false',
    OPENROUTER_API_KEY: '',
    ...extra,
  };
}
