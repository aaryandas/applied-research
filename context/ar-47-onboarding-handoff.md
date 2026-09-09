# AR-47 coordinator patches

Lane `opening` cannot independently edit journal, WorkspaceStore, workspace-schema
export, App/Shell/preload/main registration, or the `DesktopBridge` intersection.
Apply these diffs on `codex/ar-walkthrough-integration` (or cherry-pick onto the
integration merge). Do not use migration 0004 (AR-50) or 0006 (AR-56).

Consumer branch: `codex/ar-47-onboarding-cloud`  
Independently reviewed producer (Standards/Spec PASS, keep; do not remake): `9c325f590494c4f86dd5ef6ae1d68473a33cf100`.
Implementation origin: `d4b7710f617bbd554d96fffd3d6dd4aeed744c89`.
Coverage/late-cancel: `fe8bbefc1f9e80fce3d930315ecb1fa927a7effa` (keep; do not remake).
Producer follow-up inside that PASS: `a70cc0d76f16431a436509858ef1af1abe74c04b` (intended live profile for selected-lesson generation, partial interview persist on Back/close, and `pastedSeedText` on the untrusted human wire).
Full-app remainder after `9c325f5` (do not rebase or remake that PASS, and do not wipe `pastedSeedText` / intended-profile / `profileRevision` 0):
contracts `4738c4713eaee8a583bd138ca5ef76edbc9eafdf`,
main overlay `0e5a2a03cb6c642335090f276cd05b144c796186`,
Opening mount `5cd07e4c7d80f7d5b3d68c02b49adb44c0321bde`,
live intended profile + follow-up gating `80105d67d13be1461668576be79897a353700b49`.
Docs/handoff pin is this file’s commit; published HEAD is `git rev-parse origin/codex/ar-47-onboarding-cloud`.  
Integrated base: `e67f71e0e20531d66c23fe8c1c10e564a76697e6`  
Linear: AR-47
Patch path: `context/ar-47-onboarding-handoff.md`

Until these patches land, unit tests apply `drizzle/0005_learning_onboarding.sql`
onto an already-constructed `WorkspaceStore` connection via
`applyLearningOnboardingTables`. Production desktop will not see the tables
until journal + `EXPECTED_TABLE_COLUMNS` + `LATEST_WORKSPACE_MIGRATION` land
together.

Endpoint dependency: AR-48 `POST /v1/learning/onboarding`. Main already sends
reviewed request envelopes. The worker may return explicit `unavailable`. Do
not fake success or reuse `generateSourcedLearning`.

## 1. `drizzle/meta/_journal.json`

Append after the `0004_practical_journey` entry:

```json
{
  "idx": 5,
  "version": "6",
  "when": 1788937200000,
  "tag": "0005_learning_onboarding",
  "breakpoints": true
}
```

SQL file already exists: `drizzle/0005_learning_onboarding.sql`.

## 2. `src/main/workspace-migration.ts`

```ts
export const LATEST_WORKSPACE_MIGRATION = 1_788_937_200_000;
```

Insert into `EXPECTED_TABLE_COLUMNS` immediately before `__drizzle_migrations`:

```ts
  learner_profile: [
    'id',
    'background',
    'learning_goals',
    'prior_knowledge',
    'revision',
    'updated_at',
    'author',
    'ai_summary',
    'ai_observed_gaps_json',
    'ai_updated_at',
  ],
  learning_interviews: [
    'project_id',
    'revision',
    'updated_at',
    'goal',
    'focus',
    'depth',
    'profile_revision',
    'source_revision_ids_json',
    'seed_drafts_json',
    'answers_json',
    'prompts_json',
    'pasted_source_text',
  ],
  learning_proposals: [
    'project_id',
    'proposal_id',
    'revision',
    'interview_revision',
    'envelope_json',
    'projection_json',
    'updated_at',
  ],
  learning_acceptances: [
    'project_id',
    'proposal_id',
    'proposal_revision',
    'path_id',
    'path_revision',
    'first_lesson_json',
    'request_id',
    'accepted_at',
  ],
  accepted_step_mappings: [
    'project_id',
    'path_id',
    'accepted_proposal_id',
    'accepted_proposal_revision',
    'remote_step_id',
    'local_topic_id',
    'local_lesson_id',
    'practice_digest',
    'source_ids_json',
    'practice_brief_json',
  ],
  learning_adjustments: [
    'project_id',
    'adjustment_id',
    'revision',
    'accepted_proposal_id',
    'accepted_proposal_revision',
    'envelope_json',
    'projection_json',
    'accepted_at',
    'request_id',
    'updated_at',
  ],
  learning_resume: [
    'id',
    'project_id',
    'path_id',
    'path_revision',
    'topic_id',
    'lesson_id',
    'source_revision_id',
    'span_start',
    'span_end',
    'span_quote',
    'lesson_title',
    'project_goal',
    'updated_at',
  ],
```

