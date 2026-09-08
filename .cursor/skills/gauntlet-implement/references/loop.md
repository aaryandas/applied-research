# Implementer inner loop

```text
Specify → Build → Exercise Electron → Record proof video → Attach to Linear → Compare vs reference → independent critique
```

You perform Specify through Compare. Critique is a **different** Fable session. If you are asked to “fix what Fable said,” treat the new critique criteria as given; do not argue from your previous rationale.

## Checks

| Change                    | Run                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Docs/config/harness only  | `npm run check`                                                                             |
| Main / preload / renderer | `npm run check` and Electron smoke (`npm run test:e2e`; Linux: `xvfb-run --auto-servernum`) |
| Packaging                 | `npm run package` and `npm run test:packaged`                                               |

Do not use `--passWithNoTests`. Do not skip engine-strict.

## PR

- Draft. Cite `AR-n` and the envelope path.
- Frozen SHA is the commit you asked to be reviewed. New commits need a new critic session.
- States to evidence when applicable: empty, loading, error, offline, canceled, retry.
- Proof video on Linear for this SHA (unless the envelope says harness-only skip). Cite the Linear URL in the PR.

## Visual fallback

If the envelope required Astra and it is unavailable, record the actual model id. Do not self-review. Sol High plus a **different-model** Fable critic is the conservative fallback.
