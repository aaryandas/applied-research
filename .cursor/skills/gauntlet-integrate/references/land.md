# Land protocol

`integration` is the reviewed-slice branch. Create/protect it is a **founder** GitHub action. This agent only merges when that branch exists and gates pass.

## Order

1. Confirm PR base is `integration` (or retarget if the founder already created it).
2. Confirm label `gauntlet:land`.
3. Confirm check name **CI gate** succeeded (workflow in `.github/workflows/ci.yml` → reusable verify).
4. Confirm Bugbot: no unresolved blocking comments, or fail-on-unresolved if enabled.
5. Confirm Fable WIN text for this SHA in the PR or `factory/evidence/AR-n/`.
6. Confirm the Linear issue has the proof video for this SHA (unless harness-only skip).
7. Rebase; merge; update BOARD.

## Not landing

PRs into `main` are human-only. `codex/integration-20260908` is a **product** integration candidate, not this factory branch. Do not treat it as `integration`.

## After merge

Do not run deploy-on-green. Status automation may report the new BOARD row.
