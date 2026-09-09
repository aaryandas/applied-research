# Learning onboarding contracts — AR-52

Implemented shared contract for the September 9 walkthrough learning flow.
This page owns the serializable types and process-neutral validators. AR-47
owns desktop persistence, preview projection and acceptance. AR-48 owns
`POST /v1/learning/onboarding` runtime, session auth and evidence producers.

Frozen integration base: `21cc4b95e3ba25abeeb5233cc89f5b6ae87e6b66`
(`codex/ar-walkthrough-integration`, ancestor `ea46e3d8dd387b4fdb5914c37f4062d80bdb9dc7`).

## Product sequence

Arbitrary goal → short open-ended diagnostic of real understanding → review
and revise a detailed sourced syllabus → explicit accept opens the first
substantive lesson. Remaining lessons generate when the learner reaches them.

`SourceDesktopBridge.generateSourcedLearning` stays compatible. It saves
immediately and only supports twelve flat `first-useful-step` lessons. It is
not a preview and must not replace an accepted course on every chapter.

## Modules

| File                                              | Owns                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/contracts/learning-onboarding.ts`            | Desktop bridge, human profile/interview, opaque identity, mapping, and renderer projection types |
| `src/contracts/learning-onboarding-api.ts`        | `POST /v1/learning/onboarding` discriminated envelope, limits, public messages                   |
| `src/contracts/learning-onboarding-validation.ts` | Strict bounded decoding for renderer inputs, projections and trusted backend envelopes           |
| `src/contracts/learning-onboarding.test.ts`       | Forged-authority, malformed/oversize, revision/target, compatibility and roundtrip proofs        |

Renderer TypeScript may import desktop projection types from
`learning-onboarding.ts`. It must not import `learning-onboarding-api.ts` or
trusted backend envelopes (`LearningOnboardingRequest` /
`LearningOnboardingResponse`). The desktop module does not import the API
module; the API module imports projection types from desktop. Main validates
the backend response, retains it under an opaque proposal id+revision, and
projects `CourseProposal`.

## Authority

- Account comes from the authenticated session. Request bodies must not include
  `accountId`, `account`, `evidenceContext`, canonical source text, `usePolicy`,
  `sourcePolicy`, paid-retry flags, `evidence` or `sourceScopes`.
- Human profile, interview answers and unacquired seed URLs are
  `untrusted-human-context`. Prior syllabus text is `untrusted-model-context`.
  Neither is source-evidence authority. Backend reacquires permitted originals.
- AI personalization and diagnostic observations are `author: 'ai'` with
  `masteryEstablished: false`. Reading or a working artifact is not mastery.
- `acceptCourse` / `ensureLesson` accept only opaque identity and a stored
  `PathOrigin` target. Canonical lesson/source/provenance JSON is rejected.
- Cancelled, coverage-pending, conflict, stale-revision and quota-exceeded
  outcomes set `retryable: false`. Unavailable may be retryable only when
  accounting is `none` or `released`. `charged` and `reservation-retained`
  unavailable outcomes are not retryable. Callers cannot request a paid retry.

## Bounds

16 topics and 160 lessons are the **maximum envelope**, not a target course
length. Existing admission remains: 64 KiB request, four acquired generation
sources, 48,000 canonical generation characters, 12 retrieval passages,
`google/gemini-3.8-flash` allowlist, US$20 monthly quota accounting.

`requestBytes` and `responseBytes` are UTF-8 **wire** ceilings. AR-47/AR-48
must call `parseLearningOnboardingRequestWire` /
`parseLearningOnboardingResponseWire` (or `decodeBoundedJsonWire`) on the raw
HTTP/fetch body. Decoded-object parsers do not reconstruct original raw bytes
and must not be described as a 64 KiB/4 MiB wire bound.

Topic and lesson prerequisite graphs must be DAGs listed in topological order.
The first listed topic/lesson is the graph source used as the opening lesson.
Lesson `sourceIds` must appear in the bibliography; bibliography `lessonStepIds`
must exist in the syllabus. Retrieval evidence quotes must equal the acquired
canonical slice. Selected-lesson `priorProposal` must equal `acceptedProposal`,
and `target.practice` must match the compact step's `practiceDigest` and the
same `sourceIds` set. `AcceptedStepMapping` rows must cover every syllabus step
and keep one local topic id per remote topic.

## Practice brief and capstone (AR-50)

Practice and capstone lessons carry a generated `CoursePracticeBrief`:
intended outcome, setup/prerequisites, explicit real tool choice, instructions,
observable checkpoints, expected learner-produced artifact, and a reflection
**prompt**. This is source-supported structured guidance, not renderer-parsed
`activity` prose and not a generic animation.

`activity` remains a concept/setup note only and is null on practice/capstone.
Optional `capstone: { stepId, outcome, substantial: true }` names at most one
substantial capstone. App-hosted tools reuse existing `PRACTICAL_TOOLS` ids;
learner-external names a real environment. AR-50 binds
`CoursePracticeActivityBinding` (`AcceptedStepMapping` + brief) onto existing
`PracticalActivity`. Attempts, results, files and human reflections stay in
`practical-work` / `practical-records`. Do not add a second attempt model.
AR-51 owns later explanation-request contracts; do not change companion or
explanation modules here.

Selected-lesson requests include the retained brief as untrusted context.
Generated practice lessons must match that brief and add source citations.

## Stable mapping

`{projectId, pathId, acceptedProposalId, acceptedProposalRevision, remoteStepId, localTopicId, localLessonId}`.
Selected-lesson generation must reuse those identities, update only that
pending lesson to ready, and must not emit a replacement syllabus.

## Implementation handoff

**Main / AR-47 (this checkpoint):** desktop persistence, preview projection,
opaque accept, selected-lesson generation, accepted-course overlay
(`adjust-accepted-course`), Opening interview/plan review plus user-initiated
follow-up, and learner profile live in `src/main/learning-onboarding*.ts`,
`src/renderer/onboarding/**`, `Opening.tsx`, and
`src/renderer/settings/LearnerProfile*`. Migration
`drizzle/0005_learning_onboarding.sql` (including `learning_adjustments`) is
reserved; coordinator must register journal idx 5 `when: 1788937200000`,
`EXPECTED_TABLE_COLUMNS`, `LATEST_WORKSPACE_MIGRATION = 1_788_937_200_000`,
WorkspaceStore/preload/main `Window.desktop` intersection, and App/Shell/Reader
resume plus native-close persist patches. Exact ready-to-apply diffs:
[AR-47 coordinator patches](ar-47-onboarding-handoff.md).
Renderer submits opaque identity, human drafts and consent only. Main retains
validated success envelopes and resolves opaque proposal+revision on accept.
`generateSourcedLearning` / `acceptSourcedLearning` are never used for this
flow. Tests apply 0005 onto an already-migrated store connection until the
journal patch lands.

**Backend / AR-48:** sibling `POST /v1/learning/onboarding` (`LEARNING_ONBOARDING_PATH`,
`LEARNING_ONBOARDING_METHOD`, `LEARNING_ONBOARDING_API_VERSION = 2026-09-09`).
Parse with `parseLearningOnboardingRequestWire` /
`parseLearningOnboardingResponseWire` on the **raw** body, then object
parsers. Desktop uses the existing fixed-origin authenticated main transport
and cookie session. Until the worker finishes, return an explicit
`unavailable` envelope (`retryable: true` only when `accounting` is `none` or
`released`). Do not fake production success. Keep `/v1/learning/sourced` and
its expected-red route-security tests unchanged. Do not change installed
foundations, model, spend policy or dependencies. Importing the API module
from `src/backend` is enough for `tsconfig.backend.json`.

Operations this desktop already sends:

| `operation.kind`           | Expected success `scope`             |
| -------------------------- | ------------------------------------ |
| `interview-prompt`         | `interview-prompt`                   |
| `propose-course`           | `complete-syllabus-and-first-lesson` |
| `revise-course`            | `complete-syllabus-and-first-lesson` |
| `generate-selected-lesson` | `selected-existing-lesson`           |
| `adjust-accepted-course`   | `accepted-course-adjustment`         |

`adjust-accepted-course` is a bounded overlay of an **accepted** course. It
must not emit a replacement syllabus or new path/lesson IDs. Ready completed
lessons cannot be patched. Progress locators live on `progress.practicalAttempts`,
never the forbidden `evidence` authority field. Human notes use prompt id
`adjustment-notes-01`. Planner `summary.masteryEstablished` stays `false`.
`revise-course` remains preview-only and must not run after accept. Exact
request/success fields: [AR-47 coordinator patches](ar-47-onboarding-handoff.md).

Human context is `untrusted-human-context` (goal, focus, depth, live intended
profile, interview answers, unacquired seed URLs, and `pastedSeedText`).
`pastedSeedText` is private human paste or `null`; it is not evidence and must
not be acquired or placed on `seedRevisionLocators`. Prior syllabus is
`untrusted-model-context`. Selected-lesson requests may send a newer live
profile revision than the accepted interview stored; that does not rewrite
accepted history. A source URL or pasted excerpt is data, never trusted
instructions. Accept and ensure-lesson do not send canonical lesson/source JSON.

**Practical / AR-50:** consume `CoursePracticeBrief` and
`CoursePracticeActivityBinding`. Populate existing Practical activity
title/instructions/objective from the brief and mapping. Do not parse syllabus
`activity` prose. Do not duplicate attempt/result/reflection records.

**Explanations / AR-51:** add explanation-request contracts separately. Do not
alter companion or Practical contracts in this checkpoint.

The earlier [proposal](onboarding-contract-proposal.md) is historical
recommendation text. Where it disagrees with this page and the TypeScript
modules, the modules win.