## 3. `src/main/workspace-schema.ts`

Keep `workspaceSchema` as the existing authority. Re-export onboarding tables
for discoverability only; do not open a second connection.

```ts
export {
  learningOnboardingSchema,
  applyLearningOnboardingTables,
} from './learning-onboarding-schema';
```

## 4. `src/main/workspace-store.ts`

After `this.practical = new PracticalRecords(this.orm);`:

```ts
this.onboarding = new LearningOnboardingRecords(this.orm);
```

Add:

```ts
import { LearningOnboardingRecords } from './learning-onboarding-records';

private readonly onboarding: LearningOnboardingRecords;

onboardingRecords(): LearningOnboardingRecords {
  return this.onboarding;
}
```

Do not construct a second `Database` / Drizzle instance.

## 5. `src/contracts/desktop.ts`

```ts
import type { LearningOnboardingBridge } from './learning-onboarding';

declare global {
  interface Window {
    readonly desktop: DesktopBridge &
      LearningRecordsBridge &
      PracticalWorkspaceBridge &
      SourceDesktopBridge &
      LearningOnboardingBridge;
  }
}
```

Remove the stale “this contracts checkpoint does not change the live bridge”
comment once preload/main expose the channels.

## 6. `src/main/index.ts`

Imports:

```ts
import {
  LEARNING_ONBOARDING_CHANNELS,
  LEARNING_ONBOARDING_RESUME_CHANNELS,
  LearningOnboardingOperations,
} from './learning-onboarding';
import { LearningOnboardingRecords } from './learning-onboarding-records';
import { makeAuthenticatedOnboardingTransport } from './learning-onboarding-transport';
```

Beside `sourceOperations`:

```ts
const onboardingOperations = new LearningOnboardingOperations({
  store,
  records: store.onboardingRecords(),
  authenticated: () => authenticated,
  transport: makeAuthenticatedOnboardingTransport({
    request: globalThis.fetch,
    sessionCookie: () =>
      authController.state().session === 'signed-in' ? authSdk.getCookie() : '',
  }),
});
```

Until `onboardingRecords()` exists, tests use
`(store as unknown as { orm }).orm` the same way Practical records do.

Register named handlers (no raw IPC):

```ts
handle(LEARNING_ONBOARDING_CHANNELS.getProfile, () =>
  onboardingOperations.getLearnerProfile(),
);
handle(LEARNING_ONBOARDING_CHANNELS.saveProfile, (value) =>
  onboardingOperations.saveLearnerProfile(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.get, (value) =>
  onboardingOperations.getLearningOnboarding(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.saveInterview, (value) =>
  onboardingOperations.saveLearningInterview(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.interviewPrompt, (value) =>
  onboardingOperations.requestInterviewPrompt(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.propose, (value) =>
  onboardingOperations.proposeCourse(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.revise, (value) =>
  onboardingOperations.reviseCourse(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.accept, (value) =>
  onboardingOperations.acceptCourse(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.ensureLesson, (value) =>
  onboardingOperations.ensureLesson(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.adjust, (value) =>
  onboardingOperations.proposeAcceptedCourseAdjustment(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.acceptAdjustment, (value) =>
  onboardingOperations.acceptCourseAdjustment(value),
);
handle(LEARNING_ONBOARDING_CHANNELS.cancel, (value) =>
  onboardingOperations.cancelLearningOnboarding(value),
);
handle(LEARNING_ONBOARDING_RESUME_CHANNELS.getContinueLearning, () =>
  onboardingOperations.getContinueLearning(),
);
handle(LEARNING_ONBOARDING_RESUME_CHANNELS.saveReadingResume, (value) =>
  onboardingOperations.saveReadingResume(value),
);
handle(LEARNING_ONBOARDING_RESUME_CHANNELS.getProfileView, () =>
  onboardingOperations.getLearnerProfileView(),
);
handle(LEARNING_ONBOARDING_RESUME_CHANNELS.getPastedSource, (value) =>
  onboardingOperations.getPastedSource(value),
);
handle(LEARNING_ONBOARDING_RESUME_CHANNELS.savePastedSource, (value) =>
  onboardingOperations.savePastedSource(value),
);
```

