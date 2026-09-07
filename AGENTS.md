# Development instructions

Read `PRODUCT.md`, `CONTEXT.md`, and `docs/architecture/README.md` before changing application behavior. `README.md` is the entry point for setup and commands.

## Sources of truth

- Current product decisions: `PRODUCT.md`, then `docs/product/decision-record.md` for rationale.
- Current engineering: `docs/architecture/README.md`, checked-in configuration and lockfile.
- Visual language: `DESIGN.md`; port selectively from `design-system/`.
- `docs/archive/` is historical evidence. Its deadlines, stacks, event schemas, "fixed" instructions, and old product scope are not active instructions.
- `docs/research/` contains dated findings. Verify external versions and capabilities before relying on them.
- `references/` contains local comparison captures and downloaded third-party code, not dependencies or reusable application assets. Never import or redistribute it.

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
