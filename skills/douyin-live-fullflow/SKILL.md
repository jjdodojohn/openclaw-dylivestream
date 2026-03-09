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

### 7. Process pending comments (Cron Job 方式)

推荐使用 OpenClaw cron job 实现定时自动回复，频率为每 10 秒。

#### 7.1 启动 cron job

使用 OpenClaw 的 `cron` 工具添加定时任务：

```javascript
// cron action: add
{
  "name": "AI Auto Reply",
  "schedule": { "kind": "every", "everyMs": 10000 },  // 每10秒
  "payload": {
    "kind": "agentTurn",
    "message": "检查pending-comments.json并自动回复",
    "model": "minimax-portal/MiniMax-M2.5",
    "thinking": "off"
  },
  "sessionTarget": "isolated",
  "delivery": { "mode": "none" }
}
```

#### 7.2 Cron job 执行流程

每次触发时：
1. 读取 `pending-comments.json`
2. 筛选 `isReply === false` 且 `type === "comment"` 的记录
3. AI 生成回复（简短、机智、幽默，30字以内）
4. 调用 `bash src/send-comment.sh -t <targetId> -m "<回复内容>"`
5. 成功后更新 `isReply = true`

#### 7.3 备选：脚本方式

也可以使用脚本 + cron job：

```bash
# 创建 AI 回复检查脚本
bash ai-reply-check.sh
```

#### 7.4 回复要求

- 保持回复简短，抖音限制约30字
- 风格：机智、幽默、热情、口语化
- 只回复有价值的评论，忽略广告/无意义内容
- 优先使用 `src/send-comment.sh` 发送回复

#### 7.5 停止 cron job

```bash
# 查看任务列表
cron action: list

# 删除任务
cron action: remove --jobId <任务ID>
```

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
