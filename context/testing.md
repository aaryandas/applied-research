# Testing and CI

Work is tracked in [AR-8](https://linear.app/aaryan-das/issue/AR-8) and Sonar activation in [AR-9](https://linear.app/aaryan-das/issue/AR-9). Use the installed exact dependencies and Node 24; CI must not require provider credentials, personal data or a live AI service.

## Test layers

| Layer               | Command                    | Boundary exercised                                                                                            |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Unit                | `npm run test:unit`        | Node environment: validation, navigation policy, mathematics and provider parsing with injected responses     |
| Renderer            | `npm run test:renderer`    | React Testing Library + jsdom: user interactions, autosave and explicit bridge fakes                          |
| Integration         | `npm run test:integration` | Real SQLite: persistence/reopen, attribution, concurrent connections and project separation                   |
| Combined coverage   | `npm run test:coverage`    | All three Vitest projects; one LCOV report and 90% line/function/branch/statement thresholds                  |
| Desktop integration | `npm run test:e2e`         | Built Electron main → preload → renderer, offline restart, guest isolation and synthetic OpenRouter responses |
| Packaged desktop    | `npm run test:packaged`    | The same Electron journeys against the unpacked distributable                                                 |

Vitest projects use separate Node and DOM environments. New pure `.test.ts` files beside source enter the unit project; `.test.tsx` files enter the renderer project. Real adapter tests belong in `tests/integration/`; the existing adjacent SQLite store suite is explicitly included there. New test directories must also be included in TypeScript checking. Do not weaken coverage, permit an empty suite, or commit focused tests to make CI pass.

The combined run avoids averaging separate coverage percentages. JUnit results are written to `coverage/tests.xml`. Entry-point wiring remains outside unit coverage because real Electron tests exercise it. React tests alone cannot verify preload isolation, native guest behavior or Electron's bundled Node/SQLite runtime.

Playwright's Electron automation is [experimental](https://playwright.dev/docs/api/class-electron); keep the pinned version and validate upgrades against real desktop and packaged runs. Tests use temporary user-data directories and synthetic content. No separate Playwright Chromium installation is needed. Linux runs under Xvfb with the Electron sandbox intact. Screenshots, traces and HTML reports are retained by CI for failures.

## Required pipeline

The [full-app gauntlet](design-handoff/GAUNTLET-PROMPT.md#sonar-cycle--required-throughout-implementation) additionally requires coordinator-owned sequential local Sonar scans for integrated application slices and analyzed-code repairs, issue triage/fixes in Linear, and independent TypeScript/Effect standards review. This is an explicit build-task cycle, not a background scheduler. Hosted CI does not run the local scanner.

Latest local verification on macOS arm64: `npm run check` passed (42 tests in 9 files); all three built Electron tests passed; packaging and the same three packaged tests passed. Vitest coverage: 96.89% lines, 92.19% branches, 92.85% functions and 95.71% statements. Sonar reports 95.4% coverage using its own analyzer and denominator.

Every pull request and push to `main` invokes the shared Linux/Windows/macOS workflow. It performs locked installation, formatting, zero-warning lint, both TypeScript checks, combined unit/component/integration coverage, build, Electron tests, unpacked packaging and packaged tests. Named steps identify the failed layer. Each platform must pass; cancellation, failure or a skipped verification job must not produce a passing `CI gate`.

The observed GitHub check context is `checks / CI gate`. Founder-approved main protection (verified in existing legacy branch rules): require a pull request, this check on an up-to-date revision, and prohibit force pushes/deletion. No second reviewer is mandatory; administrators are included and conversation resolution remains required. Do not require the main-only Sonar check on pull requests.

The foundation PR already passed all three platforms at `6c5e194aeeeb5dd1421d91661d11df2dfe7129b3`: [run 34088355202](https://github.com/aaryandas/applied-research/actions/runs/34088355202). That run predates the uncommitted MVP and these test improvements. Remote success for the new revision must be recorded after publication; local success does not establish it. The rulesets list is empty, but the legacy branch-protection API confirms these protections are already active. Publishing the current MVP prerequisite and updated CI remains pending founder confirmation.

## Effect adoption gate

Effect is not currently an application dependency. Its v3 source reference is not an installed runtime or permission to rewrite the backend. The founder selected Effect v3 for the next backend work, with no migration in this CI task. Confirm the first backend slice through [AR-6](https://linear.app/aaryan-das/issue/AR-6).

For approved Effect v3 code, prefer its supported test primitives: test Layers for service dependencies, `TestClock` for retry/time behavior, `Effect.exit` for typed failures, and scoped execution for finalizers and cancellation. Include tests for interrupted requests, resource cleanup and main-process runtime disposal when those behaviors exist. Keep bridge messages plain validated data and keep the real Electron tests.

The reference contains `@effect/vitest@0.30.0`. Published metadata verified during this audit requires `effect ^3.22.0` and `vitest ^3.2.0`; this app installs Vitest `4.1.11`. Do not use `--force`/`--legacy-peer-deps` or silently downgrade. On 2026-09-08 UTC, the founder accepted Effect 3.22.1 with the existing Vitest 4 setup and Effect's public testing APIs, without this adapter. Verify exact dependency compatibility at adoption; do not build a custom Effect testing framework. Reference: [pinned upstream adapter](https://github.com/Effect-TS/effect/tree/417e0faa80e471d77fc4a67452e68b09ae0ee861/packages/vitest), [Vitest 4 projects](https://v4.vitest.dev/guide/projects).

## Sonar activation

The workflow now checks required configuration before the cross-platform build. Activation requires an approved persistent Community Build instance reachable over HTTPS, a Sonar project, repository variables `SONAR_ENABLED=true`, `SONAR_HOST_URL`, `SONAR_PROJECT_KEY`, and a project-scoped `SONAR_TOKEN` secret. Enter secrets through GitHub's secret UI or secure stdin, never tracked files or Linear. An enabled but incomplete setup fails explicitly; an unconfigured instance remains disabled.

The founder selected a local-only instance. No paid or public server is authorized. The [local instance](sonar-local.md) is running and verified under AR-9. A local instance alone does not make hosted GitHub analysis operational. Community Build's [small-scale host requirements](https://docs.sonarsource.com/sonarqube-community-build/server-installation/server-host-requirements) specify 2 cores, 4 GB RAM and 30 GB disk; size the database and operating headroom separately. Use supported persistent PostgreSQL and review Linux/Elasticsearch requirements for the chosen host before deployment. See [release operations](releases.md) for the repository settings and analysis boundary.
