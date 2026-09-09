import {
  DESKTOP_E2E_TEST_ENVIRONMENT,
  DESKTOP_E2E_WINDOW_ARGUMENT,
  readDesktopTestEnvironment,
  type DesktopTestEnvironment,
} from '../contracts/desktop';

/**
 * Bounded automated-test admission, same shape as
 * `!app.isPackaged && APPLIED_RESEARCH_ENABLE_DIRECT_TUTOR`.
 * Packaged production cannot enable the fixture from environment or renderer.
 */
export function admitDesktopTestEnvironment(input: {
  readonly isPackaged: boolean;
  readonly envValue: string | undefined;
}): DesktopTestEnvironment | null {
  if (input.isPackaged) return null;
  return readDesktopTestEnvironment(input.envValue);
}

export function desktopE2EAdditionalArguments(
  admitted: DesktopTestEnvironment | null,
): string[] {
  return admitted === DESKTOP_E2E_TEST_ENVIRONMENT
    ? [DESKTOP_E2E_WINDOW_ARGUMENT]
    : [];
}
