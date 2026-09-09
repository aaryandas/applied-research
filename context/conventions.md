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

Run focused TDD/unit tests and `npm run check` locally for code/config changes. The founder prohibits local Playwright, `npm run test:e2e`, Playwright-backed `npm run test:packaged`, and local test traces/videos to preserve disk space. Continue authoring relevant desktop specs; Cursor cloud executes targeted Playwright scenarios and records the hands-on acceptance journey at the exact PR revision. GitHub CI on macOS retains the blocking full suite, including Electron and packaged smoke tests. Cloud Linux smoke tests use `xvfb-run --auto-servernum` when no display is available. A PR can be ready after permitted local checks pass; report unrun remote checks as pending, never failed or waived merely because they run remotely. This execution-placement policy supersedes older local e2e guidance and does not disable tests or alter package commands.

Keep tests focused on observable behavior and real risk. Domain tests belong next to source; process-level behavior is exercised in `tests/e2e/`. Do not make empty tests pass silently or weaken gates to get green CI.

Workflow actions are pinned to full commit hashes. PR code receives no provider, signing, or Sonar secrets. Releases are unsigned draft candidates until distribution/signing is intentionally configured; never call them production-ready.