Revoke on window close next to `sourceOperations.revoke()`:

```ts
onboardingOperations.revoke();
```

Remove handlers on `closed` with the other channel lists:

```ts
...Object.values(LEARNING_ONBOARDING_CHANNELS),
...Object.values(LEARNING_ONBOARDING_RESUME_CHANNELS),
```

## 7. `src/preload/index.ts`

Import channels + `LearningOnboardingBridge`. Intersect the exposed `desktop`
object and add:

```ts
getLearnerProfile: () =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.getProfile),
saveLearnerProfile: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.saveProfile, input),
getLearningOnboarding: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.get, input),
saveLearningInterview: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.saveInterview, input),
requestInterviewPrompt: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.interviewPrompt, input),
proposeCourse: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.propose, input),
reviseCourse: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.revise, input),
acceptCourse: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.accept, input),
ensureLesson: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.ensureLesson, input),
proposeAcceptedCourseAdjustment: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.adjust, input),
acceptCourseAdjustment: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.acceptAdjustment, input),
cancelLearningOnboarding: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_CHANNELS.cancel, input),
getContinueLearning: () =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_RESUME_CHANNELS.getContinueLearning),
saveReadingResume: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_RESUME_CHANNELS.saveReadingResume, input),
getLearnerProfileView: () =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_RESUME_CHANNELS.getProfileView),
getPastedSource: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_RESUME_CHANNELS.getPastedSource, input),
savePastedSource: (input) =>
  ipcRenderer.invoke(LEARNING_ONBOARDING_RESUME_CHANNELS.savePastedSource, input),
```

## 8. `src/renderer/App.tsx`

Keep current `onCreate` when `proposeCourse` is absent so `App.test.tsx`
still lands a new topic in Reader. When the onboarding methods exist:

- `createDraftProject`: `bridge.createProject(goal)` then list it, **do not**
  `openProject` (that would present an empty project as a course).
- Pass `onboarding={{ createDraftProject, bridge, onAccepted, adjustmentEvidence }}`.
  `adjustmentEvidence(projectId)` is AR-56 owned: resolve existing
  `practical-records` attempt summaries for accepted practice mappings into
  `{ attemptId, recordedRevision, remoteStepId, lessonTitle }`. Do not invent
  attempts. Empty is honest when none exist.
- Hold `const onboardingPersistRef = useRef<OnboardingDraftPersist>(null)` and
  pass it to Opening. Opening forwards `OnboardingFlow.persistHandle`.
- **Native close / Home barrier (root-owned; unused in this producer):**
  this producer does **not** claim Electron native close is fully fixed. App
  and `useWorkspaceFlush` must await the Opening persist hook **before**
  unmounting Opening or destroying the window:

```ts
const persist = await onboardingPersistRef.current?.persistDraft();
if (persist === 'failed') {
  // Keep Opening mounted. Do not continue close/Home.
  return { status: 'blocked', reason: 'onboarding-draft' };
}
```

Unmount persist was removed because it swallowed errors (P2). Back already
awaits persist and stays on the sheet on conflict/throw. Native close stays
incomplete until this hook is wired in App/main.

- `onAccepted`: `setWorkspace(value.workspace)` and remember
  `value.firstLesson` for Shell resume.
- `getContinueLearning()` for the compact Continue learning card. Draft
  proposals must not appear as that card (main already requires an acceptance
  row).
- `onReopen(id)` (root/AR-56 apply; do not skip this or drafts fall into Reader):
  1. `const snapshot = await bridge.getLearningOnboarding({ projectId: id })`
  2. If `snapshot.accepted !== null` → existing `getLearningWorkspace` / Shell.
     AR-56 owns `ensureLesson` renderer lifetime, new-Reader handoff, resume
     barrier, and current coverage restoration.
  3. Else if `snapshot.interview !== null || snapshot.proposal !== null` → stay
     on Opening with `resumeDraft={{ projectId: id, goal }}` and the named
     onboarding bridge. **Do not** call `getLearningWorkspace`.
  4. Else → current empty-workspace Reader path.
