---
name: douyin-live-fullflow
description: Run the full Douyin live workflow in OpenClaw for a watcher-based `douyin-live-auto-reply` workspace. Use when Codex needs to download the project from GitHub, initialize project paths after first download, prepare a live room, start or restart the watcher, inspect `pending-comments.json`, reply to pending comments, recover from stalled polling, or shut the live workflow down cleanly.
---

# Douyin Live Fullflow

Assume this workspace uses the watcher-only architecture:

- `src/watcher.js` polls the live room snapshot
- `data/pending-comments.json` is the queue
- `src/send-comment.sh` can send replies directly with `targetId`
- replies are handled outside the watcher by `send-comment.sh` or browser actions plus `isReply` updates

First resolve the project root. Use this variable in all steps:

```text
PROJECT_ROOT=<current douyin-live-auto-reply workspace path>
```

Read `PROJECT_ROOT/src/watcher.js` and `PROJECT_ROOT/src/config.js` before acting if the current behavior is uncertain.
Read `PROJECT_ROOT/src/send-comment.sh` before changing the reply-sending path.

## Workflow

### 1. Download the project

- If the workspace does not exist yet, clone:

```bash
git clone https://github.com/jjdodojohn/openclaw-dylivestream.git <target-directory>
```

- After cloning, treat that directory as `PROJECT_ROOT`.
- If the repository already exists locally, skip cloning and continue.

### 2. Initialize project path

- On first download, confirm the real workspace path before doing anything else.
- Set:

```text
PROJECT_ROOT=<current douyin-live-auto-reply workspace path>
```

- Rewrite all path-dependent actions to use `PROJECT_ROOT`.
- If the skill text still mentions an old absolute path, replace it mentally with `PROJECT_ROOT/...` before executing commands.

### 3. Initialize configuration

- Open `PROJECT_ROOT/src/config.js`.
- Confirm or update these fields before the first run:
  - `browser.baseUrl`
  - `browser.token`
  - `browser.targetId`
  - `watcher.interval`
  - `watcher.emptySnapshotThreshold`
  - `watcher.emptyParseThreshold`
  - `watcher.staleSnapshotThreshold`
  - `watcher.errorRecoveryThreshold`
- Prefer this initialization policy:
  - keep `browser.baseUrl` aligned with the current OpenClaw browser gateway
  - keep `browser.token` aligned with the current gateway auth token
  - leave `browser.targetId` empty unless the operator explicitly wants a fixed tab
  - keep `watcher.interval` at 3000ms unless a slower or faster cadence is intentionally needed
- If configuration is stale, update the file before opening the live workflow.

### 4. Prepare the live room

- Confirm OpenClaw browser and gateway are running.
- Open the Douyin live room in the controlled browser.
- Prefer keeping only one relevant Douyin live tab open during setup; stale tabs make `targetId` recovery ambiguous.
- Confirm the operator is logged in and can see the live room chat UI.

### 5. Start the watcher

- Prefer starting with the live room URL instead of relying only on `config.browser.targetId`.
- Use:

```bash
cd PROJECT_ROOT
node src/watcher.js https://live.douyin.com/<room-id>
```

- Reset `data/pending-comments.json` to `[]` first only when the user wants a clean queue.
- Expect startup logs to show target selection, warmup, and the queue file path.

### 6. Verify health after startup

- Watch the terminal for these healthy signals:
  - watcher prints the current `targetId`
  - warmup completes
  - new comments produce `已写入待评论队列`
- Inspect `PROJECT_ROOT/data/pending-comments.json` when testing with a fresh live comment.
- If the watcher is running but the queue stays unchanged, treat it as unhealthy even if the process is still alive.

### 7. Process pending comments

- Start a cron job.
- Read `pending-comments.json` every 10 seconds.
- Process only records where `isReply === false` and `type === "comment"`.
- Keep replies short enough for Douyin. Prefer <= 30 characters.
- Read `PROJECT_ROOT/skills/douyin-live-fullflow/references/reply-style.md` before generating replies that should match the host's live persona.
- Prefer `PROJECT_ROOT/src/send-comment.sh` when you already have the correct `targetId`.
- Use:

```bash
cd PROJECT_ROOT
bash src/send-comment.sh -t <targetId> -m "回复内容"
```

- Fall back to browser snapshot plus browser actions only when the script is failing or being debugged.
- After each handled record, update only that record's `isReply` field to `true`.
- Do not truncate the whole queue file; the watcher may have appended newer items.

### 8. Recover when polling stalls

- Treat these watcher warnings as recovery signals:
  - repeated empty snapshots
  - repeated empty parse results
  - stale snapshots
  - repeated request failures
- Let the watcher's built-in `targetId` recovery run first.
- If recovery keeps failing:
  - verify the live tab still exists
  - close irrelevant Douyin live tabs
  - restart the watcher with the live room URL
  - confirm `config.browser.baseUrl` and `config.browser.token`
  - confirm `config.browser.targetId` is not pinned to an old tab unless that is intentional
- If parsing breaks after a Douyin UI change, inspect `PROJECT_ROOT/src/comment-parser.js` and update selectors or AI-format parsing.

### 9. Stop cleanly

- Stop the watcher with `Ctrl+C` or by terminating the watcher process only.
- Leave `pending-comments.json` intact unless the user explicitly asks to clear it.

## Operating rules

- Prefer direct commands and state checks over assumptions.
- Prefer one watcher process per workspace.
- Prefer URL-based startup for better `targetId` recovery.
- Prefer empty `browser.targetId` plus URL startup for first-time initialization.
- Prefer `src/send-comment.sh` as the default reply path when `targetId` is known.
- Preserve queue records; mutate `isReply` only.
- Use `PROJECT_ROOT/skills/douyin-live-fullflow/references/checklist.md` for command snippets and fast triage.
- Use `PROJECT_ROOT/skills/douyin-live-fullflow/references/reply-style.md` for response tone and guardrails.
