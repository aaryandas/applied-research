# Development

Use Node 24 LTS and npm. `.node-version` works with version managers such as fnm; with nvm use `nvm install 24 && nvm use 24`. `npm ci` uses the committed lockfile and enforces the Node family. Installation downloads the Electron runtime as well as npm dependencies.

`better-sqlite3` has different native ABIs under Node and Electron. Use the documented npm commands rather than invoking `vitest`, Electron or the packaged binary directly: Node-facing test commands run `native:node`, while `dev` and `test:e2e` run `native:electron`. `test:watch` always restores the Node ABI, including after an Electron run. Packaging uses electron-builder's supported rebuild and keeps its npm rebuild gate enabled.

## Commands

| Command                 | Purpose                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Main/preload build, renderer hot reload, real Electron window                                       |
| `npm run format`        | Format maintained code/config/current docs; excludes archives and visual references                 |
| `npm run test:delivery` | Node 24 `node --test` for trusted-evaluator, review, queue, Cursor API, and workflow YAML helpers   |
| `npm run check`         | Formatting, ESLint, both process type checks, delivery tests, unit tests/coverage, production build |
| `npm run test:watch`    | Unit-test feedback while editing                                                                    |
| `npm run test:e2e`      | Real Electron smoke test against `out/`; run `build` first                                          |
| `npm run package`       | Build and create an unpacked current-platform application                                           |
| `npm run test:packaged` | Smoke test the unpacked application; run `package` first                                            |
| `npm run dist`          | Build unsigned installers for the host platform; publishing disabled                                |

Do not use `--passWithNoTests`. Combined coverage thresholds are explicit in `vitest.config.ts`. Startup wiring is verified through Electron rather than mocked unit tests. See [testing and CI](testing.md) for separate unit, renderer and integration commands, the Electron layers, Effect compatibility and remote activation status.

## Storage migrations

Checked-in SQL under `drizzle/` is the authoritative, independently executable migration history and database-constraint definition. `src/main/workspace-schema.ts` is intentionally a query-only Drizzle mapping and does not duplicate every SQL `CHECK`, composite foreign key or deferrable constraint. Migration integration tests execute the reviewed SQL through Drizzle and directly inside a transaction; fault injection uses a test-only migration folder so production SQL has no test callbacks or application-defined SQLite functions.

Before changing migration SQL, preserve legacy refusal-before-change behavior, the verified pre-migration backup, transactional rollback and packaged migration coverage. Do not regenerate or replace reviewed SQL merely to make the query mapping appear authoritative.

Workspace migration failures retain their original message and cause on the in-process `WorkspaceMigrationError`, but main-process diagnostics deliberately do not print arbitrary error messages, SQL, full paths, user content or cause stacks. Logs expose the migration code, a validated project UUID when available, allow-listed cause names and codes, and sanitized source filename/line identities. The native dialog uses only code-selected recovery text. This privacy boundary intentionally gives support less raw detail than logging the original error would; a debugger or explicit user-provided database reproduction is required when the safe diagnostic is insufficient.

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
