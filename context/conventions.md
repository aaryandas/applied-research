# Development instructions

Read `context/product.md`, `context/domain.md`, and `context/architecture.md` before changing application behavior. `README.md` is the entry point for setup and commands.

## Sources of truth

- Current product decisions: `context/product.md` and `context/domain.md`.
- Current engineering: `context/architecture.md`, checked-in configuration and lockfile.
- Visual language: `context/design.md`; port selectively from `context/design-system/`.
- Historical plans, research, decision transcripts, and comparison captures live in Obsidian; see `context/knowledge-base.md`. Consult them only when the task needs that context. They are not build dependencies or current instructions.
- Keep this repository focused on implementation and current engineering decisions. Put new research notes and design exploration in the knowledge base. Verify dated external findings before relying on them, and never import third-party comparison material as application assets.

## Implementation

- Node 24 LTS, npm with `npm ci`, exact dependencies and committed lockfile.
- Keep main, preload, and renderer separate. Renderer never receives credentials, arbitrary filesystem access, raw IPC, or SQL.
- Keep context isolation, sandboxing, navigation restrictions, and permission denial. Add named, validated bridge operations only as required.
- Use strict TypeScript and small modules with useful interfaces. Do not create empty packages, generic repositories, DI containers, or speculative adapters.
- Add dependencies only for implemented needs. Storage, AI providers, sync, and cloud hosting remain undecided.
- Human insights and theses remain human-authored. AI interpretations must not be stored as human conclusions.
- Source citations and imported experimental results need distinct provenance. A working artifact is not proof of mastery.
- No real vaults, credentials, or private experiment data in the repository or fixtures.

## Verification

Run `npm run check` for code/config changes, then `npm run test:e2e` for Electron or renderer changes. For packaging changes, run `npm run package` and `npm run test:packaged`. Linux smoke tests use `xvfb-run --auto-servernum` when no display is available.

Keep tests focused on observable behavior and real risk. Domain tests belong next to source; process-level behavior is exercised in `tests/e2e/`. Do not make empty tests pass silently or weaken gates to get green CI.

Workflow actions are pinned to full commit hashes. PR code receives no provider, signing, or Sonar secrets. Releases are unsigned draft candidates until distribution/signing is intentionally configured; never call them production-ready.
