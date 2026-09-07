# Applied Research — agent instructions

This is the shared entry point for coding agents. `CLAUDE.md` imports this file.

## Project

Applied Research is a learning workbench for builders. Learning paths lead from enough understanding to practical work in the learner’s own tools, then imported results, reflection, and the next step. Source-led research is a secondary flow. See the product context before changing behavior.

The repository currently implements a development scaffold: Electron, React, strict TypeScript, an isolated preload bridge, and CI/release workflows. Learning paths, ingestion, persistence, experiments, and AI are not implemented. Electron is the provisional desktop choice; storage, AI providers, hosting, sync, and detailed backend boundaries remain open. Effect v3 source is available as a reference; it is not an installed application dependency.

## Read only what the task needs

[Context index](context/README.md) describes authority and ownership. Do not load the whole context directory or its vendored repositories.

| Task                                         | Read                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| Product behavior, scope, learning loop       | [Product](context/product.md), [domain](context/domain.md)                     |
| Process boundaries, backend design, security | [Architecture](context/architecture.md), [conventions](context/conventions.md) |
| Find implementation and tests                | [Code map](context/code-map.md)                                                |
| UI and visual assets                         | [Design](context/design.md), then the relevant `design-system/` reference      |
| Setup, commands, CI                          | [Development](context/development.md)                                          |
| Packaging, releases, Sonar                   | [Releases](context/releases.md)                                                |
| Effect APIs and patterns                     | [Effect guide](context/effect.md), then specific upstream source/tests         |
| Historical research or decisions             | [Knowledge base](context/knowledge-base.md), then the linked Obsidian notes    |

## Working rules

- Use Node 24 LTS and npm, exact dependencies, and the committed lockfile. Install with `npm ci`.
- Keep main, preload, and renderer separate. Preserve sandboxing, context isolation, navigation restrictions, and permission denial. Expose only named, validated bridge operations; never raw IPC, credentials, SQL, or arbitrary filesystem access.
- Keep TypeScript strict and modules focused. Add abstractions and dependencies for implemented needs, not speculative future layers.
- Human insights and theses remain human-authored. Keep AI interpretations distinguishable. Source citations and experimental results need distinct provenance; a working artifact does not prove mastery.
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
