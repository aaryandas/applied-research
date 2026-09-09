# Minimal AR-47 / AR-48 onboarding seam — historical proposal

Inspected frozen integration: `ea46e3d8dd387b4fdb5914c37f4062d80bdb9dc7`.

**Status:** AR-52 implemented the public contracts, validators and tests. Follow
[learning onboarding](learning-onboarding.md) and `src/contracts/learning-onboarding*.ts`.
This page remains the earlier recommendation text for AR-47/AR-48 runtime work.

**Recommendation:** add one new desktop contract module, a main-owned durable onboarding service, and one new authenticated backend operation envelope. Preview retains a validated backend response in main; acceptance sends only its opaque identity. Generate the complete syllabus plus first lesson for preview/acceptance, then generate each subsequent selected lesson on demand. Do not use current `generateSourcedLearning()` as preview: it commits immediately.

## 1. New public contracts: `src/contracts/learning-onboarding.ts` (AR-47)

Reuse `PathOrigin`, `LearningWorkspace`, `AiProvenance` and source descriptor/locator types. Do not make renderer import backend implementation types.

Exact suggested records:

```ts
type LessonDepth = 'concise' | 'balanced' | 'deep';
type RevisionRef = { id: string; revision: number };

type LearnerProfileDraft = {
  background: string;
  learningGoals: string;
  priorKnowledge: string;
};
type LearnerProfile = LearnerProfileDraft & {
  revision: number;
  updatedAt: string;
  author: 'human';
};

type InterviewDraft = {
  goal: string;
  focus: string;
  depth: LessonDepth;
  profileRevision: number;
  sourceRevisionIds: string[];
  answers: Array<{ questionId: string; answer: string }>;
};
type InterviewPrompt = {
  id: string;
  text: string;
  provenance: AiProvenance;
};
type InterviewRecord = InterviewDraft & {
  projectId: string;
  revision: number;
  updatedAt: string;
  prompts: InterviewPrompt[];
};

type ProposalLesson = {
  stepId: string;
  title: string;
  objective: string;
  activity: string;
  sourceState: 'ready' | 'pending' | 'unsupported';
};
type CourseProposal = {
  id: string; // opaque, allocated by main
  revision: number;
  projectId: string;
  interviewRevision: number;
  title: string;
  topics: Array<{ topicId: string; title: string; lessons: ProposalLesson[] }>;
  firstLesson: { stepId: string; title: string; text: string } | null;
  sources: ProposalSource[]; // vetted descriptor/original location and access status
  gaps: Array<{
    kind: 'retrieval' | 'generation' | 'support';
    message: string;
  }>;
  personalization: { summary: string; observedGaps: string[] }; // literal AI attribution
  acceptance: 'ready' | 'coverage-pending';
};
```

`ProposalSource` should be a `Pick` of existing vetted `SourceDescriptor` fields (identity/title/originalLocation/providerIds) plus exact referenced edition IDs and access/coverage state; do not invent a second source attribution vocabulary. Include lesson-to-source reference lists if needed to explain plan grounding. `CourseProposal` is only a display projection and MUST NOT be accepted back as authoritative input. `firstLesson.text` is read-only AI preview text, not renderer-owned canonical source.

Profile is one **main-resolved local learner scope**, not a renderer-supplied account/profile owner ID. Snapshot the selected profile revision into each interview so later profile edits cannot silently rewrite how an existing course was personalized. Preserve exact human bytes. Prompt definitions/provenance are main-retained backend data; renderer may submit answer text and prompt IDs, never re-author prompts or assessments as trusted AI evidence.

Exact suggested bridge methods:

