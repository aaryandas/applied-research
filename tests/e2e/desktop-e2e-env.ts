import {
  DESKTOP_E2E_TEST_ENVIRONMENT,
  type DesktopTestEnvironment,
} from '../../src/contracts/desktop';

export const DESKTOP_E2E_ENV_VALUE: DesktopTestEnvironment =
  DESKTOP_E2E_TEST_ENVIRONMENT;

/** Explicit bounded Electron test seam for unpackaged Playwright `args: ['.']`.
 * Main admits it only when `!app.isPackaged` (same as DIRECT_TUTOR). Never a
 * real-user, live-provider, or packaged-release fixture.
 */
export function desktopE2EEnv(
  directory: string,
  extra: Record<string, string> = {},
): { [key: string]: string } {
  const merged: NodeJS.ProcessEnv = {
    ...process.env,
    APPLIED_RESEARCH_DATA_DIR: directory,
    APPLIED_RESEARCH_TEST_ENVIRONMENT: DESKTOP_E2E_ENV_VALUE,
    APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR: 'false',
    OPENROUTER_API_KEY: '',
    ...extra,
  };
  const env: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}
