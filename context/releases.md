# CI, releases, and Sonar

## Pull requests and main

See [testing and CI](testing.md) for test layers, Effect compatibility, observed remote results and pending activation decisions. GitHub analysis against the Railway-hosted instance is tracked in [AR-45](https://linear.app/aaryan-das/issue/AR-45); the optional local Compose instance remains [AR-9](https://linear.app/aaryan-das/issue/AR-9).

`ci.yml` calls a reusable verification workflow on pull requests and pushes to main. The workflow runs locked installs, format/lint/type/unit/coverage/build checks, Electron smoke tests, unpacked packaging, and a packaged smoke test on Linux, Windows, and macOS. The final **CI gate** is the stable check to require in branch rules; it fails if any platform fails or is skipped.

Actions are pinned to immutable revisions. Jobs have read-only repository permissions and bounded timeouts. Superseded PR runs are canceled. No signing, provider, or Sonar secrets are passed into the reusable PR verification workflow.

## Installer candidates

`release.yml` runs manually or on tags matching `v*`. It verifies the same revision through the reusable workflow, then builds native installer candidates for the runner architecture on macOS, Windows, and Linux. Artifacts are retained for 14 days. Linux candidates are AppImage, Windows NSIS, macOS DMG and ZIP. Architecture appears in each filename; additional architectures are not claimed.

Desktop packages register only the `com.aaryandas.appliedresearch`
authentication scheme. The exact callback is
`com.aaryandas.appliedresearch://auth/callback`; main-process validation rejects
other hosts, paths, query-bearing callbacks, mismatched state, replay and cold
callbacks without a pending sign-in. The runtime also calls the platform
protocol-registration API before readiness and fails new sign-in closed when
registration is unavailable.

The backend pins Electron social sign-in to its same-origin
`/auth/electron/callback` page. That page runs a self-hosted bundle of the
maintained Better Auth Electron proxy client under a restrictive CSP; no CDN,
inline script, token display or browser storage is used. The bundle is a backend
deployment asset and remains excluded from desktop installers with the rest of
`out/backend/**`.

Desktop packaging explicitly excludes `out/backend/**`. Server-only auth,
accounting, provider adapters and system prompts remain deployment artifacts and
must not ship inside the Electron installer. `drizzle/**` remains packaged for
the desktop's reviewed local SQLite migrations. Packaged smoke tests must inspect
the application archive as well as exercise protocol launch and local
save/restart.

A version tag must exactly equal `v` plus `package.json`'s version. Tag builds create a **draft GitHub Release** with installers and SHA-256 checksums only after all verification and packaging jobs pass. Manual runs produce workflow artifacts only. Publishing the draft to users is a deliberate separate step.

The candidate installers are **unsigned and not notarized**. The default Electron icon is temporary. This pipeline verifies distribution mechanics, not production distribution readiness. Signing credentials, macOS identity/notarization, Windows signing, and final application artwork require dedicated setup. `electron-builder.yml` currently disables macOS signing explicitly; change that configuration when signing is selected. No auto-updater is configured.

Only the draft-release job has `contents: write`. It uses the `release` environment. Configure environment protection and branch/tag restrictions in repository settings before using it for production release operations.

## Railway backend deployments

The API service requires the non-secret Railway variable `RAILPACK_INSTALL_CMD` with the value `npm ci`. Railpack owns that install phase; `railway.json` must keep the build phase at `npm run build:backend` rather than performing a second clean install. The pre-deploy phase runs the single migration command `npm run migrate:backend:built` before starting the backend. Do not replace that migration with a schema push or database reset.

## SonarQube Community Build

GitHub analysis uses the Railway-hosted Community Build instance selected after AR-9: [https://sonarqube-production-6550.up.railway.app](https://sonarqube-production-6550.up.railway.app), project `applied-research-hosted`. Local Compose remains optional developer tooling; do not point GitHub at localhost.

Sonar supplements the required CI gate. Community Build supports default-branch analysis, not native PR or multiple-branch analysis. The Sonar workflow accepts only main, verifies the revision first, obtains LCOV coverage from the macOS (gating) verification leg, then scans first-party `src/` code and waits for the quality gate. It does not scan generated output or the design-system study. Research and historical evidence live outside the repository.

The workflow uses that Railway host and project key unless repository variables override them. Set `SONAR_ENABLED=false` to disable. A project-scoped analysis token is still required:

| Repository setting           | Value                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------- |
| Secret `SONAR_TOKEN`         | Project analysis token for `applied-research-hosted`                          |
| Variable `SONAR_HOST_URL`    | Optional override; default `https://sonarqube-production-6550.up.railway.app` |
| Variable `SONAR_PROJECT_KEY` | Optional override; default `applied-research-hosted`                          |
| Variable `SONAR_ENABLED`     | Optional; `false` disables the workflow                                       |

Never paste the token into a tracked file. An enabled workflow with a missing token fails explicitly.

Do not make this main-only Sonar workflow a required PR status. If native PR analysis is needed, evaluate SonarQube Cloud separately against the repository's visibility and current plan limits.

Official references: [Community Build limitations](https://docs.sonarsource.com/sonarqube-community-build/devops-platform-integration/github-integration/introduction), [GitHub analysis setup](https://docs.sonarsource.com/sonarqube-community-build/devops-platform-integration/github-integration/adding-analysis-to-github-actions-workflow), [electron-builder GitHub Actions](https://www.electron.build/docs/github-actions/).

## External setup checklist

- Require **CI gate**, a pull request, and the desired review policy on main in GitHub repository rules.
- Configure the release environment and confirm which installer architectures to support.
- Store `SONAR_TOKEN` in GitHub Actions secrets after creating a project analysis token on the Railway instance.
- Configure code signing before describing builds as signed or production-ready.

Checking in workflows does not establish that a remote run passed. Record actual GitHub run results in the implementation handoff.
