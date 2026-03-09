# Douyin Live Checklist

## Download

```bash
git clone https://github.com/jjdodojohn/openclaw-dylivestream.git <target-directory>
```

If the project already exists locally, skip this step.

## Initialize project path

First set:

```text
PROJECT_ROOT=<current douyin-live-auto-reply workspace path>
```

## Initialize config

Open and verify:

```text
PROJECT_ROOT/src/config.js
```

Check:

1. `browser.baseUrl`
2. `browser.token`
3. `browser.targetId`
4. `watcher.interval`
5. recovery thresholds under `watcher`

Recommended first-run policy:

1. Keep `browser.targetId` empty
2. Start watcher with a live room URL
3. Let watcher auto-discover the active live tab

## Start

```bash
cd PROJECT_ROOT
printf '[]\n' > data/pending-comments.json
node src/watcher.js https://live.douyin.com/<room-id>
```

Use the queue reset only for a clean session.

## Reply

```bash
cd PROJECT_ROOT
bash src/send-comment.sh -m "回复内容"
```

Use `-t` only when you need to override `config.js` 中的 `browser.targetId`.

## Health checks

```bash
cd PROJECT_ROOT
cat data/pending-comments.json
```

```bash
cd PROJECT_ROOT
node tests/test.js
```

## Stalled polling triage

1. Confirm the live room tab is still open and logged in.
2. Confirm only the intended Douyin live tab is open.
3. Restart the watcher with the live room URL.
4. Test whether `src/send-comment.sh` can still send with the current `targetId`.
5. Inspect `src/watcher.js` recovery warnings.
6. If snapshots are present but comments are not parsed, inspect `src/comment-parser.js`.

## Queue handling rule

Given:

```json
[
  {
    "id": "c1",
    "username": "小明",
    "content": "主播你好",
    "type": "comment",
    "isReply": false
  }
]
```

After replying, write back:

```json
[
  {
    "id": "c1",
    "username": "小明",
    "content": "主播你好",
    "type": "comment",
    "isReply": true
  }
]
```

Do not delete unrelated records.
