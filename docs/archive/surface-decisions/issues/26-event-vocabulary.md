# 26 · The event vocabulary between surfaces
Type: grilling
Status: resolved
Blocked by: 14, 15, 18, 19, 21, 22, 23, 24, 25

## Question
Given every surface decision, which events do the new surfaces append (canvas placement, explainer render, calibration mark, curriculum step, pointer session, source added, pack compiled), what does each reference (event ids, sentence ids, source ids), what author may each carry, and which surfaces fold which events? This yields the "connects through the event log" line for every surface and the glossary in `CONTEXT.md`.

## Inputs
All surface resolutions; `docs/mvp-prd.md` §5 (the existing `events` contract with its `dok`/`author` CHECK); `/domain-modeling`.

## Resolution must state
A table: event type → author allowed → references → produced by surface → consumed by surfaces. The glossary written to `CONTEXT.md`. Any term two tickets used differently, reconciled.

## Starting recommendation
Extend, never rename: keep the PRD's ten types and add only what a surface decision required. Every new type carries the same doctrine CHECK.

## Answer
Decided 2026-09-06 with Aaryan. The doctrine check is unchanged: no event at level 3 or 4 may carry author `ai`. The PRD's `counter`, `resolution`, `idea`, and `known` types are withdrawn; `idea` merges into `insight`, placement is recorded as `check-answer`, `check-grade`, and `lesson-status`. Glossary written to `CONTEXT.md`.

| Event | Level | Author | References | Written by | Read by |
|---|---|---|---|---|---|
| project-created | – | human | – | Opening screen | Shell |
| brief | – | human | – | Opening screen, Canvas | Canvas, Playbook |
| source-added | – | human | source id | Opening screen, Canvas, Reader | Shell sidebar, Canvas |
| learning-path | – | ai | sources per lesson | Canvas (generation) | Canvas, Reader (Lesson section), Playbook |
| topic-hidden | – | human | topic id | Canvas | Canvas |
| question | 1 | human | parent event or sentence ids | Reader, Canvas, Pointing assistant | Canvas, Reader marks |
| answer | 1 | ai | its question; sentence ids (cited) | answer verb | Reader card, Canvas card, Playbook facts |
| explainer | 1 | ai | sentence ids; medium; hint | explain verb | Reader, Canvas, Playbook (still frame) |
| note | 2 | human | sentence ids or a card | Reader, Canvas | Reader marks, Canvas leaf, evidence panel |
| insight | 3 | human | cards and/or sentence ids | Reader (Insight verb), Canvas (Connect) | Canvas (elevated), Playbook |
| thesis | 4 | human | insights, sentence ids; kind Critique or Gap | Canvas (Take a position) | Canvas (top), Playbook |
| stress-test | 1 | ai | its thesis; sentence ids (cited) | stress-test verb | Canvas under the thesis, Playbook |
| check-answer | 2 | human | lesson; question text | Place me, Check my understanding | Canvas (status derivation) |
| check-grade | 1 | ai | its check-answer; sentence ids | diagnose and check verbs | Canvas (status); disputable |
| lesson-status | – | derived | lesson; status | the status rule | Canvas nodes, Reader Lesson section, Playbook |
| pack-exported | – | human | hash; file list | Playbook | Playbook (stale rule) |
| settings-changed | – | human | keys present or not, vault, analytics | Settings | Shell |
