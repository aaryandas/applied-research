import type { Event } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_AUTH_CALLBACK } from '../contracts/desktop-auth';
import {
  desktopAuthCallbackArgument,
  registerDesktopAuthProtocol,
  registerDesktopAuthScheme,
  type DesktopAuthProtocolApp,
} from './auth-protocol';

function fakeApp(platform: NodeJS.Platform = 'darwin') {
  type Listener =
    | ((event: Event, url: string) => void)
    | ((event: Event, argv: string[]) => void);
  const listeners = new Map<string, Listener>();
  const on = vi.fn((event: string, listener: Listener) => {
    listeners.set(event, listener);
  });
  const removeListener = vi.fn((event: string, listener: Listener) => {
    if (listeners.get(event) === listener) listeners.delete(event);
  });
  const setAsDefaultProtocolClient = vi.fn(() => true);
  const app: DesktopAuthProtocolApp = {
    on,
    removeListener,
    requestSingleInstanceLock: vi.fn(() => true),
    setAsDefaultProtocolClient,
  };
  return { app, listeners, platform, setAsDefaultProtocolClient };
}

describe('desktop auth protocol', () => {
  it('registers only the fixed secure callback scheme before ready', () => {
    const registerSchemesAsPrivileged = vi.fn();
    registerDesktopAuthScheme({ registerSchemesAsPrivileged });
    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'com.aaryandas.appliedresearch',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: false,
          corsEnabled: false,
        },
      },
    ]);
  });

  it('uses the executable and entry script only for development registration', () => {
    const fake = fakeApp();
    const callback = vi.fn();
    const registration = registerDesktopAuthProtocol({
      app: fake.app,
      argv: ['/Electron', './out/main/index.js'],
      defaultApp: true,
      executablePath: '/Electron',
      onActivate: vi.fn(),
      onCallback: callback,
      platform: fake.platform,
    });

    expect(registration).toMatchObject({
      ownsInstance: true,
      registered: true,
    });
    expect(fake.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'com.aaryandas.appliedresearch',
      '/Electron',
      [expect.stringContaining('out/main/index.js')],
    );

    const openUrl = fake.listeners.get('open-url') as
      ((event: Event, url: string) => void) | undefined;
    const event: Event = {
      preventDefault: vi.fn(),
      defaultPrevented: false,
    };
    if (!openUrl) throw new Error('open-url listener was not registered.');
    openUrl(event, DESKTOP_AUTH_CALLBACK);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith(DESKTOP_AUTH_CALLBACK);

    registration.dispose();
    expect(fake.listeners.has('open-url')).toBe(false);
    expect(fake.listeners.has('second-instance')).toBe(false);
  });

  it('extracts only bounded arguments for the fixed scheme', () => {
    expect(
      desktopAuthCallbackArgument([
        '--flag',
        'https://example.invalid/',
        `${DESKTOP_AUTH_CALLBACK}#token=abc`,
      ]),
    ).toBe(`${DESKTOP_AUTH_CALLBACK}#token=abc`);
    expect(desktopAuthCallbackArgument(['custom://auth/callback'])).toBeNull();
    expect(
      desktopAuthCallbackArgument([
        `com.aaryandas.appliedresearch:${'x'.repeat(8_193)}`,
      ]),
    ).toBeNull();
  });

  it('reports registration failure without accepting arbitrary URLs', () => {
    const fake = fakeApp('win32');
    fake.setAsDefaultProtocolClient.mockReturnValue(false);
    const report = vi.fn();
    const callback = vi.fn();
    registerDesktopAuthProtocol({
      app: fake.app,
      argv: ['/app'],
      defaultApp: false,
      diagnostics: { report },
      executablePath: '/app',
      onActivate: vi.fn(),
      onCallback: callback,
      platform: fake.platform,
    });

    expect(report).toHaveBeenCalledWith('auth.protocol-registration-failed');
    expect(fake.listeners.has('open-url')).toBe(false);
    const secondInstance = fake.listeners.get('second-instance') as
      ((event: Event, argv: string[]) => void) | undefined;
    secondInstance?.({ preventDefault: vi.fn(), defaultPrevented: false }, []);
    expect(callback).not.toHaveBeenCalled();
  });
});
