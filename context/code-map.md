# Implementation map

This map describes the scaffold, not proposed features. Read [architecture](architecture.md) before adding process responsibilities.

| Location                       | Responsibility                                                    |
| ------------------------------ | ----------------------------------------------------------------- |
| `src/main/index.ts`            | Electron application and window lifecycle, security configuration |
| `src/main/navigation.ts`       | Renderer navigation policy and adjacent unit tests                |
| `src/preload/index.ts`         | Isolated bridge exposing desktop information                      |
| `src/contracts/desktop.ts`     | Shared serializable desktop contract                              |
| `src/renderer/`                | React scaffold, styles and component tests                        |
| `tests/e2e/`                   | Real Electron smoke tests                                         |
| `scripts/test-packaged.mjs`    | Smoke test against the packaged application                       |
| `scripts/release-assets.mjs`   | Release asset selection                                           |
| `electron.vite.config.ts`      | Main, preload and renderer builds                                 |
| `electron-builder.yml`         | Installer configuration and packaged file scope                   |
| `.github/workflows/verify.yml` | Shared cross-platform verification                                |
| `.github/workflows/`           | Pull request CI, candidate releases and optional Sonar analysis   |
| `context/design-system/`       | Standalone visual reference; not shipped with the scaffold        |
| `context/factory.md`           | Cursor factory graph and harness implementation handoff           |
| `context/repos/effect/`        | Read-only upstream reference; not application code                |

Unit tests live beside their source. Persistence, learning-path orchestration, provider integrations, and backend services do not yet have implementations or finalized module interfaces. Add map entries when those responsibilities exist.
