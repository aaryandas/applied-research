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

| File                                              | Owns                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/contracts/learning-onboarding.ts`            | Named desktop operations, human profile/interview, opaque proposal identity, mapping      |
| `src/contracts/learning-onboarding-api.ts`        | `POST /v1/learning/onboarding` discriminated envelope, limits, public messages            |
| `src/contracts/learning-onboarding-validation.ts` | Strict bounded decoding for renderer inputs, projections and trusted backend envelopes    |
| `src/contracts/learning-onboarding.test.ts`       | Forged-authority, malformed/oversize, revision/target, compatibility and roundtrip proofs |

Renderer TypeScript may import desktop projection types. It must not import or
submit trusted backend envelopes. Main validates the backend response, retains
it under an opaque proposal id+revision, and projects `CourseProposal`.

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
  outcomes set `retryable: false` except unavailable, which may be retryable
  when no reservation was taken. Callers cannot request a paid retry.

## Bounds

16 topics and 160 lessons are the **maximum envelope**, not a target course
length. Existing admission remains: 64 KiB request, four acquired generation
sources, 48,000 canonical generation characters, 12 retrieval passages,
`google/gemini-3.8-flash` allowlist, US$20 monthly quota accounting. Desktop
transport already allows a 4 MiB response; this contract documents that ceiling
without changing it.

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

**Main / AR-47:** register `LearningOnboardingBridge` on `Window.desktop`;
retain validated `LearningOnboardingResponse` success envelopes; project
`CourseProposal`; persist profile, interview, mapping and acceptance receipt;
never call `acceptSourcedLearning` / `generateSourcedLearning` for this flow.

**Backend / AR-48:** add sibling `POST /v1/learning/onboarding` using
`parseLearningOnboardingRequest` / `parseLearningOnboardingResponse`. Keep
`/v1/learning/sourced` and its expected-red route-security tests unchanged.
Do not change installed foundations, model, spend policy or dependencies.
Importing the new API module from `src/backend` is enough for
`tsconfig.backend.json` (include currently lists `learning-api.ts` only;
the import graph pulls additional contracts).

**Practical / AR-50:** consume `CoursePracticeBrief` and
`CoursePracticeActivityBinding`. Populate existing Practical activity
title/instructions/objective from the brief and mapping. Do not parse syllabus
`activity` prose. Do not duplicate attempt/result/reflection records.

**Explanations / AR-51:** add explanation-request contracts separately. Do not
alter companion or Practical contracts in this checkpoint.

The earlier [proposal](onboarding-contract-proposal.md) is historical
recommendation text. Where it disagrees with this page and the TypeScript
modules, the modules win.
