---
name: linear-demo-record
description: >-
  Records a Cursor demo video for each Linear ticket in In Testing, attaches
  the MP4 to the ticket, and moves it to In Review until that column is empty.
  Use whenever the user asks to record demos, drain In Testing, attach
  walkthrough videos to Linear, demo acceptance criteria, QA a testing column,
  or move tickets from testing to review.
---

# Linear demo record

Drain Linear **In Testing** by recording a Cursor walkthrough of each ticket's acceptance criteria, attaching the video, and moving the ticket to **In Review**.

One ticket at a time. Re-query the column after every ticket � the board changes under you. Stop when In Testing is empty, or when every remaining ticket was skipped this pass (so a blocked ticket cannot spin the loop).

## Defaults

|                | Default                             | Override            |
| -------------- | ----------------------------------- | ------------------- |
| Source status  | `In Testing`                        | User names a column |
| Dest status    | `In Review`                         | User names a column |
| Team           | Whole workspace                     | User names a team   |
| Blocked ticket | Comment, leave In Testing, continue |                     |

Do not move a ticket to In Review unless a demo file was recorded **and** attached. The video is the reviewer's evidence; a status change without it is a false signal.

## Setup (once per run)

1. Confirm Linear tools are available (`list_issues`, `get_issue`, `save_issue`, `save_comment`, `list_issue_statuses`, `prepare_attachment_upload`, `create_attachment_from_upload`). Namespace is often `plugin-linear-linear`. If the server needs auth, authenticate, then continue.
2. Discover Cursor's recorder (see [Recorder](#recorder)). If it is missing, stop and tell the user � do not substitute OBS, QuickTime, or a handwritten ffmpeg grab of the whole desktop.
3. Resolve status names. `list_issue_statuses` is per-team; match case-insensitively. If `In Testing` is absent, try `Testing`, `QA`, `In QA`. If `In Review` is absent, try `Review`. If still ambiguous, ask.
4. Track two sets in this run: `done` (identifier moved to In Review) and `skipped` (commented, still In Testing).

## Loop

```
while In Testing has tickets not in skipped:
  1. Pull next ticket
  2. Understand AC ? demo script
  3. Ready the app (not recorded)
  4. Record the walkthrough
  5. Attach the MP4
  6. Move to In Review + comment
```

### 1. Pull next ticket

`list_issues` with `state` = the resolved In Testing name, `limit` 50, `orderBy` `updatedAt`. Request `id`, `title`, `description`, `status`, `team`, `url`.

Pick the first issue whose identifier is not in `skipped`. Prefer older `updatedAt` so tickets do not starve.

Then `get_issue` on that identifier. Confirm it is still In Testing. If someone already moved it, skip silently and re-list.

If the user named a single identifier, do only that ticket, then stop.

### 2. Understand acceptance criteria

Build a short demo script (3�8 observable UI steps) from the issue body, in this order:

1. A heading matching `/acceptance criteria/i`, `/qa steps/i`, `/test plan/i`, or `/demo/i`
2. Checkboxes, numbered steps, or Given/When/Then under that heading
3. Otherwise the rest of the description, if it already reads as steps

Each step must be something a reviewer can **see** in the video (navigate here, click this, this text/state appears). Drop setup that belongs before recording (install, seed, env).

**Skip** (comment + continue) when:

- There are no executable steps � title-only, or the body is design notes with nothing to click
- The app cannot be reached (no URL, cannot start, login wall with no existing session)
- The walkthrough fails (error, missing feature, AC clearly not met)

Do not invent a walkthrough from the title alone. A guessed demo attached as proof is worse than leaving the ticket in Testing.

### 3. Ready the app (not recorded)

Find the surface before you hit record:

- URL in the ticket, comments, or the user's message
- A running local server (check terminals)
- `package.json` / README start scripts � start the app if needed and wait until it is actually serving

Open the first screen of the demo (logged-in, correct route, test data visible). Use the Cursor browser: lock the tab, snapshot, then drive with click/type/fill � not a CDP Input path.

If you cannot reach a demoable screen, skip. Never type secrets you found in a ticket into a production login.

### 4. Record the walkthrough

Start recording only when the first screen is ready. Then play the script at a reviewer's pace: pause after each AC step so the result is on screen. Keep it to this ticket � 15�90 seconds is typical.

After the last step, **save** the recording. Confirm the file exists, is an MP4 (or whatever the recorder returned), and is non-empty. If the flow broke mid-take, **discard** and either retry once or skip with what went wrong.

Name the file `{identifier}-demo.mp4` when you copy it somewhere stable (e.g. `/tmp/linear-demos/`).

### 5. Attach the MP4

Linear wants a direct upload, not base64 through the model:

1. `prepare_attachment_upload` with `issue`, `filename`, `contentType` `video/mp4`, exact byte `size`, title like `{identifier} demo`.
2. PUT the raw bytes to `uploadRequest.url` with **every** `uploadRequest.headers` header, unmodified (casing included). The signed URL expires in 60 seconds. One file at a time. Use [scripts/put-linear-upload.py](scripts/put-linear-upload.py):
   ```bash
   python3 scripts/put-linear-upload.py /path/to/file.mp4 /tmp/prepare.json
   ```
   Write the prepare-tool JSON to that file first. Do not print the file's bytes into chat.
3. `create_attachment_from_upload` with the `assetUrl` from prepare.

If attach fails, do not change status. Retry prepare+PUT once if the URL expired; then skip.

### 6. Move to In Review

`save_issue` with the issue `id` and `state` = the resolved In Review name.

`save_comment` on the issue:

```
Demo attached covering:
- {step}
- {step}

Moved to In Review.
```

Add the identifier to `done`. Re-list In Testing and continue.

## Skip comment

Leave status as In Testing. Comment, add to `skipped`, continue:

```
Could not record a demo. Left in In Testing.

Reason: {one sentence}
What's needed: {AC, URL, session, or a passing build}
```

## Recorder

Discover the recorder **every run**. Tool names move around; search the catalog for `recordScreen`, `RecordSession`, `record_video`, `START_RECORDING`.

### Cursor `recordScreen` (local IDE)

This is the built-in recorder. Modes:

| `mode`              | When                  |
| ------------------- | --------------------- |
| `START_RECORDING`   | First screen is ready |
| `SAVE_RECORDING`    | Walkthrough succeeded |
| `DISCARD_RECORDING` | Take is unusable      |

A success result may include `path`, `recordingDurationMs`, `wasPriorRecordingCancelled`. If a prior recording is open, save or discard it before starting this ticket's take.

Inspect the tool schema before calling it (`GetDynamicTools` / equivalent). Invoke it the same way other Cursor-native tools are invoked in this session.

### Cloud / computer use

If this session is a Cloud Agent (or `computerUse` is available) and `recordScreen` is not, record a short screen recording of the walkthrough on the agent desktop. Artifacts are often MP4s under an artifacts directory. Copy that file, then attach it to Linear the same way.

### Missing recorder

Stop the loop. Tell the user Cursor's recorder is not in this session. Do not keep pulling tickets.

## Stop conditions

- In Testing lists no issues ? done
- Every listed In Testing issue is in `skipped` ? done; report what blocked them
- User says stop ? stop after finishing or discarding the current take; do not leave a recording hanging
- Recorder missing, Linear unauthenticated, or statuses cannot be resolved ? stop and say why

## End of run

Report identifiers, not a transcript:

```
In Testing is empty.

Recorded ? In Review: ENG-12, ENG-15
Skipped (still In Testing): ENG-18 (login wall)
```

If you stopped early, say what is still in Testing.
