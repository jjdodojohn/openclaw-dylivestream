---
name: douyin-live-auto-reply
description: 基于 OpenClaw 的抖音直播项目安装、初始化与自动配置技能入口。用于首次安装时自动下载 GitHub 项目、确认 `PROJECT_ROOT`、检查 `src/config.js`、准备 Browser Gateway、启动 watcher、并使用 `src/send-comment.sh` 发送回复；当任务涉及安装、初始化、自动配置、启动直播流程或接管当前工作区时使用。
---


## 初始化目标

完成以下事项：

1. 从 GitHub 下载项目
2. 确认项目根路径 `PROJECT_ROOT`
3. 检查 OpenClaw Browser Gateway 是否可用
4. 更新 `PROJECT_ROOT/src/config.js`
5. 打开直播间并准备正确的标签页
6. 启动 `PROJECT_ROOT/src/watcher.js`
7. 使用 `PROJECT_ROOT/src/send-comment.sh` 验证回复链路

## 下载项目

默认仓库地址：

```text
https://github.com/jjdodojohn/openclaw-dylivestream
```

首次安装时，先把仓库克隆到目标目录，例如：

```bash
git clone https://github.com/jjdodojohn/openclaw-dylivestream.git <目标目录>
```

克隆完成后，再把该目录设为 `PROJECT_ROOT`。

## 第一步

先设置：

```text
PROJECT_ROOT=<当前 douyin-live-auto-reply 项目路径>
```

后续所有路径都基于 `PROJECT_ROOT/...`。

## 配置文件

主要配置文件：

- `PROJECT_ROOT/src/config.js`

首次安装时重点确认：

- `browser.baseUrl`
- `browser.token`
- `browser.targetId`
- `watcher.interval`
- watcher 的恢复阈值

推荐策略：

- `browser.baseUrl` 使用当前 OpenClaw Browser Gateway 地址
- `browser.token` 使用当前 Gateway token
- `browser.targetId` 首次先留空
- 用直播间 URL 启动 watcher，让它自动发现 targetId

## OpenClaw 流程

1. 确认 OpenClaw browser 和 gateway 已启动
2. 在受控浏览器中打开抖音直播间
3. 保持只有一个目标直播标签页，避免 targetId 混乱
4. 启动 watcher：

```bash
cd PROJECT_ROOT
node src/watcher.js https://live.douyin.com/<room-id>
```

5. 检查 `PROJECT_ROOT/data/pending-comments.json` 是否开始写入新弹幕
6. 使用发送脚本验证回复链路：

```bash
cd PROJECT_ROOT
bash src/send-comment.sh -m "你好"
```

如果需要覆盖标签页：

```bash
cd PROJECT_ROOT
bash src/send-comment.sh -t <targetId> -m "你好"
```

## 自动配置规则

- 默认从 `PROJECT_ROOT/src/config.js` 读取 watcher 和发送配置
- 默认优先让 watcher 自动发现 `targetId`
- 默认优先使用 `src/send-comment.sh` 发送回复
- 如果 watcher 在运行但不再写入队列，按 `skills/douyin-live-fullflow` 中的恢复流程处理

## 全流程入口

完整直播流程见：

```text
PROJECT_ROOT/skills/douyin-live-fullflow
```
