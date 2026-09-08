# Applied Research — agent instructions

This is the shared entry point for coding agents. `CLAUDE.md` imports this file.

## Project

An [active presearch session](context/presearch.md) has reopened all prior product and technical choices. Read its newly stated requirements before interpreting older guidance as an agreed baseline. The current delivery objective is the [full desktop application](context/full-app.md), with MVP priorities used only for sequencing. OpenRouter is selected; the proposed task-recovery hardening is deferred. See [the working MVP](context/mvp.md) for its scope and limitations.

Applied Research is a learning workbench for builders. Learning paths lead from enough understanding to practical work in the learner’s own tools, then imported results, reflection, and the next step. Source-led research is a secondary flow. See the product context before changing behavior.

The repository now implements a first desktop MVP: arbitrary-topic learning spaces, a movable canvas with local SQLite saves, an OpenRouter tutor, an isolated embedded browser and a reusable matrix experiment. Structured curricula, broad ingestion, durable jobs and sync remain unimplemented. The active presearch conditionally reaffirms Electron for a desktop first release, subject to product validation; the MVP retains the installed stack, uses node:sqlite and connects through OpenRouter. Hosting, sync and later framework/provider comparisons remain open. Effect v3 source is available as a reference; it is not an installed application dependency.

## Read only what the task needs

[Context index](context/README.md) describes authority and ownership. Do not load the whole context directory or its vendored repositories.

| Task                                         | Read                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| Product behavior, scope, learning loop       | [Product](context/product.md), [domain](context/domain.md)                        |
| Process boundaries, backend design, security | [Architecture](context/architecture.md), [conventions](context/conventions.md)    |
| Find implementation and tests                | [Code map](context/code-map.md)                                                   |
| UI and visual assets                         | [Design](context/design.md), then the relevant `context/design-system/` reference |
| Setup, commands, CI                          | [Development](context/development.md)                                             |
| Packaging, releases, Sonar                   | [Releases](context/releases.md)                                                   |
| Effect APIs and patterns                     | [Effect guide](context/effect.md), then specific upstream source/tests            |
| Historical research or decisions             | [Knowledge base](context/knowledge-base.md), then the linked Obsidian notes       |

Before choosing or replacing technology, read the [decision audit](context/decision-audit.md). It records prior selections, later revisions, missing interview evidence, and discrepancies with this scaffold. Installed tooling is not proof of a founder decision.

## Working rules

- For the full application build, start at [the design/build handoff](context/design-handoff/README.md) and run it in the [next-run workflow](context/next-run.md): one lane label and one PR per ticket, Linear status transitions trigger cloud verification, macOS is the only blocking CI platform. Track all substantial work and decisions in the existing Applied Research Linear project (team AR). Present material ambiguities immediately with recommendations/options and obtain the founder’s decision before dependent implementation. Prefer supported libraries to custom equivalents; do not silently introduce or replace foundations.

- Use Node 24 LTS and npm, exact dependencies, and the committed lockfile. Install with `npm ci`.
- Keep main, preload, and renderer separate. Preserve sandboxing, context isolation, navigation restrictions, and permission denial. Expose only named, validated bridge operations; never raw IPC, credentials, SQL, or arbitrary filesystem access.
- Production AI is app-managed through an authenticated backend; the company provider key must never ship in Electron. Follow [credential ownership](context/credentials.md) and AR-12. The existing key-file importer is a development MVP path requiring replacement, not a production design approved by passing Sonar.
- Keep TypeScript strict and modules focused. Add abstractions and dependencies for implemented needs, not speculative future layers.
- During full-app gauntlet implementation, follow [the Sonar and TypeScript/Effect review cycle](context/design-handoff/GAUNTLET-PROMPT.md#sonar-cycle--required-throughout-implementation): serialize local scans of integrated code, fix introduced/material findings, require independent standards review and record revision-specific evidence in Linear before Done. A passing scan does not replace architecture review. Surface unavailable Sonar immediately; do not silently skip it or weaken gates.
- Keep human writing and AI contributions separately attributed. The MVP stores AI guidance as read-only assistant entries; human insights and theses remain human-authored. Source citations and experimental results need distinct provenance; a working artifact does not prove mastery.
- Keep real vault contents, credentials, and private experiment data out of application fixtures.
- Make changes within the requested scope. Read the owning context page before changing its contract; update that page and the code map when responsibilities change.
- Keep current decisions in `context/`. Put exploratory research and historical evidence in Obsidian. Use temporary storage for tool sessions and captures, not new root documentation folders.

## Effect reference

`context/repos/effect/` is a pinned, read-only upstream subtree. Search specific modules and tests when working on Effect; do not scan it as application code, import from it, format it, or edit it incidentally. Its upstream contributor instructions describe that upstream project, not this application’s npm workflow. Updates must deliberately select and record a reviewed release; see [provenance and update instructions](context/effect.md).

## Commands and checks

```sh
npm ci
npm run dev
npm run check          # formatting, lint, types, unit coverage, build
npm run test:e2e       # built Electron smoke tests
npm run package
npm run test:packaged
npm run dist          # unsigned installer candidates
```

Run `check` for code/config changes, Electron smoke tests for main/preload/renderer changes, and packaging plus packaged smoke tests for packaging changes. Linux desktop checks need a display or `xvfb-run --auto-servernum`. Test observable behavior and real risk; never weaken gates to get green CI.

Actions use full commit pins. PR code receives no provider, signing, or Sonar secrets. Releases remain unsigned draft candidates until signing/distribution is configured. Detailed conventions and operational limitations remain in the linked context pages.
