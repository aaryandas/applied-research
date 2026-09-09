## Ticket and lane

Linear: AR-___ · Label this PR `lane:<name>` (see `.github/lanes.json`). Base branch: the current integration branch.

PR title and every commit subject must use `type(scope): AR-NN description`, for example `fix(ci): AR-41 make platform checks portable`.

## Change

What behavior changes, and why? Name any contract this touches.

## Candidate

Frozen revision: `<sha>` · Base: `<sha>`

## Verification

- [ ] `npm run check` on the frozen revision
- [ ] Electron suite green on macOS CI — link the run
- [ ] Cloud verifier screen recording attached to the ticket
- [ ] Sonar: zero new violations on this diff, or list issue keys with a false-positive reason for the founder
- [ ] Independent review comment present (Claude action or named critic) with PASS
- [ ] Known limits stated below

## Limits

What this PR does not prove.
