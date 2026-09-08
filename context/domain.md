# Domain vocabulary

Current working vocabulary. Definitions marked **proposed** need detailed contracts before implementation. This glossary does not freeze a database schema. The [working MVP](mvp.md) implements Project and Entry records; the richer proposed path/activity structures remain future work.

- **Project:** the learner's Brief, Learning Path, sources, work, and Playbook.
- **Brief:** the human-owned learning intent and intended use; AI may propose wording before human acceptance or editing.
- **Learning Path:** an ordered structure of topics and lessons supporting the learner's goal. The primary organizing structure, presented as an expandable left-sidebar outline beside the active content rather than a separate screen (September 8 founder decision).
- **Topic:** a related group of concepts or capabilities in the path.
- **Lesson:** a learning step with an intended capability, relevant concepts/sources, and an activity or check. Exact completion rules remain open.
- **Entry (MVP):** a saved note, insight, result, source reference, AI response or reusable experiment on a project canvas. Position and provenance are retained. Human entries can be edited; assistant entries retain AI attribution.
- **Activity (proposed):** something the learner attempts to develop or examine understanding; practical work may happen outside the app.
- **Attempt (proposed):** a particular execution of an activity, including what the learner tried and expected.
- **Result (proposed):** returned evidence of what happened in an attempt; success is not required.
- **Artifact (proposed):** a selected file, excerpt, metric, output, or other record supporting a result. Its locators and provenance differ from source citations.
- **Source:** ingested learning material, preserved with a stable identity/version. Supported formats remain to be chosen.
- **Sentence:** an anchor for citing source text. Lectures additionally need timestamp locators.
- **Question / Answer:** the human's question and AI's evidence-grounded response. Observations and inferences remain distinguishable.
- **Note:** the learner’s own-word summary or interpretation of highlighted source text. It preserves the exact highlight, source identity/version and locator. Reading notes remain distinct from AI text and practical observations.
- **Insight:** the learner’s connection between two or more previously saved notes or questions (latest founder correction, September 8). The learner first highlights text and writes notes, then selects saved notes/questions when ready to form an insight. Insight → notes → source highlights is the provenance chain; direct passage selection does not create an insight. Multiple notes may come from one document or different generated lessons/imported/discovered sources.
- **Idea anchor:** a note’s identified source-text selection with provenance and a route back to context. Discovery metadata alone is not an extracted source passage.
- **Thesis:** a human position with evidence and what could disprove it; the earlier Critique/Gap distinction is design evidence, not an implemented schema.
- **Reader:** the source-reading experience.
- **Canvas:** the shared view connecting the path, questions, attempts, results, and human reasoning. Distilled and Expanded are two views of the same records, not separate graphs. It is an infinite dotted plane with pan/zoom navigation. The sidebar’s topics and chapters also appear as graph nodes. Distilled nests supporting notes/questions within insights; Expanded shows topic/chapter → note/question → insight relationships and source highlights.
- **Exploration:** a question branched from the current reading or idea, retaining its originating topic/chapter, source or entry within the same project. Saved questions can support an insight without being treated as source evidence. A saved question is not evidence that an AI answer exists.
- **Reading location:** a source/version and exact selected text locator, used to return to the supporting passage. Missing or changed text must be surfaced rather than silently opening an unrelated passage.
- **Paper argument graph (roadmap):** a paper’s claims and argument relationships, distinct from the learner’s authored insight graph. Integration awaits the teammate’s interface; no schema is agreed yet.
- **Playbook:** compiled knowledge and human conclusions, preserving authorship and evidence.
- **Context pack:** an intentional export of selected knowledge for coding agents.
- **Check:** an activity assessing understanding; getting code to run or opening all readings is insufficient by itself.
- **Unsupported:** evidence or citation verification failed; never a claim of correctness.

The original lesson-status rules and counter/resolution/idea/known event schema are historical. Use the current product decisions rather than copying them into new code.