- Opening Back already persists the interview (and explicit paste clear) before
  unmounting the sheet. Reopen step 3 restores exact answer/paste bytes via
  `getLearningOnboarding` + `getPastedSource`.
  `getLearningOnboarding` + `getPastedSource`, including AI follow-up prompts
  and their separate human answers.
- Continue learning remains the resume card. Opening also mounts producer-owned
  `AcceptedCourseAdjustment` from **Review course from your work**. Shell may
  reuse that component after Practical evidence exists; pass locators through
  `adjustmentEvidence`.
- Preserve every `listProjects()` row under All saved work.

Type the App bridge as
`DesktopBridge & LearningRecordsBridge & Partial<LearningOnboardingBridge>`
plus the resume methods so `App.test.tsx` does not need onboarding mocks.

## 9. `src/renderer/Shell.tsx` + `src/renderer/reader/Reader.tsx`

Keep AR-56 strict Home/native close vs permissive same-project navigation.
Do not add a Learning Path overview destination. Sidebar + Reader are the
course.

- New optional `resume` prop: `{ path, sourceRevisionId, span, lessonTitle }`.
- On mount, `reader.current.openOrigin({ path, sourceRevisionId })`. Reader
  currently restores span only from a highlight id; add this precise extra on
  `ReaderNavigationControls`:

```ts
restoreReading(origin: LearningOrigin, span: TextSpan | null): void;
```

Implementation: existing `openOrigin(origin)` then `setSpan(span)` /
`setReveal({ span })` when `span` is an exact slice of the version text.

- `onPathChange`: `saveReadingResume` with project id, path, current source
  revision id if any, current Reader span, lesson title, project goal.
- `selectLesson`: if the selected lesson `sourceState === 'pending'` and
  `ensureLesson` exists, call it with opaque `PathOrigin` + `lessonId` and
  consent `acquire-learning-evidence`. On success replace workspace, open the
  returned lesson, keep topic/lesson ids stable. Show the existing pending
  copy if generation is unavailable. Never send canonical lesson JSON from
  the renderer.

## 10. `src/renderer/settings/SettingsPanel.tsx`

After Appearance, mount `<LearnerProfile bridge={...} />` when
`getLearnerProfile` exists on the account/desktop bridge. Keep Account and
Appearance distinguishable. Learner profile is not preferences.

## AR-48 worker

Same envelope as `src/contracts/learning-onboarding-api.ts`. No new wrapper.
Desktop will surface `unavailable` until this route is real. Human bytes are
untrusted context. Evidence must be acquired originals (open courses/textbooks
and OpenAlex papers). First success scope is
`complete-syllabus-and-first-lesson`; later chapters use
`generate-selected-lesson` / `selected-existing-lesson`.

Keep the existing allowlisted model (`google/gemini-3.8-flash`) and US$20
monthly quota. No new provider or budget.
`generate-selected-lesson` / `selected-existing-lesson`. Reviewed accepted
courses use `adjust-accepted-course` / `accepted-course-adjustment` (overlay,
not a replacement syllabus).

Keep the existing allowlisted model (`google/gemini-3.8-flash`) and US$20
monthly quota. No new provider, second planner, or budget. Do not treat the
separately authorized $2/10 evaluation cap as this ticket’s monthly quota.

