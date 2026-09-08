# 21 · The Learning Path: generation, statuses, the diagnostic, and pacing
Type: grilling
Status: resolved
Blocked by: 08, 12, 20

## Question
The Learning Path is the Canvas's skeleton (decided in *Map and Canvas*). This ticket fixes how it comes to be and how it moves. How is the tree generated from a Brief, and from a single paper when the project starts from a source (as in `references/canvas/wondering-learning-map.png`)? How many topics and lessons is right, and can the tree grow when new sources arrive? How does the adaptive diagnostic run on screen (one question at a time, where, what the user sees between questions, how skipping works, what the placement result looks like on the tree)? How does "Check my understanding" run on a lesson? How is pacing shown: what to read next, in what order, how much, and how a survey or seminal paper fills depth under a course? What does "Find sources for this lesson" do? Every state, keyboard grammar, the bar (the Wondering learning map).

## Inputs
Resolutions of *Map and Canvas* (superseded answer), *May the AI speak first* (addendum: statuses, diagnose, check), *Narrowing dialogue*, and the *courses and scholarly APIs* research (no prerequisite relation exists in any source: depth is our inference and the surface says so).

## Resolution must state
All nine `SURFACES.md` fields for the Learning Path as part of the Canvas section. The generation rule. The diagnostic flow. The check flow. The pacing rule.

## Starting recommendation
Generation: the sourcing loop proposes topics and lessons from the Brief plus the curriculum's course syllabi and textbook tables of contents, then hangs sources under lessons; a paper-first project uses the paper's own section structure as the first tree. Pacing: "next" is the shallowest lesson not yet completed whose prerequisites are mastered or completed; the tree shows it with one mark. The diagnostic runs in the right sidebar with the tree visible, lighting the lesson each question came from.

### Inputs addendum 2026-09-06
The question door (*Narrowing dialogue*) lands on the Canvas with the tree built; topics can be hidden; "Place me" and "Check my understanding" are buttons. This ticket specifies the tree's generation and growth, how hiding works, and how both checks look on screen.

## Answer
Decided 2026-09-06 with Aaryan. Part of the Canvas section in `SURFACES.md`.

**Generation.** *Question door*: the sourcing loop reads the syllabi and tables of contents of the courses and textbooks it found for the Brief, proposes roughly five to nine topics with two to five lessons each, and hangs sources under lessons (a lecture with its timestamp range, a chapter, a paper section); surveys and seminal papers from OpenAlex and Semantic Scholar fill depth under lessons that courses cover thinly. *Source door*: the first tree is the source's own structure, sections becoming topics and their concepts lessons (as in the Wondering learning map). Prerequisite order is inferred from course order, citation direction, and the model's reading of the syllabi; no source exposes prerequisites (research), and the side panel says "order inferred" on the root.

**Growth.** The tree changes only when you add a source (new lessons appear under an existing or new topic, marked new) or press "Extend my path" on a topic (the sourcing loop proposes deeper lessons for that topic). Statuses and cards are never lost by a change. Topics can be hidden with one click and unhidden from the side panel; hidden topics are not sourced further.

**Statuses** (definitions in *May the AI speak first*, addendum): Not started, In progress, Completed, Mastered, shown as words on the node. The tree marks **Next**: the shallowest lesson not Completed whose prerequisite lessons are Completed or Mastered; the edge is the boundary before the first lesson with an unmet prerequisite. Pace is the user's; the tree only shows Next and the edge.

**Side panel** (right sidebar, sections): for the selected node, its lessons with statuses; for a lesson, the sources it draws from with read state (click opens the Reader at that spot), the questions asked about it, "Find sources for this lesson" (the sourcing loop, results as rows with an Add button), "Check my understanding", and "Extend my path" on a topic.

**Place me** (project-wide) and **Check my understanding** (one lesson) run as a **full-screen step** over the Canvas: one question per screen in the large reading type, the lesson it comes from named beneath, a short written answer, then the graded result with its reasoning and citations before the next question. Place me asks five to eight questions from mid-tree, deeper on a pass, shallower on a fail; Check asks three for its lesson. Skip or Stop at any point keeps what was placed so far; Esc stops. At the end the tree is shown with placed lessons Mastered and the edge marked. Disputing a grade excludes that question. Both are buttons the human presses, never gates.

**States.** Empty: source-first project before the tree exists (the source alone as root). Loading: generating the tree and pulling sources (long-wait tier). Partial: lessons with zero sources, marked on the node. Failed: generation or sourcing failed, message on the root with Retry. Stale: the tree predates the newest added source; one action, "Update path", which only adds. Unsupported: n/a on the tree; grading results carry badges.

**Keyboard.** On the Canvas: arrows move between nodes, Enter opens a node's side panel, o opens the lesson's first source, h hides or unhides a topic, Space f find sources, Space k check my understanding, Space P place me.

**Bar.** The Wondering learning map (`references/canvas/wondering-learning-map.png`); the Wondering canvas for the cards beneath.

**Event log.** Writes: learning-path (ai structure, with the sources each lesson draws from), lesson-status (derived, recorded on change), placement and check results (ai grading, cited; human answers as human events), topic-hidden (human), source-added. Read by: Reader (the Lesson section), Playbook ("What I read").

### Addendum 2026-09-06 (from prototype 17)
Nodes are movable; the generated layout is a proposal. Connectors are rounded curves.
