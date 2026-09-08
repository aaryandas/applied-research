# Implementation map

This map describes the implemented MVP. See [scope and limitations](mvp.md). Read [architecture](architecture.md) before adding process responsibilities.

| Location                       | Responsibility                                                        |
| ------------------------------ | --------------------------------------------------------------------- |
| `src/main/index.ts`            | Electron application and window lifecycle, security configuration     |
| `src/main/navigation.ts`       | Renderer navigation policy and adjacent unit tests                    |
| `src/preload/index.ts`         | Named workspace/tutor/provider/tool bridge and subscriptions          |
| `src/contracts/desktop.ts`     | Shared serializable desktop contract                                  |
| `src/renderer/`                | Canvas, companion, tool panel, matrix experiment, styles and UI tests |
| `tests/e2e/`                   | Real Electron smoke tests                                             |
| `scripts/test-packaged.mjs`    | Smoke test against the packaged application                           |
| `scripts/release-assets.mjs`   | Release asset selection                                               |
| `electron.vite.config.ts`      | Main, preload and renderer builds                                     |
| `electron-builder.yml`         | Installer configuration and packaged file scope                       |
| `.github/workflows/verify.yml` | Shared cross-platform verification                                    |
| `.github/workflows/`           | Pull request CI, candidate releases and optional Sonar analysis       |
| `context/design-system/`       | Shared renderer tokens/fonts/art and standalone interaction specimens |
| `context/repos/effect/`        | Read-only upstream reference; not application code                    |

Unit tests live beside their source. The MVP modules below own the implemented responsibilities.

`vitest.config.ts` separates Node unit, DOM renderer and real SQLite integration projects. `tests/integration/` owns cross-module persistence checks; `context/testing.md` owns test-layer guidance and CI activation evidence.

`compose.sonar.yml` runs the local-only Sonar/PostgreSQL stack and official scanner with immutable images. `context/sonar-local.md` documents operation; `.env.sonar` is private, ignored local configuration.

## MVP modules

- `src/contracts/workspace.ts`: project/entry/request models and named channels.
- `src/main/validation.ts`: runtime command, identifier, text, URL and bounds validation.
- `src/main/workspace-store.ts`: SQLite project/entry persistence and attribution-preserving mutations.
- `src/main/tutor.ts`: bounded OpenRouter request, response/citation parsing and explicit unsupported/failure outcomes.
- `src/renderer/EntryCard.tsx`: human drafts/autosave, AI citations and movable entries.
- `src/renderer/FieldAtlas.tsx`: the reference arch mark and SVG control family, day/evening preference, and native modal focus/Escape behavior.
- `src/renderer/styles.css`: scoped application layouts and components; imports the reference's `tokens.css` and `fonts.css` directly. The approved `apple-landscape.webp` is bundled by Vite.
- `src/renderer/ToolPanel.tsx`: native guest layout requests and external fallback controls.
- `src/renderer/MatrixLab.tsx`, `math.ts`: a reusable deterministic linear transformation and captured results.
- `src/renderer/assets/`: copies of both font OFL licenses; font binaries come from the shared design-system assets.

Window/guest/credential lifecycle and IPC registration live in `src/main/index.ts`; real Electron tests exercise that wiring. Domain behavior has adjacent unit tests. No application imports the pinned Effect reference. Structured paths, broad ingestion, sync and durable background jobs remain unimplemented.

## Portable design review

`context/design-handoff/prototype/` is a separate, temporary browser specimen, not shipped Electron code. `app.js` owns the topic sidebar and automatic Canvas icon-rail state, separate note/insight composers, source-highlight note capture, saved note/question support selection and Playbook/export; `workspace.js` owns Distilled/Expanded Canvas presentation, an unbounded dotted camera, topic/chapter origin edges, temporary positions, contextual back/forward navigation, saved exploration questions, pasted-source reading and exact-highlight navigation; `index.html` owns the shell and native dialogs; `styles.css` owns specimen layout. Pasted-text sources work only for the current page session. File/URL extraction, provider retrieval, exploration responses and durable anchors are not implemented here. `prototype-manifest.json` records the exact specimen files; the design contract records founder decisions and review gates.
