## Ticket and lane

Linear: AR-___ · Label this PR `lane:<name>` (see `.github/lanes.json`). Base branch: the current integration branch.

## Change

What behavior changes, and why? Name any contract this touches.

## Candidate

Frozen revision: `<sha>` · Base: `<sha>`

## Verification

- [ ] `npm run check` on the frozen revision
- [ ] Electron suite on macOS (`npm run test:e2e`) — link the CI run or the recorded video
- [ ] Sonar: zero new violations on this diff, or list issue keys with a false-positive reason for the founder
- [ ] Independent review comment present (Claude action or named critic) with PASS
- [ ] Known limits stated below

## Limits

What this PR does not prove.