| `operation.kind`           | Expected success `scope`             | Notes                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interview-prompt`         | `interview-prompt`                   | User-initiated follow-up only. Prompt is AI-authored; not a human diagnostic answer.                                                                                                                                                                                                  |
| `propose-course`           | `complete-syllabus-and-first-lesson` |                                                                                                                                                                                                                                                                                       |
| `revise-course`            | `complete-syllabus-and-first-lesson` | Preview only. Must not run after accept.                                                                                                                                                                                                                                              |
| `generate-selected-lesson` | `selected-existing-lesson`           | Compact syllabus may already show updated pending `practiceDigest` after an accepted overlay. `target.practice` must match that digest. Do **not** reject live `human.profileRevision` ≠ stored interview `profileRevision`.                                                          |
| `adjust-accepted-course`   | `accepted-course-adjustment`         | **New.** Overlay only. Forbidden: replacement `syllabus`, new lesson/path IDs, `evidence` authority field, ready-lesson patches, `masteryEstablished: true`. Progress key is `progress.practicalAttempts` (locators). Human notes arrive as `adjustment-notes-01` on `human.answers`. |

Parse with `parseLearningOnboardingRequestWire` /
`parseLearningOnboardingResponseWire` on the **raw** body. `progress` is
illegal on interview/propose/revise/selected-lesson. `acceptedProposal` is
illegal on interview/propose/revise. Selected-lesson must not have a root
`acceptedProposal` (it lives on `target`). Success envelopes other than
`accepted-course-adjustment` must omit `adjustment`.

### `adjust-accepted-course` mapping (exact)

Request `operation`:

- `kind: 'adjust-accepted-course'`
- `human`: live intended profile (`profileRevision` may be newer than the
  stored interview bind). Interview answers remain historical self-report.
  Optional notes are extra human answers with prompt id `adjustment-notes-01`
  (`ADJUSTMENT_NOTES_PROMPT_ID`). Still `untrusted-human-context`.
- `model`: retained compact syllabus as `untrusted-model-context`. Ready steps
  stay byte-identical. Pending `practiceDigest` may already reflect a prior
  accepted overlay.
- `progress`: `{ trust: 'untrusted-human-context', practicalAttempts: PracticalAttemptLocator[] }`.
  Locators are `{ trust, kind: 'practical-attempt-locator', attemptId, recordedRevision, remoteStepId }`.
  Empty is honest. These are not mastery and not `evidence`.
- `acceptedProposal`: opaque id+revision equal to `model.priorProposal`.

Success body (`scope: 'accepted-course-adjustment'`):

- `adjustment`: `{ acceptedProposal, summary, focus, depth, patches, citations }`.
  `summary.masteryEstablished` must be `false`. `focus`/`depth` are `{before,after}`
  or null. `patches` name pending `remoteStepId` + `field` (`objective` |
  `activity` | `practice`) with visible before/after. Practice patches include
  the replacement `CoursePracticeBrief`; others have `practice: null`.
- **Must not** include `syllabus`, `firstLesson`, `lesson`, or new identities.
- Citations/evidence must be acquired originals already in `sources`.
- Desktop retains the envelope under `learning_adjustments` and applies only
  after explicit `acceptCourseAdjustment`. Ready completed lessons, path IDs,
  accepted proposal identity, and human/AI attribution stay.

Until this operation is real, return explicit `unavailable`
(`retryable: true` only when `accounting` is `none` or `released`). Do not
fake a reviewed overlay.

### `human.pastedSeedText` (required `string | null`)

Exact private human paste, or `null` when none or explicitly cleared. This is
untrusted planning context on the existing human object, not a new operation.

- Do **not** acquire it as a public source.
- Do **not** index it.
- Do **not** treat it as trusted question instructions or as a diagnostic
  answer.
- Do **not** place it on `seedRevisionLocators` (those remain reacquire/
  evidence locators only).
- Public URLs stay on `unacquiredSeedUrls`. Workspace `importTextSource`
  (`human-imported`) stays the local file/paste-into-library boundary; this
  field is not that import and must not fabricate an acquired original.

### `generate-selected-lesson` profile bind

Do **not** reject when `human.profileRevision` differs from the accepted
interview row’s stored `profileRevision`. `human.profile` and
`human.profileRevision` are the **live intended** statements after later
Settings saves or another course plan. Historical attribution stays on the
stored interview (answers, `interviewRevision`, stored `profileRevision`
number) and the retained syllabus envelope. Do not rewrite those rows. Historical
profile _bytes_ are not snapshotted; only the revision number plus answers and
syllabus remain after a global profile overwrite.

## Remaining full-app work (not this checkpoint)

These stay explicit remaining requirements. They must not block publishing the
producer fixes above.

**W42 reviewed-course adjustment.** Later Practical attempts and diagnostic
evidence must be able to request a bounded syllabus/practice adjustment of an
_accepted_ course. Not implemented. When scheduled, reuse
`revise-course` / `generate-selected-lesson` with the current model allowlist
and US$20 quota: send historical interview + retained compact syllabus as
`untrusted-model-context`, live profile as intended human context (same bind
rule as selected-lesson), and new human notes as answers — do not invent a
second planner or spend policy.

**`requestInterviewPrompt`.** Mounted Opening still asks four fixed local
questions and does not call `requestInterviewPrompt`. A later mount can add one
optional follow-up prompt after the local diagnostic, still
`google/gemini-3.8-flash`, without replacing the four questions or treating AI
text as human answers.

**App/Opening mount.** Assembler owns the named onboarding bridge. Root applies
section 8; AR-56 owns Reader/`ensureLesson` lifetime. This producer does not
edit `App.tsx` / `Shell.tsx` / `src/main/index.ts`.
## Remaining assembly (producer remainder is implemented)

This producer now implements the previously deferred full-app remainder on
Opening-owned modules. Independent critic of `9c325f5` still stands for that
checkpoint; this remainder needs its own standards/spec pass. Not Done. Not
real-app Cloud acceptance (needs integrated main/CI and actual auth). Do not
seed fake courses or call paid models from this lane.

**Mounted `requestInterviewPrompt`.** After the four human diagnostic answers,
Opening shows **Request a follow-up question** (disabled until those four
answers are non-empty; user-initiated; no implicit paid dispatch). Main already
appended AI prompts on `InterviewRecord.prompts` with `author: 'ai'`. The human
answer is a separate field. Unavailable keeps a fixed local question
(`follow-up-local-01`) that is explicitly not AI. Loading/error/cancel/retry
are explicit. Reopen restores last prompts and the separate human answer.
Background/goals/diagnostic answers and optional paste stay.

**W42 accepted-course overlay.** `revise-course` still replaces a _preview_
syllabus and cannot safely express post-accept review. Named operation
`adjust-accepted-course` (scope `accepted-course-adjustment`) proposes a
bounded overlay: focus/depth before-after, pending practice/objective patches,
citations from acquired evidence. Explicit **Accept overlay** applies pending
practice briefs only. Ready lessons, path IDs, accepted proposal identity, and
human/AI attribution stay. Self-report is not mastery. Opening mounts
`AcceptedCourseAdjustment` from **Review course from your work**. The sheet
shows live intended profile bytes (`getLearnerProfile` /
`getLearnerProfileView`) separately from historical interview answers and from
any AI assessment (`author: 'ai'`, mastery not established). Empty Practical
locators are honest until AR-56 passes `adjustmentEvidence`.

**Honest persist (P2).** Unmount `.catch(() => undefined)` is gone. Back and
`OnboardingDraftPersist.persistDraft()` share one in-flight save and surface
conflict/throw. Busy persist returns `'failed'` (cancel the planner first).
Opening exposes `onboardingPersistRef` → `persistDraft()`. **Native close is
not fully fixed:** App/`useWorkspaceFlush` must await that hook (section 8)
before unmounting Opening. This producer cannot claim Electron native close
while that hook is unused.

### Residual joins (assembler / AR-56 / AR-48 / coordinator)

Do not treat these as AR-47 producer Done:

1. Journal idx 5 `0005_learning_onboarding` **including** `learning_adjustments`
   columns in `EXPECTED_TABLE_COLUMNS` (section 2). Tests still apply 0005 onto
   an already-migrated store until the journal lands.
2. WorkspaceStore `onboardingRecords()`, `DesktopBridge` intersection, preload
   - `src/main/index.ts` handlers for `adjust` / `acceptAdjustment` (sections
     4–7).
3. App section 8: `onboarding` bridge, `resumeDraft` reopen, Continue learning,
   `adjustmentEvidence(projectId)` from existing `practical-records` (attempt
   summaries for accepted practice mappings; do not invent attempts), and the
   **native-close persist hook**:

```ts
const persist = await onboardingPersistRef.current?.persistDraft();
if (persist === 'failed') {
  return { status: 'blocked', reason: 'onboarding-draft' };
}
```

4. Shell may reuse `AcceptedCourseAdjustment`; pass locators through
   `adjustmentEvidence`. AR-56 owns `ensureLesson` renderer lifetime, Reader
   handoff, resume barrier.
5. AR-48 must map `adjust-accepted-course` as specified above. No second
   provider/budget. Compact syllabus after overlay accept may carry updated
   pending `practiceDigest`; selected-lesson `target.practice` must match.
6. SettingsPanel LearnerProfile mount (section 10).

This producer does not edit `App.tsx` / `Shell.tsx` / `Reader*` /
`src/main/index.ts` / preload / WorkspaceStore / journal / workflow.
