# Critic protocol

Each critique is a new Fable session (`claude-fable-5-1-thinking-high`, `readonly: true`).

## Compare

1. Envelope outcome and acceptance bullets
2. Required states (empty / loading / error / offline / canceled / retry)
3. Provenance: human vs AI text; source vs experiment
4. Electron isolation if the diff touches processes
5. Artifacts vs [context/design.md](../../../../context/design.md) when visual

A passing `npm run check` is not a WIN if the envelope’s user-visible criteria are unmet. A screenshot of the happy path is not a WIN if other required states are in scope.

## Output shape

```text
SHA:
Ticket: AR-n
Verdict: WIN | LOSE | UNJUDGEABLE
Largest gap: (LOSE only, one)
What was inspected:
What was missing:
```

Cap inner rounds at 3 (coordinator). After 3 LOSEs, Park. Repairing must meet the **same** critic criteria with **new** evidence on a new SHA.
