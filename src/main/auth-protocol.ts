import type { Event, Protocol } from 'electron';
import { resolve } from 'node:path';
import { DESKTOP_AUTH_SCHEME } from '../contracts/desktop-auth';
import type { DesktopAuthDiagnostics } from './auth-diagnostics';
import { silentDesktopAuthDiagnostics } from './auth-diagnostics';

const MAX_PROTOCOL_ARGUMENT_CHARACTERS = 8_192;

export interface DesktopAuthProtocol {
  readonly ownsInstance: boolean;
  readonly registered: boolean;
  dispose(): void;
}

type OpenUrlListener = (event: Event, url: string) => void;
type SecondInstanceListener = (event: Event, argv: string[]) => void;

export interface DesktopAuthProtocolApp {
  on(event: 'open-url', listener: OpenUrlListener): unknown;
  on(event: 'second-instance', listener: SecondInstanceListener): unknown;
  removeListener(event: 'open-url', listener: OpenUrlListener): unknown;
  removeListener(
    event: 'second-instance',
    listener: SecondInstanceListener,
  ): unknown;
  requestSingleInstanceLock(): boolean;
  setAsDefaultProtocolClient(
    protocol: string,
    path?: string,
    arguments_?: string[],
  ): boolean;
}

interface DesktopAuthProtocolOptions {
  readonly app: DesktopAuthProtocolApp;
  readonly argv: readonly string[];
  readonly defaultApp: boolean;
  readonly diagnostics?: DesktopAuthDiagnostics;
  readonly executablePath: string;
  readonly onActivate: () => void;
  readonly onCallback: (url: string) => void;
  readonly platform: NodeJS.Platform;
}

export function registerDesktopAuthScheme(
  protocolApi: Pick<Protocol, 'registerSchemesAsPrivileged'>,
): void {
  protocolApi.registerSchemesAsPrivileged([
    {
      scheme: DESKTOP_AUTH_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: false,
        corsEnabled: false,
      },
    },
  ]);
}

export function desktopAuthCallbackArgument(
  arguments_: readonly string[],
): string | null {
  const prefix = `${DESKTOP_AUTH_SCHEME}:/`;
  return (
    arguments_.find(
      (argument) =>
        argument.length <= MAX_PROTOCOL_ARGUMENT_CHARACTERS &&
        argument.startsWith(prefix),
    ) ?? null
  );
}

export function registerDesktopAuthProtocol(
  options: DesktopAuthProtocolOptions,
): DesktopAuthProtocol {
  const diagnostics = options.diagnostics ?? silentDesktopAuthDiagnostics;
  const ownsInstance = options.app.requestSingleInstanceLock();
  const entryScript = options.argv[1];
  const registered = options.defaultApp
    ? typeof entryScript === 'string' &&
      options.app.setAsDefaultProtocolClient(
        DESKTOP_AUTH_SCHEME,
        options.executablePath,
        [resolve(entryScript)],
      )
    : options.app.setAsDefaultProtocolClient(DESKTOP_AUTH_SCHEME);

  if (!registered) diagnostics.report('auth.protocol-registration-failed');

  const onOpenUrl = (event: Event, url: string): void => {
    event.preventDefault();
    if (url.length <= MAX_PROTOCOL_ARGUMENT_CHARACTERS) options.onCallback(url);
  };
  const onSecondInstance = (_event: Event, argv: string[]): void => {
    const callback = desktopAuthCallbackArgument(argv);
    if (callback) options.onCallback(callback);
    options.onActivate();
  };

  if (options.platform === 'darwin') {
    options.app.on('open-url', onOpenUrl);
  }
  options.app.on('second-instance', onSecondInstance);

  return {
    ownsInstance,
    registered,
    dispose() {
      if (options.platform === 'darwin') {
        options.app.removeListener('open-url', onOpenUrl);
      }
      options.app.removeListener('second-instance', onSecondInstance);
    },
  };
}
