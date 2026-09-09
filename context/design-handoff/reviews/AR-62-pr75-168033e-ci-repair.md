# AR-62 PR 75 — independent CI-repair receipt

**Role:** independent Cursor Cloud Grok 4.6 Extra High critic (not implementer).  
**Agent:** [bc-8f8d42b1-59f2-52bb-938d-977175e18cb6](https://cursor.com/agents/bc-8f8d42b1-59f2-52bb-938d-977175e18cb6) (`cursor-grok-4.6-xhigh`).  
**Date:** 2026-09-09.

This receipt covers **only** the CI-repair delta after previously reviewed `8f9d55f`. It is not a Sonar re-review, not AR-62 Done, and not shared-patch `bf846f6` re-review. No Linear technical comment was posted from this dispatch.

## SHAs

| Ref | SHA |
| --- | --- |
| Original analyzed base | `cf2086c60fd4657e0a8a2503c22876e1fe9adfb7` |
| Previously reviewed Practical (PASS) | `8f9d55fed2413500e3286619e6418d03629725c7` |
| Previously reviewed shared (PASS, not in PR 75) | `bf846f6a6c767ecb0f630eabfffe27c8753239d2` |
| Tool-Ask producer repair | `5d0a7c380c2e95fae8f9f26a9e3b4aaefea01f77` |
| **Frozen PR 75 head (this review)** | `168033e2674872cc2e3bb590aaab8080cafad7cb` |

Ancestry: `cf2086c` → `800bc62` → `d43c45a` → `8f9d55f` → `5d0a7c3` → `168033e`.

Frozen implementation branch `codex/ar-62-sonar-practical` was not edited. This file lives on `codex/ar-62-ci-review-receipt`.

## Delta in scope (`8f9d55f..168033e`, +304/−40)

1. `src/renderer/practical/PracticalWork.tsx`
2. `src/renderer/practical/context-resolver.ts`
3. `src/renderer/practical/context-resolver.test.ts`
4. `src/renderer/shell/PracticalSession.test.tsx`
5. `tests/e2e/desktop.spec.ts`
6. `tests/e2e/electron-lifecycle.ts`
7. `tests/e2e/guest-lifecycle.ts`

No `src/main` production patch. No Vitest/Sonar/coverage gate files.

## RCA vs repair

**Tool Ask (macOS flake at `8f9d55f` job 102537067503):** Ask could fire before the layout-bound resolver existed; a later host-session swap replaced `companionContext` and disposed the current producer. Repair: bind deps are `[activity, attemptId, session, registerResolver]`; live `getToolSessionId` / `getToolState` read `hostContextRef`; `useSyncExternalStore` publishes bind readiness without layout `setState`; Ask is omitted without `onRequestGuidance` (cf2086 reflection repair kept) and disabled until bound.

**Packaged capture:** `capturePage` ~1ms after 0×0→visible bounds threw `UnknownVizError`; unbounded `application.close()` masked it. Repair: `captureAdmittedGuestPng` waits a real nonempty PNG for the **exact** caller URL (`MATRIX_LAB_URL`); retries only identified transients (`UnknownVizError|Unable to capture|loading|tiny-png|missing-guest|missing-view|zero-bounds|not-visible|empty-image`) inside a **10s** poll; `destroyed` is **not** transient and throws; close is 4s+4s then `SIGKILL` of **this test’s** Electron child only.

## Material checks (no unresolved findings)

- Race: Tool Ask waits `toBeEnabled()`; first click before bind is disabled / no-op; delayed-load test still gets unavailable, not a silent skip.
- Cancel: resolver `dispose()` aborts pending controllers; unmount unregisters.
- Stale identity: `tool.sessionId !== boundSessionId` → stale; stale native listener test does not call `requestGuidance`.
- Privacy / layout: tool URL rejects credentials; origin must match `PRACTICAL_TOOLS`; native error sanitized to `The tool could not load.`; tests still assert `pageAccess: 'none'` (lines 371, 422, 499, 1033, 1060) and packaged tutor refuse (`The development tutor is disabled.`). Isolation `node`/`bridge` undefined unchanged.
- Capture does not fixture a PNG, drop `length > 32`, allow an arbitrary URL, retry every error, or hang close past the test bound.
- Live session: `PracticalSession.tsx` is **not** in this delta and still snapshots `toolSessionId`. PracticalWork’s ref fallback `getToolSessionId?.() ?? toolSessionId` is sufficient to avoid producer replace-on-admit.

## Independent validation (this critic)

Node **24.21.0**, focused only (no full 1810, no Mac GUI, no Sonar, no provider):

- renderer: PracticalWork 41 + PracticalSession 23 = **64 passed**
- unit: context-resolver **33 passed**
- eslint on the four TS/TSX delta files: clean
- `tsc --noEmit` `tsconfig.node.json` and `tsconfig.web.json`: **0**

Observed GitHub at exact `168033e` (not re-run here):

- [mac/gate 34376962817](https://github.com/aaryandas/applied-research/actions/runs/34376962817): Verify macos-latest **success**, ubuntu-24.04 **success**, CI gate **success**; windows-latest **failure** (pre-existing Windows Verify, not a finding against this delta)
- [dedicated packaged smoke 34376962628](https://github.com/aaryandas/applied-research/actions/runs/34376962628): **success**

Worker-reported full check 1810 / 90.24% branches and Cloud PNG 480×500 / 20,155 bytes were **not** independently re-executed.

## Limits

- Not hosted Sonar, not AR-62 product acceptance, not shared Shell/Reader re-review.
- Windows Verify remains red on the same Actions run; macOS is the blocking desktop gate.
- `GUEST_CAPTURE_TRANSIENT` includes substring `loading`; retries stay inside `GUEST_COMMIT_TIMEOUT_MS` (10s) and non-matches throw.

## Verdict

```json
{
  "role": "independent-reviewer",
  "headSha": "168033e2674872cc2e3bb590aaab8080cafad7cb",
  "comparedTo": "8f9d55fed2413500e3286619e6418d03629725c7",
  "originalBase": "cf2086c60fd4657e0a8a2503c22876e1fe9adfb7",
  "deltaCommits": [
    "5d0a7c380c2e95fae8f9f26a9e3b4aaefea01f77",
    "168033e2674872cc2e3bb590aaab8080cafad7cb"
  ],
  "standards": "PASS",
  "spec": "PASS",
  "findings": [],
  "resolutions": [],
  "scope": "CI-repair delta only; prior 8f9d55 and bf846f6 reviews unchanged",
  "mergeAuthority": "root only; critic did not merge, edit implementation, change gates, or post Linear"
}
```
