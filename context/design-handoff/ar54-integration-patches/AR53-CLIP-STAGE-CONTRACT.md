# AR-53 clip stage timestamp contract (pending)

AR-54 must not edit `src/contracts/**`. This is the precise patch the
contracts owner applies on `lane:contracts` (`codex/ar-53-clip-stage-contract`)
**only after root supplies that lease**. Until then the producer keeps actual
`record.stages` and cannot decode a real Manim `seconds: 0` stage.

Do not substitute generated plan timings, invent a second clip identity, or
weaken the duration bound.

**Status: pending until applied.** Combined player seek (`0/2/5` linear,
`0/2/5/8` weighted from `src/render-worker/recipe-math.ts`) is blocked on
this one comparison.

## Why

`decodeStages` in `src/contracts/explanation-artifacts.ts` rejects
`seconds < 0.1`. Installed recipe timestamps start at `0`. Duration stays
positive (`durationSeconds >= 0.1` and `<= 30`).

## Contract change (only this comparison)

`src/contracts/explanation-artifacts.ts` `decodeStages` (today ~349–354):

```ts
if (
  typeof decoded.value.seconds !== 'number' ||
  !Number.isFinite(decoded.value.seconds) ||
  decoded.value.seconds < 0.1 ||
  decoded.value.seconds > 15
) {
  return failed('bounds');
}
```

Replace with:

```ts
if (
  typeof decoded.value.seconds !== 'number' ||
  !Number.isFinite(decoded.value.seconds) ||
  decoded.value.seconds < 0 ||
  decoded.value.seconds > 15
) {
  return failed('bounds');
}
```

Do **not** change `durationSeconds` (`< 0.1` remains a bounds failure).

## Regression to add in `src/contracts/explanation-artifacts.test.ts`

Import `decodeVerifiedClipMetadata` and add:

```ts
it('accepts nonnegative finite stage timestamps and still requires a positive duration', () => {
  const renderer = {
    name: 'manim-community' as const,
    version: '0.21.0' as const,
    image,
  };
  const base = {
    sha256,
    mediaType: 'video/mp4',
    bytes: 4096,
    width: 1280,
    height: 720,
    durationSeconds: 10,
    renderer,
  };
  expect(
    decodeVerifiedClipMetadata({
      ...base,
      stages: [
        { name: 'Read the inputs', seconds: 0 },
        { name: 'Transform continuously', seconds: 2 },
        { name: 'Read the endpoint', seconds: 5 },
      ],
    }).ok,
  ).toBe(true);
  expect(
    decodeVerifiedClipMetadata({
      ...base,
      stages: [{ name: 'Show weights', seconds: 15 }],
    }).ok,
  ).toBe(true);
  expect(
    decodeVerifiedClipMetadata({
      ...base,
      stages: [{ name: 'Show weights', seconds: -0.1 }],
    }).ok,
  ).toBe(false);
  expect(
    decodeVerifiedClipMetadata({
      ...base,
      stages: [{ name: 'Show weights', seconds: Number.NaN }],
    }).ok,
  ).toBe(false);
  expect(
    decodeVerifiedClipMetadata({
      ...base,
      durationSeconds: 0,
      stages: [{ name: 'Show weights', seconds: 0 }],
    }).ok,
  ).toBe(false);
});
```

`sha256` and `image` already exist in that file.

## After this patch is on the integration head

AR-54 `clip-projection.test.ts` currently documents that a `seconds: 0`
record cannot project (`clipResultFromRetained` returns null). Flip that
case to expect `verified.stages === record.stages` including `0`. Do not
start using `plan.stages`.

## Out of scope

- Public service idempotency still returns the original request completion
  without a recipe-hash check (`service.ts` ~444–445). That predates remote
  delivery and is not proven by this producer repair.
- Account-bound approved-plan/source/lesson ownership remains AR-48.
