# AR-56 clip player mount

AR-54 owns `RetainedClipPlayer` and `src/main/clip-*.ts`. It does **not** edit
App, Shell, or preload. Mount the existing player with opaque IDs only.

## Protocol

Keep the existing `ar-media:` registration patch (register before
`app.whenReady`, install after `userData` exists). Object URLs are
`ar-media://clip/<uuid>`. Do not pass filesystem paths or worker URLs into the
renderer.

## Player

```tsx
<RetainedClipPlayer
  clip={readyClipFields}
  access={{ open: () => operations.open(opaqueId) }}
/>
```

`open` returns the `ar-media://clip/<uuid>` URL or an unauthorized/corrupt
failure. Do not claim a prior clip is available unless that open actually
succeeded (see `46efe4fe98c94e11473b267fd2e3dca1f9012a14` on this branch).

AR-56 `66f74f4` already includes `ar-media` protocol/CSP. What this lane still
needs from AR-56 is the **submit → retain → open** mount, not an unavailable
default:

```ts
import { createClipOperations } from './clip-operations';
import { makeClipApiTransport } from './clip-transport';

const clipOps = createClipOperations({
  accountId: () => session.account?.id ?? null,
  projectId: () => activeProjectId,
  transport: makeClipApiTransport({
    request: sessionFetch,
    sessionCookie: () => sessionCookie,
    store: retainedMedia,
  }),
});

new ContextualHelpOperations({
  records,
  authenticated: () => Boolean(session.account),
  transport: learningTransport,
  requestClip: (context) => clipOps.request(context),
});
```

Named preload bridge only: opaque `artifactId` / `requestId`. Cookie and
account stay in main. No raw IPC, SQL, or filesystem.

## CSP (delivery lane)

Production: `media-src 'self' ar-media:;`
Development: same, plus existing Vite refresh exceptions. Do not add
`media-src https:`.

## Tests AR-56 should add

- Shell/Reader mount with an opaque id plays via `ar-media:`
- Unauthorized/corrupt open does not show “Previous clip is still available.”
