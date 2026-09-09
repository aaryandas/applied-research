# AR-51 integration patches

These are **not applied** on `codex/ar-51-contextual-cloud`. Lane `explanations` cannot edit shared store/IPC/Shell/backend composition. Root/AR-56 applies the shared desktop patches; AR-48 applies the HTTP/runtime/provider registration. Do not treat this checkpoint as mounted in production until those patches land.

Base for this consumer: `b9232d28a3eef8fea275369b9f5842a4b6d7a3f1`.

| Patch                                                                                                                                            | Owner               | File                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | -------------------------------------------------------------------------- |
| SQLite journal, `EXPECTED_TABLE_COLUMNS`, `WorkspaceStore`, DesktopBridge, preload, `src/main/index.ts`, Shell, App.test                         | AR-56 / coordinator | [ar56-shared-desktop.patch.md](./ar56-shared-desktop.patch.md)             |
| `HttpDependencies`, `POST /v1/learning/explanation-plans`, runtime provider/service, optional `explanation-planner` union + `workspace-plain-v1` | AR-48               | [ar48-planner-registration.patch.md](./ar48-planner-registration.patch.md) |

Migration lease: **0006_contextual_retention.sql** (this ticket). 0004 Practical, 0005 onboarding (AR47), 0007 entry origin reserved. Never register 0006 as journal idx 5.

AR-54 clip player remains unmounted. Main consumes `requestClip` and currently returns the honest unavailable state.
