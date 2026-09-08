# Practical Work checkpoint

Import `PracticalWork` from `./PracticalWork`. It renders supplied activity context, prediction, attempt, reported result, a single selected evidence reference, separately authored reflection and an explicit return action. No example curriculum or production adapter is supplied.

The shell owns the attempt UUID and immutable activity context. Mount per attempt; initialDraft is a previously acknowledged snapshot (or omit it for an empty new attempt). Keep recordPracticalResult fixed for that mount. Before replacing activity/project, unmounting or quitting, await the registered flush and proceed only on `ready`. Flush drains outstanding file/tool actions and saves, including edits made during a save; unregister the callback on unmount. A blocked flush preserves the mounted draft. Reconcile conflicts through the real producer before remounting; do not blindly retry a stale revision.

`recordPracticalResult` must durably commit via a future named main operation and return an acknowledgement for the same project/attempt. Main validates IDs, bounds, immutable origins, expected revisions and references in the transaction. An ambiguous retry must be idempotent under the stable attempt ID and unchanged content. No legacy saveEntry fallback is appropriate.

File selection is a named main selection/import callback returning opaque metadata or null for cancellation. Selection IDs must resolve to bounded, project-owned imported content at commit. No renderer paths, file inputs or filesystem APIs. Measured offers come only from trusted measurement producers; the save payload contains a capture reference, never renderer measurements. Main must resolve and verify capture ownership/provenance; TypeScript tags alone are not a trust boundary.

Tool adapters supply supported embedded open/content and/or external open callbacks. The shell can compose the existing ToolPanel, but must own its guest lifecycle and navigation policy. LocalExplanations currently drops captures and is not a result adapter. This module neither edits nor silently connects those components.

Guidance requests occur only when the learner clicks an available “Ask about…” action. They identify the original activity/attempt and one app-scoped semantic target. They do not collect content, subscribe to observation or authorize outside-app control. Future guidance consumers must resolve only the requested context under the application's explicit permission contract.

Tests use synthetic adapters only. Production integration, file/capture producers, durable reopen, independent review and integrated Electron/visual/Sonar acceptance remain outstanding.
