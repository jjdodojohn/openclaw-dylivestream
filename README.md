# 抖音直播评论回复

基于 OpenClaw Browser Gateway 的抖音直播弹幕采集与回复工具集。

> 警告：本项目以娱乐为主，请勿滥用！

## 功能

- 增量提取评论
- 自动过滤系统消息和入场提示
- 将待处理弹幕写入本地 JSON 队列
- 通过 Gateway `/act` 接口发送直播评论
- 发送脚本与 watcher 共用 `src/config.js`
- 支持首次下载后按 `PROJECT_ROOT` 初始化

## 安装

要求：

- Node.js 18+
- OpenClaw 已安装并可使用 Browser Gateway

克隆项目后，先确认项目根目录：

```text
PROJECT_ROOT=<当前项目实际路径>
```

后续文档中的路径都按 `PROJECT_ROOT/...` 理解。

## 配置

编辑 `PROJECT_ROOT/src/config.js`：

```js
const config = {
  interval: 3000,
  maxComments: 20,
  browser: {
    baseUrl: 'http://127.0.0.1:18791',
    token: '<gateway token>',
    targetId: '',
  },
  watcher: {
    interval: 3000,
    emptySnapshotThreshold: 3,
    emptyParseThreshold: 10,
    staleSnapshotThreshold: 20,
    errorRecoveryThreshold: 3,
  },
};
```

推荐配置策略：

- `browser.baseUrl` 对齐当前 OpenClaw Browser Gateway
- `browser.token` 对齐当前 Gateway token
- 首次运行时让 `browser.targetId` 留空
- 用直播间 URL 启动 watcher，让它自动发现当前标签页

## 使用

### 1. 启动弹幕采集

```bash
cd PROJECT_ROOT
node src/watcher.js https://live.douyin.com/<room-id>
```

如果 `src/config.js` 已配置 `browser.targetId`，也可以直接运行：

```bash
cd PROJECT_ROOT
npm start
```

### 2. 查看待处理弹幕

```bash
cd PROJECT_ROOT
cat data/pending-comments.json
```

队列中只应把已处理记录的 `isReply` 改成 `true`，不要清空整个文件。

### 3. 发送回复

推荐用法：

```bash
cd PROJECT_ROOT
bash src/send-comment.sh -m "回复内容"
```

这会默认读取 `src/config.js` 中的：

- `browser.baseUrl`
- `browser.token`
- `browser.targetId`

如果你想临时覆盖目标标签页：

```bash
cd PROJECT_ROOT
bash src/send-comment.sh -t <targetId> -m "回复内容"
```

发送脚本会：

- 抓取一次快照并自动定位输入框 ref
- 通过 Gateway `/act` 发送消息
- 超过长度限制时自动拆分多条消息

## 项目结构

```text
PROJECT_ROOT/
├── src/
│   ├── watcher.js
│   ├── comment-parser.js
│   ├── config.js
│   └── send-comment.sh
├── data/
│   └── pending-comments.json
├── tests/
│   └── test.js
├── skills/
│   └── douyin-live-fullflow/
├── SKILL.md
├── README.md
└── package.json
```

## 数据格式

`data/pending-comments.json` 示例：

```json
{
  "id": "cmt_xxx",
  "username": "小明",
  "content": "主播你好",
  "timestamp": 1700000000000,
  "type": "comment",
  "isReply": false
}
```

## Skill

仓库入口 skill：

```text
PROJECT_ROOT/SKILL.md
```

完整安装、自动配置和直播流程 skill：

```text
PROJECT_ROOT/skills/douyin-live-fullflow
```
