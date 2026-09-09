# AR-53 clip stage timestamp contract (published)

Temporary lease used only `src/contracts/explanation-artifacts.ts` and its
test. Companion contracts stay AR-55; onboarding contracts stay AR-47;
AR-51 CEF is frozen.

## Published SHAs

| Role                    | SHA                                                                     | Branch / PR                                                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract                | `dc2ad20ebe1064d0febc4623807920aae1c4e0d8`                              | `codex/ar-53-clip-stage-contract` vs `main` `f15880480ef428b5f7016173c4f8dcbcb23f3c61`. Draft `lane:contracts` PR: GitHub token 403; root must open from the branch (body in the worker report). Independent review required before main merge. |
| Cherry-pick on producer | `95f742bc4748359b191fc76f11518a4568744b9a`                              | Same tree as the contract commit (`cherry-pick -x dc2ad20e…`).                                                                                                                                                                                  |
| Consumer                | _(set in the following AR-54 commit that flips the 0s projection test)_ | `codex/ar-54-remote-delivery` / PR67. Cleanup/deadlines/`path.lessonId` remain from `f1e8d8aae023bb6792bac3c364b2870153cad23b`.                                                                                                                 |

`lane:explanations` (PR67) may fail Lane guard until the contracts PR lands on `main`. Do **not** widen `.github/lanes.json`. Root merges the contract first after required main checks, then reconciles PR67.

## Contract change (only this comparison)

`decodeStages` in `src/contracts/explanation-artifacts.ts`:

```ts
decoded.value.seconds < 0.1 ||
```

became:

```ts
decoded.value.seconds < 0 ||
```

`durationSeconds >= 0.1` is unchanged. Negatives, NaN, and timestamps `> 15`
still fail. This is a timestamp/duration distinction, not a gate weakening.

## After this patch is on the consumer head

AR-54 `clip-projection` keeps `record.stages` (including `0`) as verified
metadata. Do not substitute generated `plan.stages`.

## Out of scope

- Public service idempotency still returns the original request completion
  without a recipe-hash check (`service.ts` ~444–445).
- Account-bound approved-plan/source/lesson ownership remains AR-48.
- No App/Shell/index/preload edits.
