# Contextual help contracts

AR-53 freeze of the three additive envelopes for contextual Ask, retained visual explanations and companion guidance. Consumers are AR-49 (Canvas origin branching), AR-51 (contextual experience), AR-54 (Manim retention/playback) and AR-55 (authenticated companion). This page records the checkpoint; it is not an implementation.

Base: `codex/ar-walkthrough-integration` at `317c0721da715dc7c6dd489f24b68d2b5f124850`.

## Authority

Renderer requests may name a project, request, intent and retained identity. They may not attest account, AI provenance, imported evidence, measured results, remote URLs, filesystem paths, executable code, shaders or artifact bodies. Main re-resolves ownership and exact quotes from the same SQLite authority Reader uses. Backend derives the account from the session. Generated title/quote/rationale are `role: 'untrusted-display-copy'` and are never model or system instructions.

`LearningOrigin.entry` is an exact `EntryRevisionReference`. It may identify a saved question used as contextual origin or a Canvas follow-up branch. Insight `supports` remain a separate field. Existing source/path/highlight rules stand: a highlight still requires its source revision. `decodeLearningOrigin` accepts this origin. Live human-entry validation accepts it; SQLite persists the exact revision through reserved `0007_entry_origins.sql` (journaled after AR-47 `0005` and AR-51 `0006`). Live Practical origin/JSON boundaries still reject `entry`. Storage rejects missing entries and identity cycles.

Retained explanations require matching parent intent, every attempt intent, and a ready result kind/family: `text` → `text-answer`, `visual` → `scene` or `clip`. A supported plan's family must match that ready result (`spatial-assembly`/`two-link-arm` vs `linear-transform`/`weighted-combination`).

Companion guidance requests carry `expectedProjectGeneration` and `expectedRequestGeneration` like contextual help. Cancel uses `COMPANION_GUIDANCE_CANCEL_CHANNEL` with the same request id and generations. That envelope is not IPC registration, page observation, or an ambient API.

## Modules

| Module                                   | Envelope                                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/contracts/contextual-help.ts`       | Request identity, text/visual intent, highlight or saved-question locator, optional path, optional untrusted selection copy, explicit long-source grounding states, typed responses |
| `src/contracts/explanation-artifacts.ts` | Immutable attempts, four installed planner families, opaque retained media, verified clip metadata, main-assigned captures, local playback state                                    |
| `src/contracts/companion-guidance.ts`    | Serializable request/reply distinct from in-process `CompanionGuidanceInput`; explicit practical or Reader/Canvas targets; no ambient/page/outside-app observation                  |

Planner families are only `spatial-assembly`, `two-link-arm`, `linear-transform` and `weighted-combination`. Unsupported topics return the unsupported plan shape with textual/practical continuation. Artifact and measurement identity are assigned by main/backend after verification; a renderer `attribution: 'app-measured'` string is not proof.

## Out of scope

AR-52 onboarding/profile/proposal/selected-lesson contracts are unchanged. AR-48 source-route tests are unchanged. Named bridge registration, SQLite tables, HTTP routes, Manim delivery and companion adapters belong to AR-51/54/55 and the coordinator.
