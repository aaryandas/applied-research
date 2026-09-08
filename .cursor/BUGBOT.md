# Bugbot — Applied Research

Project review gates for Bugbot. Agent coding conventions live in `.cursor/rules/`; this file is for PR review only.

## Block on

- **Provenance:** AI interpretations stored as human insights or theses. Source citations mixed with experimental results. Missing origin for imported artifacts.
- **Mock success:** tests that pass without exercising the claimed behavior; `--passWithNoTests`; coverage or lint gates weakened to go green; empty assertions.
- **Renderer secrets:** credentials, API keys, vault paths, SQL, or raw filesystem access in `src/renderer/`, Vite-prefixed env, or bundled renderer assets.
- **Process isolation:** renderer importing Electron/Node/main/preload; raw IPC; disabled sandbox, context isolation, or navigation restrictions; new CSP exceptions for renderer networking without a recorded product decision.
- **Effect-as-app:** importing or shipping `context/repos/effect/` as an application dependency.
- **Factory self-accept:** PR that claims Done, lands to `main`, deploys, or skips independent critique. Product workers must not merge themselves.
- **Missing proof:** `AR-*` user-visible slice with no proof video attached to the Linear issue (screenshot-only or “tests passed” is not enough).
- **Secrets in git:** `.env`, tokens, signing material, real vault contents, private experiment data.

## Do not block on

- Draft PR status (factory PRs start as drafts).
- Unsigned installer candidates labeled as such.
- Missing Railway/OpenRouter/Sonar when the ticket is harness-only or the decision audit still records those as open.
- Formatting-only or documentation-only diffs that do not change app behavior.

## Evidence

Require named acceptance criteria from the ticket envelope when the PR is an `AR-*` factory slice. A passing unit test that does not cover the stated risk is not enough. Prefer Electron smoke / Playwright **and** a Linear proof video for user-visible behavior.

If the diff touches persistence, auth, or providers, demand a threat note in the PR: what the renderer still cannot see.
