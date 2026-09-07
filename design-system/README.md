# Applied Research — Field Atlas

An illustrated, interactive design-system reference for Applied Research. Open `index.html` through a local HTTP server:

```sh
cd design-system
python3 -m http.server 8765 --bind 127.0.0.1
```

Visit `http://127.0.0.1:8765`. No install, build step, account, or API key is required. A server is recommended because browser storage behavior for `file:` URLs differs. All visual assets and fonts are local. Only explicit original-paper links leave the local preview.

## What is here

- `apple-landscape/`: the user-approved desktop opening screen, with the grand apple-tree landscape, falling apple, and live Field Atlas components. Open `/apple-landscape/`; its `BRIEF.md` records the decision, prompts and verification. Earlier apple studies are superseded.
- `index.html`: the visual atlas and semantic component specimens.
- `tokens.css`: reusable day/evening semantic tokens, typography roles, spacing, radii, motion, and reading measure.
- `styles.css`: composition, components, responsive layouts, focus styles, and reduced-motion behavior.
- `app.js`: local interactive demonstration with one shared state model.
- `assets/`: original generated illustration, optimized runtime image, local fonts, licenses, and generation prompt.
- `CASE-STUDY.md`: design rationale and decisions against the first teardown.
- `INTEGRATION.md`: component contracts and the production renderer handoff.
- `evidence/`: browser screenshots, contrast calculations, review and verification records.
- `../PRODUCT.md` and `../DESIGN.md`: product truth and the finished visual-system contract.

## Try the historical interaction specimens

The reference retains its earlier Workbench and counter/idea vocabulary. Root `PRODUCT.md` supersedes that behavior for new application development.

1. Enter the workspace, read the example, and inspect its citation. Escape closes the source preview and restores focus.
2. Write a note, counter, or idea. Save it, then inspect the Workbench and Playbook. Counts share the same state.
3. Begin a thesis. Drafts persist without satisfying completion rules; completion requires a claim, an attached source, and a falsifier.
4. Export the sample Markdown. Human text remains unchanged and references retain event identifiers.
5. Switch between daylight and evening. Preview waiting, unsupported, and failed AI states in Craft & detail.
6. Preferences → Reset this local example clears demonstration data only after a confirmation. Export first if you want to retain your writing.

Storage is browser-local, namespaced `applied-research-field-atlas-v2`. When unavailable, the UI reports session-only storage. No secrets, telemetry, external requests, vault writes, or AI calls are made by the demo. The UI labels its research text as a study paraphrase and its analysis as illustrative.

## Scope

This is a new design system and functioning reference, not the finished Electron app. The original canvases and teardown are preserved in the [Obsidian knowledge base](../docs/knowledge-base.md). Production API keys, ingestion, span validation, live streaming, argument distillation, insight promotion, complete Context pack files, and vault integration are handoff work; the reference does not claim to implement them.