```ts
interface LearningOnboardingBridge {
  getLearnerProfile(): Promise<LearnerProfile | null>;
  saveLearnerProfile(input: {
    expectedRevision: number;
    draft: LearnerProfileDraft;
  }): Promise<RevisionWrite<LearnerProfile>>;
  getLearningOnboarding(input: { projectId: string }): Promise<{
    interview: InterviewRecord | null;
    proposal: CourseProposal | null;
    accepted: {
      proposal: RevisionRef;
      pathId: string;
      pathRevision: number;
    } | null;
  }>;
  saveLearningInterview(input: {
    projectId: string;
    expectedRevision: number;
    draft: InterviewDraft;
  }): Promise<RevisionWrite<InterviewRecord>>;
  requestInterviewPrompt(
    input: OnboardingRequest & { interviewRevision: number },
  ): Promise<OnboardingResult<InterviewRecord>>;
  proposeCourse(
    input: OnboardingRequest & {
      interviewRevision: number;
      consent: 'acquire-learning-evidence';
    },
  ): Promise<OnboardingResult<CourseProposal>>;
  reviseCourse(
    input: OnboardingRequest & {
      proposal: RevisionRef;
      interviewRevision: number;
      changes: { focus: string; depth: LessonDepth };
      consent: 'acquire-learning-evidence';
    },
  ): Promise<OnboardingResult<CourseProposal>>;
  acceptCourse(input: OnboardingRequest & { proposal: RevisionRef }): Promise<
    OnboardingResult<{
      workspace: LearningWorkspace;
      firstLesson: PathOrigin & { lessonId: string };
    }>
  >;
  ensureLesson(
    input: OnboardingRequest & { target: PathOrigin & { lessonId: string } },
  ): Promise<
    OnboardingResult<{
      workspace: LearningWorkspace;
      lesson: PathOrigin & { lessonId: string };
    }>
  >;
  cancelLearningOnboarding(input: OnboardingRequest): Promise<void>;
}
type OnboardingRequest = { projectId: string; requestId: string };
type RevisionWrite<T> =
  | { status: 'saved'; record: T }
  | { status: 'conflict'; expectedRevision: number; currentRevision: number };
type OnboardingResult<T> =
  | { outcome: 'success'; requestId: string; value: T }
  | {
      outcome:
        | 'cancelled'
        | 'stale-project'
        | 'stale-revision'
        | 'unavailable'
        | 'coverage-pending'
        | 'save-failed';
      requestId: string;
      message: string;
      retryable: boolean;
    };
```

The profile result uses a small separate revision result because existing `CommitResult` requires projectId and cannot honestly represent a reusable local learner record. Standard UUID/request-id validation and explicit bounded lengths/counts apply. `ensureLesson` returns an already-ready retained lesson without new AI use; pending lessons trigger generation. It cannot accept lesson title/body/citations from renderer.

Seed links and pasted material should flow through existing source import/acquisition and become `sourceRevisionIds` before trusted generation; an unacquired URL may be retained as a human seed draft but is not a vetted source. Do not relabel human background as a `reported-result` just to squeeze it into the older learnerContext union.

## 2. Main retains authority, previews are durable drafts (AR-47)

Suggested new owners:

- `src/main/learning-onboarding.ts`: project/account lifetime, request cancellation, proposal/revise/accept/ensure operations.
- `src/main/learning-onboarding-records.ts`: durable learner profile, interview revisions, proposal metadata/envelopes and acceptance receipt; uses the existing WorkspaceStore connection/transaction rather than opening another database.
- `src/main/learning-onboarding-validation.ts`: strict public input decoding and side-effect-free backend envelope validation/projection.
- `src/main/learning-onboarding-transport.ts`: fixed authenticated endpoint adapter, using existing cookie/request owner via injection; no credentials exposed to renderer.
- migration and schema entries: profile/interview revisions; main-only retained proposal envelope; acceptance receipt; remote step→local topic/lesson mapping. Coordinator approves/adapts existing WorkspaceStore/schema/migration owner files.
- existing `src/main/index.ts` + `src/preload/index.ts`: coordinator-owned registration/composition of named channels, no raw IPC.

Lifecycle:

1. Creating a local project shell may precede interview to obtain durable identity; App stays in onboarding until acceptance. It must not display that empty workspace as a generated course. Keep unfinished onboarding discoverable without claiming it is the latest completed lesson.
2. Save human interview/profile locally. `requestInterviewPrompt` produces a topic-specific open-ended diagnostic using the snapshot and existing answers; its generated prompt ID/provenance is retained in main.
3. `proposeCourse` calls the backend. Main validates response identity, complete syllabus shape, first lesson’s matching step, hashes/citation/source authority and explicit gaps **without calling `acceptSourcedLearning`**. Retain the validated `SourcedLearningResponse`/extended envelope under opaque proposal id+revision, project and interview revision; expose only `CourseProposal` projection.
4. `reviseCourse` records new human focus/depth, requests a new proposal, and retains old proposal while loading or on failure. Successful revision increments proposal revision; older accept controls receive stale-revision. Never modify accepted human work silently.
5. `acceptCourse` resolves only the retained id/revision and checks current interview revision. In one transaction adopt retained sources + syllabus + first lesson, persist step mapping and acceptance receipt. Repeated accept with same identity returns the original receipt/target, even after a lost response; no duplicate path and no additional provider call. Renderer never submits canonical text, response, provenance or path contribution here.
6. Require a complete syllabus plus usable supported first lesson for `acceptance:'ready'`. Explicit source coverage gaps may remain visible, but a missing first lesson or silently truncated syllabus is not successful onboarding.
7. On restart, restore durable interview and proposal; after sign-out retain local reading/drafts but no new remote call. Account binding of remote tasks comes from main/session. Cancellation or project replacement rejects late results; never erase old proposal on failed revision.

