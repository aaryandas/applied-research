# Domain vocabulary

Current working vocabulary. Definitions marked **proposed** need detailed contracts before implementation. This glossary does not freeze a database schema.

- **Project:** the learner's Brief, Learning Path, sources, work, and Playbook.
- **Brief:** the human-owned learning intent and intended use; AI may propose wording before human acceptance or editing.
- **Learning Path:** an ordered structure of topics and lessons supporting the learner's goal. The primary organizing structure.
- **Topic:** a related group of concepts or capabilities in the path.
- **Lesson:** a learning step with an intended capability, relevant concepts/sources, and an activity or check. Exact completion rules remain open.
- **Activity (proposed):** something the learner attempts to develop or examine understanding; practical work may happen outside the app.
- **Attempt (proposed):** a particular execution of an activity, including what the learner tried and expected.
- **Result (proposed):** returned evidence of what happened in an attempt; success is not required.
- **Artifact (proposed):** a selected file, excerpt, metric, output, or other record supporting a result. Its locators and provenance differ from source citations.
- **Source:** ingested learning material, preserved with a stable identity/version. Supported formats remain to be chosen.
- **Sentence:** an anchor for citing source text. Lectures additionally need timestamp locators.
- **Question / Answer:** the human's question and AI's evidence-grounded response. Observations and inferences remain distinguishable.
- **Note:** the human's words attached to source material, a question, or their work.
- **Insight:** the human's interpretation or connection supported by evidence.
- **Thesis:** a human position with evidence and what could disprove it; the earlier Critique/Gap distinction is design evidence, not an implemented schema.
- **Reader:** the source-reading experience.
- **Canvas:** the shared view connecting the path, questions, attempts, results, and human reasoning.
- **Playbook:** compiled knowledge and human conclusions, preserving authorship and evidence.
- **Context pack:** an intentional export of selected knowledge for coding agents.
- **Check:** an activity assessing understanding; getting code to run or opening all readings is insufficient by itself.
- **Unsupported:** evidence or citation verification failed; never a claim of correctness.

The original lesson-status rules and counter/resolution/idea/known event schema are historical. Use the current product decisions rather than copying them into new code.
