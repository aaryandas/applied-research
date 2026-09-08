# Proof video

Required for user-visible tickets. Canonical copy lives on the **Linear issue**, so the founder can verify without opening the PR.

## When required

The envelope field `Proof video:` is `required` unless it says `harness-only skip`.

## Record

1. Run the app (`npm run dev`, or packaged if the envelope says so). Linux: display or `xvfb-run` is not enough for a watchable founder video — use computer-use / a real window.
2. `RecordScreen` START, then exercise the acceptance path as a user (click, type, submit, required states).
3. `RecordScreen` SAVE as `proof-AR-n` (or equivalent). Copy into `factory/evidence/AR-n/proof.mp4` (or `.webm`).
4. Do **not** `git add` the binary. Root `.gitignore` excludes `factory/evidence/**` media.

A still screenshot is not a proof video. A passing unit test is not a proof video.

## Attach to Linear

1. Upload/attach the file on the Linear issue named in the envelope.
2. Comment: frozen SHA, envelope id, what the recording shows (acceptance bullets).
3. Put the Linear issue URL in the draft PR body.

If Linear MCP is unauthenticated: **Park**. Leave the local file path in `factory/receipts/` and BOARD. Do not mark InReview.

## After Fable LOSE

Record a **new** video on the new SHA. Attach it to the same Linear issue. Do not reuse a video from a SHA that was rejected.
