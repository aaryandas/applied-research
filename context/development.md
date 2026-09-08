# Development

Use Node 24 LTS and npm. `.node-version` works with version managers such as fnm; with nvm use `nvm install 24 && nvm use 24`. `npm ci` uses the committed lockfile and enforces the Node family. Installation downloads the Electron runtime as well as npm dependencies.

## Commands

| Command                 | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`           | Main/preload build, renderer hot reload, real Electron window                       |
| `npm run format`        | Format maintained code/config/current docs; excludes archives and visual references |
| `npm run check`         | Formatting, ESLint, both process type checks, unit tests/coverage, production build |
| `npm run test:watch`    | Unit-test feedback while editing                                                    |
| `npm run test:e2e`      | Real Electron smoke test against `out/`; run `build` first                          |
| `npm run package`       | Build and create an unpacked current-platform application                           |
| `npm run test:packaged` | Smoke test the unpacked application; run `package` first                            |
| `npm run dist`          | Build unsigned installers for the host platform; publishing disabled                |

Do not use `--passWithNoTests`. Combined coverage thresholds are explicit in `vitest.config.ts`. Startup wiring is verified through Electron rather than mocked unit tests. See [testing and CI](testing.md) for separate unit, renderer and integration commands, the Electron layers, Effect compatibility and remote activation status.

## Linux

Use a graphical session or Xvfb. GitHub's Ubuntu runner supplies the system libraries used by Electron; minimal Linux images may additionally need GTK 3, NSS, GBM, ALSA, and X11 libraries. Run as a normal user with a functional Chromium sandbox, not with `--no-sandbox`.

```sh
npm run build
xvfb-run --auto-servernum npm run test:e2e
npm run package
xvfb-run --auto-servernum npm run test:packaged
```

Playwright drives Electron's bundled Chromium; no separate Playwright browser download is needed. HTML test reports go to `playwright-report/`, screenshots and failure output to `test-results/`.

## Local configuration

No key is required for local canvas work. AI uses `OPENROUTER_API_KEY` or the native key-file import; see [MVP setup](mvp.md). Keep `.env` files and real vaults out of Git. Never put secrets in Vite-prefixed variables; bundled application assets can be read by users.

## Adding work

Add source beside its owning module, focused tests beside source, and cross-process checks under `tests/e2e/`. Keep `context/product.md` current when a product decision changes. Keep accepted engineering decisions beside the implementation; put exploratory research and historical context in the [Obsidian knowledge base](knowledge-base.md).

Use exact dependency versions and commit both manifest and lockfile. Dependabot proposes npm and Actions updates weekly. Review Electron/tool compatibility and re-run packaging when accepting updates.
