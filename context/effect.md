# Effect reference and adoption

The founder selected Effect v3 for the authenticated backend during the CI setup session (AR-6/AR-8). The AR-12 server slice installs exact `effect@3.22.1`; this does not authorize rewriting the desktop or other modules. The supplied [v3 getting-started documentation](https://effect.website/docs/v3/getting-started) establishes the reference generation; avoid mixing v4 prerelease examples into v3 work.

Following the [Effect source-subtree guidance](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive), the repo includes upstream source at `context/repos/effect/`. It is pinned to **effect@3.22.1**, commit [`417e0faa80e471d77fc4a67452e68b09ae0ee861`](https://github.com/Effect-TS/effect/tree/417e0faa80e471d77fc4a67452e68b09ae0ee861). Machine-readable provenance is in [references.json](references.json); upstream licenses remain intact.

## Read selectively

All paths below are relative to `context/repos/effect/`.

| Question                                 | Source or example                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Composition, typed failures, concurrency | `packages/effect/src/Effect.ts`                                                                        |
| Services and dependency construction     | `packages/effect/src/Context.ts`, `packages/effect/src/Layer.ts`, `packages/effect/test/Layer.test.ts` |
| Resource lifetime and cancellation       | `packages/effect/src/Scope.ts`, `packages/effect/test/Scope.test.ts`                                   |
| Application runtime boundary             | `packages/effect/src/ManagedRuntime.ts`, `packages/effect/test/ManagedRuntime.test.ts`                 |
| Validation at external boundaries        | `packages/effect/src/Schema.ts`, `packages/effect/test/Schema/Schema/decodeUnknownSync.test.ts`        |

Search the relevant symbol and nearby tests instead of loading entire large modules. Treat upstream contributor instructions as upstream-specific; our application uses npm and its own verification workflow.

## Implemented backend use

The backend uses typed Effect failures for validation/provider/accounting boundaries, a semaphore and interruption-aware request flow, and one `ManagedRuntime` at composition. `uninterruptibleMask` preserves ownership across reservation and settlement while `restore` exposes only provider work to cancellation: an interrupt pending before dispatch releases, and an interrupt after dispatch may retain bounded cost. Its scoped database Layer closes the PostgreSQL pool; finite PostgreSQL/client query limits bound stalled statements and row locks. A client-side ambiguous transaction outcome remains conservatively retained, and automatic network-partition reconciliation is deferred. Shutdown disposes HTTP and Effect resources. Tests use public Effect primitives and `TestClock`. Read [the testing adoption gate](testing.md#effect-adoption-gate) before adding `@effect/vitest`: the pinned v3 adapter expects Vitest 3 while the application uses Vitest 4.

Use Effect where typed failures, cancellation, resource ownership, or service composition make a concrete operation clearer. Keep ordinary domain data simple. Construct and dispose a managed runtime at an application composition boundary; avoid starting unrelated runtimes throughout domain logic. Validate untrusted inputs, and send plain serializable values through the Electron bridge rather than Effect services or runtime objects. Additional service boundaries must still be designed alongside their first implemented use case.

Use the compatible published package installed from npm. Never import from the reference subtree or ship that subtree as application code. Editor search/watchers and TypeScript auto-imports exclude the reference tree; linting and formatting ignore it. Test, coverage, Sonar and packaging configurations target application paths. Evaluate any optional Effect language tooling against the chosen compiler version before adding it.

## Deliberate updates

Do not track a floating branch. Choose a release, verify its resolved commit and compatibility, then update explicitly:

```sh
git subtree pull --prefix=context/repos/effect https://github.com/Effect-TS/effect.git refs/tags/effect@<reviewed-version> --squash
```

Record the selected tag and resolved commit in this page and `references.json`, inspect the source diff, and run the application checks. Keep edits outside the subtree so its contents remain identical to upstream. A source update does not automatically update application dependencies.
