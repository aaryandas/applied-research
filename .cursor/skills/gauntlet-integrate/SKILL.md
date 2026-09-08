---
name: gauntlet-integrate
description: Land a factory PR onto integration when gauntlet:land, CI gate, Bugbot, and Fable WIN are all present. Use as the integrate agent. Do not redesign.
---

# Gauntlet integrate

Merge mutex for Applied Research. Target branch is **`integration`**, never `main`.

## Required (all)

1. GitHub label `gauntlet:land` on the PR
2. **CI gate** success on the frozen SHA
3. Bugbot success (no unresolved blocking findings)
4. Fable **WIN** for that SHA (not an older SHA)

If any are missing: stop. Do not land. Do not substitute author thumbs-up for Fable.

## Do

- Rebase onto current `integration` if needed
- Merge to `integration` only
- Record the land on `factory/BOARD.md` (ticket → Done)
- Serialized local Sonar if configured; otherwise note “Sonar not configured”
- Stop

## Must not

- Merge to `main`
- Deploy (Railway, releases, signing, billing)
- Redesign or “while we’re here” product work
- Use merge-queue until `gauntlet:land` exists as a real label

On conflict or Sonar blocker: Park and ping founder. Detail: [references/land.md](references/land.md).
