## Ticket and lane

Linear: AR-___ · Label this PR `lane:<name>` (see `.github/lanes.json`). Base branch: the current integration branch.

## Change

What behavior changes, and why? Name any contract this touches.

## Candidate

Frozen revision: `<sha>` · Base: `<sha>`

## Verification

- [ ] `npm run check` on the frozen revision
- [ ] Electron suite green on macOS CI — link the run
- [ ] Cloud verifier screen recording attached to the ticket
- [ ] Independent source review at this head; hosted Sonar is main-only after merge (PR code receives no Sonar secrets). List unresolved material finding keys; do not waive them.
- [ ] Independent Cursor Cloud Grok 4.6 Extra High PASS at the exact head (authenticated agent/run, not a marker comment)
- [ ] Known limits stated below

## Limits

What this PR does not prove.
