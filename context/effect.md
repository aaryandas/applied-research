# Effect reference and adoption

Effect is a candidate for backend orchestration. The application does not yet depend on it, and adding its source does not finalize backend architecture. The supplied [v3 getting-started documentation](https://effect.website/docs/v3/getting-started) establishes the reference generation; avoid mixing v4 prerelease examples into v3 work.

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

## Proposed use when implementing the backend

Use Effect where typed failures, cancellation, resource ownership, or service composition make a concrete operation clearer. Keep ordinary domain data simple. Construct and dispose a managed runtime at an application composition boundary; avoid starting unrelated runtimes throughout domain logic. Validate untrusted inputs, and send plain serializable values through the Electron bridge rather than Effect services or runtime objects. The actual service boundaries and persistence choice still require design alongside the first implemented use case.

Install a compatible published package when implementing that use case. Never import from this subtree or ship it as an application dependency. Editor search/watchers and TypeScript auto-imports exclude the reference tree; linting and formatting ignore it. Test, coverage, Sonar and packaging configurations target application paths. Evaluate any optional Effect language tooling against the chosen compiler version when adopting the library.

## Deliberate updates

Do not track a floating branch. Choose a release, verify its resolved commit and compatibility, then update explicitly:

```sh
git subtree pull --prefix=context/repos/effect https://github.com/Effect-TS/effect.git refs/tags/effect@<reviewed-version> --squash
```

Record the selected tag and resolved commit in this page and `references.json`, inspect the source diff, and run the application checks. Keep edits outside the subtree so its contents remain identical to upstream. A source update does not automatically update application dependencies.
