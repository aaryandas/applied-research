# Applied Research

A learning workbench for builders: learn enough to try, work in your own tools, bring back results, and understand what to do next.

This repository currently contains a **development scaffold**, not a working learning product. The Electron shell, isolated preload bridge, React renderer, checks, and installer workflows are implemented. Learning paths, source ingestion, experiments, persistence, and AI are still to be built.

## Develop

Install **Node.js 24 LTS** (the version family in `.node-version`) and npm. Then:

```sh
npm ci
npm run dev
```

No account, API key, database, or cloud service is required to run the scaffold. If npm reports `EBADENGINE`, switch to Node 24; do not disable the engine check.

```sh
npm run check        # format, lint, types, unit tests with coverage, production build
npm run test:e2e     # launch and verify the built Electron application
npm run package     # unpacked application for the current platform
npm run test:packaged
npm run dist        # unsigned installers for the current platform
```

Linux desktop tests need a display; on CI use `xvfb-run --auto-servernum npm run test:e2e` (and the same wrapper for `test:packaged`). See [development](docs/development/README.md) for prerequisites and troubleshooting.

## Read before building

1. [PRODUCT.md](PRODUCT.md): current product direction and unresolved scope.
2. [CONTEXT.md](CONTEXT.md): current domain vocabulary.
3. [Architecture](docs/architecture/README.md): scaffold responsibilities and dependency rules.
4. [Development and CI](docs/development/README.md), [releases and Sonar](docs/development/releases.md).
5. [DESIGN.md](DESIGN.md): visual language; [design-system](design-system/README.md) is the standalone visual reference.

The [decision record](docs/product/decision-record.md) preserves this session's reasoning. [Historical documents](docs/archive/README.md) and [research](docs/research/) are supporting evidence, not current implementation instructions.

## Repository layout

| Location         | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `src/main/`      | Electron lifecycle, privileged operations, navigation policy            |
| `src/preload/`   | Small typed bridge exposed through contextBridge                        |
| `src/renderer/`  | React renderer and styles; no Node or Electron imports                  |
| `src/contracts/` | Serializable types shared across process seams                          |
| `tests/`         | Test setup and real Electron smoke tests; unit tests live beside source |
| `scripts/`       | Packaging verification and release tooling                              |
| `.github/`       | CI, release, Sonar, and dependency updates                              |
| `docs/`          | Active product/engineering documents and labeled historical evidence    |
| `design-system/` | Visual reference and owned assets, excluded from application packaging  |
| `references/`    | Local comparison material; captures/downloaded code excluded from Git   |

GitHub: [aaryandas/applied-research](https://github.com/aaryandas/applied-research). Planning: [Linear](https://linear.app/aaryan-das/project/applied-research-64943086779b).

The existing repository [license](LICENSE) is GPL version 3. The scaffold preserves it; the old Apache-2.0 statement is superseded by the repository license.
