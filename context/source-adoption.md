# Source adoption — AR-37

The production integration repair is described in [the exact handoff](source-adoption-integration.md). Main/preload and Shell now call the owned operations and mount producer components. Authenticated HTTP composition, retained-evidence/tool context adapters, unmerged producer imports and connected external-source acceptance remain pending. Synthetic test envelopes establish local behavior, not acquisition from
a live publisher or a provider-generated lesson.

## Trusted boundary and lifetime

`WorkspaceStore.acceptAcquiredSource` accepts a main-owned project, the selected
`AcquireCanonicalSourceRequest`, and the authenticated backend response. It
reuses AR-30 runtime validation for request IDs, canonical text/hash, formats,
extraction coverage, descriptor/acquisition origins, provider identity, and use
policy. Metadata-only and failed acquisition cannot create source records. URL
metadata is retained for attribution; it never authorizes a fetch or navigation.

`SourceAdoption` captures the active project and request in a main-only pending
operation. The integration caller must obtain actual user selection or an
approved ingestion scope, supply authenticated transport, activate on project
changes, and cancel on sign-out/window disposal. Cancellation aborts the signal
and invalidates the commit capability; late or repeated results cannot save.
These acceptance capabilities are not exported through preload. Named discovery/acquisition/generation requests are wired through `SourceDesktopOperations`. There is no renderer operation
that submits provider provenance, generated text, SQL, or arbitrary IPC.

The producer handoff for generated teaching text is
`GeneratedLessonAcceptance` in `src/contracts/source-generated-lesson.ts`.
It carries canonical text with its independent source/revision identity, the
existing `AiProvenance`, and exact evidence citations. Main validates the text
hash, allowed format/model/provider/author, timestamps and bounded IDs/lists at adoption. Stored decoding preserves historical model/API metadata without applying today's transport allowlist.
Every evidence locator must match an original revision saved in that project;
citations must exactly match Unicode scalar boundaries and text in that edition.
Remote evidence IDs are resolved to local IDs for Reader origins. Missing local
originals and cross-project citations are refused. AI text is never stored as a
human import, note or insight. This additive handoff requires independent review
before it releases producer integration.

## Local records and immutable editions

Each project receives its own local UUID source identity. Remote source and
revision IDs, descriptor, acquisition provenance, extraction information and
license/access/use decisions remain attached to the retained edition. Distinct
remote editions append versions; exact replays return the existing acknowledgement
without changing current selection. Reusing an immutable remote edition with
changed content or metadata is refused. Human import cannot edit a trusted source.

The source revision, source record and both Canvas placements commit together
under an immediate SQLite transaction. The acknowledgement returns only after
commit. Source content is readable offline regardless of indexing permission;
indexing eligibility is not an assertion that content was indexed. Partial
extraction remains explicitly partial in provenance.

Generated teaching text is a separate source record with `kind: generated`, AI
provenance and local citations to retained originals. Trusted path steps may use
an optional `sourceRevisionId` to open the generated teaching edition while their
citations still refer to the originals. Existing steps without this field retain
their first-citation/pending behavior. Existing Reader and Canvas consume the same
source/path records; the UI integration still needs complete AI/extraction labels
and the reviewed sourcing callbacks before end-to-end acceptance.

## Migration and preservation

Migration `0002_source_adoption.sql` preserves all existing source IDs, revisions,
text, titles, dates and locators while expanding source provenance/format storage.
Highlights, human entries, supports, paths and placements retain their existing
foreign keys. Human-import constraints remain plain text/canonicalization `1`.

The migration follows SQLite's documented generalized table-rebuild procedure:
foreign-key enforcement is temporarily disabled outside the migration transaction,
the replacement is populated without text transformation, and an in-transaction
`pragma_foreign_key_check` guard must pass before commit. Enforcement is restored
in `finally`. Failure rolls the transaction back; data is not reset. See
[SQLite ALTER TABLE procedure](https://www.sqlite.org/lang_altertable.html#otheralter).

## Evidence and outstanding gates

`tests/integration/source-adoption.test.ts` covers real SQLite commit/reopen,
legacy source/highlight migration, immutable editions, project separation,
malformed acquisition and AI provenance, missing originals, exact citations,
cancellation and one-time adoption, and path-to-teaching-text identity. Existing
learning-record tests cover byte-exact human notes, histories and support revisions.

`tests/e2e/source-adoption.spec.ts` bundles a test-only harness of the production
main operations and invokes it inside real Electron with synthetic producer
envelopes. Reader, existing preload reads, human note saving, Canvas and restart
then use the real persisted records. The harness adds no product IPC or test mode.
It does not establish live authentication, discovery, download or generation.

The founder's recovery instructions move desktop verification off this machine:
local verification is focused TDD and `npm run check`; Cursor cloud owns the
targeted Playwright journey and hands-on recording, macOS GitHub CI owns full
desktop/package verification, and Railway/GitHub owns hosted Sonar. No further
local desktop test, recording, packaged test or Sonar run is authorized.

After exact-head checks on the integrated producers, the PR can become ready for remote verification. The repair remains draft while its imports require unmerged producer modules; an assembled overlay check is not standalone-head evidence.
Ready does not claim connected acceptance. Reviewed producer/callback integration,
the actual selected-source journey, Cursor recording, macOS CI, independent Fable
5.1 review and hosted Sonar remain explicit pending gates. AR-41 owns the lane
catalog; this branch does not change it.