## 3. Subsequent selected lessons must retain path identity

Current `source-learning-adoption.ts` derives path id from request id, caps at 12 flat steps, requires first step for lesson attachment, and drops remote step IDs when local lesson IDs are allocated. Reusing it for each chapter would create another path or attach to the wrong lesson.

Persist `{projectId, pathId, acceptedProposalId, acceptedProposalRevision, remoteStepId, localTopicId, localLessonId}` at initial acceptance. `ensureLesson` resolves its **stored** target, semantic objective/activity, profile/interview snapshot and evidence under main control. Backend generates only that step. Main verifies returned step id and imports generated source/provenance, then writes a new revision of the **same path**, changing only that lesson from pending to ready; keep other lessons, notes, highlights and existing path versions. Return new exact `PathOrigin` for Reader. Concurrent stale-path writes must yield a typed conflict or safely merge only an unchanged lesson against latest stored path; do not overwrite a revised syllabus. Do not allocate fresh lesson IDs because its content became ready.

## 4. Required AR-48 backend/route extension

AR-48 owns `src/backend/**` and existing source/learning routes. Propose **one new sibling endpoint** `POST /v1/learning/onboarding`, leaving current `/v1/learning/sourced` and `SourceDesktopBridge.generateSourcedLearning` compatible. New network envelopes can live alongside desktop types in `learning-onboarding.ts` (or a companion new `learning-onboarding-api.ts`, coordinated with AR-47).

Main→backend request has `requestId`, fixed API version/model selected by main and a discriminated operation:

- `interview-prompt`: stored goal, human profile snapshot, prior prompt/answer records. Returns prompt plus provenance and optional separately attributed gap assessment.
- `propose-course`: stored goal, snapshot, open-ended answers, focus/depth and seed revision context. Returns complete ordered syllabus with stable topic/step IDs, matching first lesson, acquired original sources/evidence/support/provenance/gaps.
- `revise-course`: same stored context plus prior retained syllabus and explicit human changes. Returns the full revised proposal; does not save Electron records.
- `generate-selected-lesson`: accepted syllabus context plus one stored selected step ID/title/objective/activity, snapshot and prior learning evidence. Returns only that lesson with exact requested step ID and supported original citations/provenance; never re-plans or regenerates the whole syllabus as a side effect.

Backend treats caller context as learning instructions, not source evidence authority; it reacquires/selects permitted originals and independently verifies support. Existing session-derived account, Effect cancellation/accounting/quota and strict validation remain active. A field such as `selectedStepId` added only in renderer will currently be rejected/ignored: backend parser/router/service/generation all need extension.

Extend current backend `SourcedLearningProgress.scope` beyond literal `first-useful-step` for the new route only; retain compatibility adapter for old route. Complete syllabus needs topic grouping and a reviewed bound above the old 12 flat-step cap; update all relevant backend/model-output/main-adoption bounds consistently, not just the UI. Recommend 16 topics / 160 total lessons as a bounded envelope ceiling, **not a target course length**; backend chooses scope from learner goal. This numeric ceiling is a proposed implementation bound requiring coordinator/AR-48 agreement, not founder-selected depth.

## 5. Minimal contract proof before UI depends on it

- Propose/revise writes no path/source into active learning records; only acceptance commits retained validated envelope.
- Tampered renderer proposal JSON cannot be submitted/accepted; only matching opaque id/revision accepted.
- Retry accept returns one original path/first lesson; stale proposal/interview revisions fail without writes.
- Restart restores exact human interview/draft and reviewable proposal.
- Selected chapter generation updates its original lesson ID/path only; reordered syllabus, another project and late canceled results cannot redirect attachment.
- Complete detailed syllabus + first lesson at acceptance; remaining lessons honestly pending and generated when selected.
