import { describe, expect, it } from 'vitest';
import { DESKTOP_E2E_TEST_ENVIRONMENT } from '../contracts/desktop';
import {
  admitDesktopTestEnvironment,
  desktopE2EAdditionalArguments,
} from './desktop-test-environment';

describe('desktop-e2e test-entry admission', () => {
  it('admits the named unpackaged env the same way DIRECT_TUTOR is gated', () => {
    expect(
      admitDesktopTestEnvironment({
        isPackaged: false,
        envValue: DESKTOP_E2E_TEST_ENVIRONMENT,
      }),
    ).toBe(DESKTOP_E2E_TEST_ENVIRONMENT);
    expect(desktopE2EAdditionalArguments(DESKTOP_E2E_TEST_ENVIRONMENT)).toEqual(
      [`--applied-research-test-entry=${DESKTOP_E2E_TEST_ENVIRONMENT}`],
    );
  });

  it('rejects default, forged env, and packaged production even when env is set', () => {
    expect(
      admitDesktopTestEnvironment({
        isPackaged: false,
        envValue: undefined,
      }),
    ).toBeNull();
    expect(
      admitDesktopTestEnvironment({
        isPackaged: false,
        envValue: 'desktop-e2e-forged',
      }),
    ).toBeNull();
    expect(
      admitDesktopTestEnvironment({
        isPackaged: true,
        envValue: DESKTOP_E2E_TEST_ENVIRONMENT,
      }),
    ).toBeNull();
    expect(desktopE2EAdditionalArguments(null)).toEqual([]);
  });
});
