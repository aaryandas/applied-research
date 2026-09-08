# Workbench records and service boundaries

Implementation contract for [AR-26](https://linear.app/aaryan-das/issue/AR-26), [AR-28](https://linear.app/aaryan-das/issue/AR-28) and [AR-12](https://linear.app/aaryan-das/issue/AR-12), September 8. The founder selected stable Drizzle with better-sqlite3 locally and accepted meaningful content revision history instead of universal event sourcing. PostgreSQL with Drizzle is the backend account/session/usage direction. This contract does not authorize deployment, sync, embeddings or additional spending.

## Authority and identity

The desktop owns projects, learning paths, source snapshots, writing, evidence and Canvas placement. Main is the sole local writer. Renderer and the untrusted guest never receive database handles, filesystem paths or session/provider secrets. The backend owns authenticated account/session/usage/provider operations; it receives only the bounded context of an explicit request and returns validated data for local acceptance.

Keep existing UUID identities. Every child record carries projectId; all commands resolve references within that project. Topics and lessons have the same identity in the sidebar, Reader and Canvas. A missing origin is null, never inferred from whichever lesson happens to be selected when an asynchronous operation finishes.

| Record                      | Required meaning                                                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project                     | Existing id, goal, createdAt and updatedAt; exact saved human goal retained.                                                                                                                                                   |
| Path revision               | Immutable ordered topic/lesson structure; accepting a new revision preserves older lesson identities and referenced work. No automatic mastery status.                                                                         |
| Topic / lesson              | Stable id, title and parent relationship; lesson references a readable source version or an explicit unsupported/pending state.                                                                                                |
| Source                      | Identity, title and acquisition provenance; a link without extracted text remains link-only.                                                                                                                                   |
| Source version              | Immutable canonical text, SHA-256, format, extraction/canonicalization version and acquisition time; authored/generated/imported/discovered provenance stays distinct. Changed text creates a new version.                     |
| Highlight                   | Source version, start/end offsets in its exact JavaScript UTF-16 string, exact quote and optional prefix/suffix. Require text.slice(start,end) === quote and nonempty in-range boundaries. No silent reanchor to changed text. |
| Human note                  | Exact own-word body, optional highlight and explicit topic/lesson origin. Free-standing legacy notes keep no fabricated highlight.                                                                                             |
| Human question              | Exact question and explicit optional origin; linking it does not turn it into evidence or imply an AI answer exists.                                                                                                           |
| Human insight               | Exact human body plus at least two distinct saved human note/question ids for new insights. Legacy insights are preserved as legacy/unlinked rather than discarded.                                                            |
| AI contribution             | Read-only assistant body with request/model provenance and source references. Provider answer annotation offsets are not source-text locators.                                                                                 |
| Activity / attempt / result | Explicit instructions and attempted setup; returned result is user-reported, imported, or app-measured, with its original provenance. Reflection is separate human writing.                                                    |
| Placement                   | Record id, view and world coordinates; moving a node does not create a content revision or copy its text.                                                                                                                      |

Meaningful content edits create immutable revisions and advance a current pointer in the same transaction. Every revision retains author kind, recorded time and referenced source/support revisions. Current search may later index current revisions; history remains available without installing an embedding service now. No duplicate event log or JSONL mirror is needed. Never rewrite AI material as human-authored.

## Persistence and migration

Use stable Drizzle SQLite schema/query support and better-sqlite3. Pin exact compatible versions and validate its native binary against the actual Electron runtime; Node24 tooling alone is not an ABI check. Keep WAL, FULL synchronous commits and enabled foreign keys. Use explicit reviewed migration SQL; never run schema push against user work.

First validate every legacy project document at runtime, including its entries and attribution. Unsupported newer schema or malformed records produce an actionable error without reset, truncation or partial migration. Take a consistent verified pre-migration backup using a supported SQLite operation, including committed WAL state. Migrate in one transaction and record schema version only after success. Preserve original legacy table/backup for recovery; do not invent source anchors from legacy links or answer citation offsets.

Preserve existing ids, timestamps, exact text, citations, placements and kinds. Keep compatibility with existing named workspace methods while normalizing projects/entries/content revisions underneath. Incrementally add source/path/provenance records as their real operations land. This is local content preservation, not a promise to recover an unacknowledged keystroke after process/device loss.

New edits use expectedRevision. A stale write fails with a conflict and keeps the caller's draft; it never overwrites newer text. Acknowledgements identify the revision actually committed. Save errors keep drafts visible and retryable. Ordinary navigation/quit must flush pending drafts or report the failure; later UI wiring must test this explicitly. Backups on the same device do not establish off-device recovery.

## Named desktop operations

Preserve listProjects/createProject/saveEntry/moveEntry while migrating their internals. Add focused operations as the learning flow is connected: getLearningWorkspace, importTextSource, saveReadingNote, saveQuestion, saveInsight, savePathRevision and recordPracticalResult. Inputs are bounded, serializable and runtime-validated; child ownership and relation constraints are rechecked inside the transaction. No generic table mutation, raw IPC or arbitrary path input is exposed.

The first connected local-record slice also names saveHighlight and moveLearningRecord. Revision-aware source, human-entry and path writes return a committed acknowledgement or a typed conflict with the current revision. The compatibility saveEntry operation remains for the existing renderer and does not accept a caller expectedRevision; it is not evidence of draft-safety wiring. Backend learning-path contributions enter only through a validated main-internal acceptance method, which allocates stable local topic/lesson identities; no renderer command can fabricate trusted AI attribution.

The source import operation receives user-selected text plus title and an optional validated acquisition URL. Native file selection/extraction remains a separate named operation. Imported HTML is untrusted and must pass a maintained extraction/sanitization pipeline before rendering; raw remote HTML/scripts never become trusted UI. A returned generated lesson is decoded and persisted as AI-authored source material before Reader opens it.

## Authenticated backend seam

Proposed named desktop operations: accountStatus, signIn, cancelSignIn, signOut and requestLearningStep/cancelLearningRequest. Main uses Better Auth's supported Electron system-browser flow and owns the PKCE/state transaction and session transport. The renderer receives only public account/state/quota information. The founder approved a seven-day rolling session renewed after one day, authoritative database session validation for each paid AI request, online revocation at sign-out and immediate local credential clearing even offline. Saved work stays editable; offline sign-out cannot guarantee remote revocation until connectivity returns. Exact callback origin/scheme and external configuration remain gated by AR-12; do not claim live authentication before configured end-to-end verification.

Backend request identity comes from the verified session, never a submitted userId. Request ids are scoped to that authenticated account. Validate bounded context/model/tool policies, reserve allowed cost atomically, call OpenRouter, validate response/provenance and settle actual usage. Cancellation or a network timeout may still incur provider charges; an uncertain request keeps a conservative reservation rather than refunding blindly. Production usage remains disabled until actual monetary limits and backend secrets are configured. One owned Effect v3 runtime composes adapters and releases resources on shutdown.

Return explicit success/unsupported/unauthenticated/quota-exceeded/unavailable/cancelled/invalid-request outcomes with safe public messages and request ids. Never forward raw auth/provider errors, headers, tokens or SQL. Offline local work is independent of account status. A stale or cancelled reply cannot attach to a newly selected project.

## Acceptance evidence

Migration/reopen must preserve synthetic legacy data byte-for-byte where required, reject malformed/newer data safely, roll back interrupted migration and retain a usable consistent backup. Test cross-project references, immutable history, stale-write rejection, AI attribution and exact Unicode highlight recovery. Validate native modules in built and packaged Electron, including restart and offline editing. Required check/coverage/Electron/packaging and serialized Sonar plus independent Fable review remain gates; this contract is not implementation evidence.
