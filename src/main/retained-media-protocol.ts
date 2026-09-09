import type { Protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import {
  isRetainedMediaId,
  RETAINED_MEDIA_SCHEME,
} from './retained-media-identity';
import type { RetainedMediaStore } from './retained-media-store';

export const RETAINED_MEDIA_SCHEME_REGISTRATION = [
  {
    scheme: RETAINED_MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: false,
    },
  },
] as const;

export function registerRetainedMediaScheme(
  protocolApi: Pick<Protocol, 'registerSchemesAsPrivileged'>,
): void {
  protocolApi.registerSchemesAsPrivileged([
    ...RETAINED_MEDIA_SCHEME_REGISTRATION,
  ]);
}

export function installRetainedMediaProtocol(
  protocolApi: Pick<Protocol, 'handle'>,
  store: RetainedMediaStore,
): void {
  protocolApi.handle(RETAINED_MEDIA_SCHEME, async (request) => {
    let parsed: URL;
    try {
      parsed = new URL(request.url);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (
      parsed.protocol !== `${RETAINED_MEDIA_SCHEME}:` ||
      parsed.hostname !== 'clip' ||
      parsed.port !== '' ||
      parsed.search !== '' ||
      parsed.hash !== '' ||
      parsed.username !== '' ||
      parsed.password !== ''
    ) {
      return new Response(null, { status: 404 });
    }
    const mediaId = parsed.pathname.replace(/^\//, '');
    if (!isRetainedMediaId(mediaId)) {
      return new Response(null, { status: 404 });
    }
    const path = await store.openPath(mediaId);
    const record = await store.readRecord(mediaId);
    if (!path || record.status !== 'ready') {
      return new Response(null, { status: 404 });
    }
    const stream = createReadStream(path);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
