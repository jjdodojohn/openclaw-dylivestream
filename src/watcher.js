#!/usr/bin/env node

/**
 * 抖音直播弹幕监控器 (v1.0 - 文件队列模式)
 * 
 * 轻量级轮询脚本，职责单一：
 * 1. 定时对直播间页面执行 browser snapshot
 * 2. 解析快照提取新弹幕（diff 去重）
 * 3. 将新弹幕写入 data/pending-comments.json
 * 
 * OpenClaw Agent 定期读取该文件，处理后只更新对应记录的 isReply 字段。
 * 
 * 用法：
 *   node src/watcher.js [直播间URL]
 *   node src/watcher.js               # 使用 config 中 targetId
 */

import config from './config.js';
import { parseComments } from './comment-parser.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===== 配置 =====
const GATEWAY_BASE = config.browser?.baseUrl || 'http://127.0.0.1:18791';
const GATEWAY_TOKEN = config.browser?.token || '';
const TARGET_ID = config.browser?.targetId || '';

const POLL_INTERVAL = config.watcher?.interval || config.interval || 3000;
const MAX_COMMENTS = config.maxComments || 20;
const EMPTY_SNAPSHOT_THRESHOLD = config.watcher?.emptySnapshotThreshold || 3;
const EMPTY_PARSE_THRESHOLD = config.watcher?.emptyParseThreshold || 10;
const STALE_SNAPSHOT_THRESHOLD = config.watcher?.staleSnapshotThreshold || 20;
const ERROR_RECOVERY_THRESHOLD = config.watcher?.errorRecoveryThreshold || 3;

// 待评论文件路径
const PENDING_FILE = path.resolve(__dirname, '../data/pending-comments.json');

// ===== 状态 =====
const seenIds = new Set();
let targetId = TARGET_ID;
let liveUrlArg = '';
let tickCount = 0;
let newCommentCount = 0;
let errorCount = 0;
let running = true;
let emptySnapshotCount = 0;
let emptyParseCount = 0;
let staleSnapshotCount = 0;
let lastSnapshot = '';
let lastRecoveryAtTick = 0;

// ===== 文件队列操作 =====

/**
 * 读取当前待评论列表
 */
function readPending() {
    try {
        if (!fs.existsSync(PENDING_FILE)) {
            return [];
        }
        const raw = fs.readFileSync(PENDING_FILE, 'utf-8').trim();
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

/**
 * 写入待评论列表（追加模式，不会覆盖 Agent 未处理的记录）
 */
function appendPending(newComments) {
    const existing = readPending();

    // 按 id 去重，避免重复追加
    const existingIds = new Set(existing.map(c => c.id));
    const toAdd = newComments.filter(c => !existingIds.has(c.id));

    if (toAdd.length === 0) return 0;

    const merged = [...existing, ...toAdd];
    fs.writeFileSync(PENDING_FILE, JSON.stringify(merged, null, 2), 'utf-8');

    return toAdd.length;
}

// ===== 网络操作 =====

/**
 * 获取浏览器快照
 */
async function getSnapshot() {
    const url = `${GATEWAY_BASE}/snapshot?targetId=${targetId}`;
    const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${GATEWAY_TOKEN}` },
        signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
        throw new Error(`snapshot 失败: HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return data.snapshot || '';
}

function resetHealthCounters() {
    emptySnapshotCount = 0;
    emptyParseCount = 0;
    staleSnapshotCount = 0;
}

/**
 * 自动发现直播间 targetId
 */
async function discoverTarget(liveUrl) {
    const endpoints = ['/targets', '/tabs'];

    for (const endpoint of endpoints) {
        try {
            const resp = await fetch(`${GATEWAY_BASE}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${GATEWAY_TOKEN}` },
                signal: AbortSignal.timeout(5000),
            });
            if (!resp.ok) {
                continue;
            }

            const data = await resp.json();
            const targets = data.targets || data.tabs || data || [];

            for (const t of targets) {
                const pageUrl = t.url || t.page?.url || '';
                if (!pageUrl.includes('live.douyin.com')) continue;

                const normalizedLiveUrl = liveUrl.replace('https://live.douyin.com/', '');
                if (!liveUrl || pageUrl.includes(normalizedLiveUrl)) {
                    return t.targetId || t.id;
                }
            }
        } catch {
            // fallback 到下一个 endpoint
        }
    }

    return null;
}

async function recoverTarget(reason) {
    if (!liveUrlArg && !targetId) return false;
    if (tickCount - lastRecoveryAtTick < 2) return false;

    lastRecoveryAtTick = tickCount;
    const ts = new Date().toLocaleString('zh-CN');
    console.warn(`⚠️ [${ts}] 检测到轮询异常状态：${reason}，正在尝试重新绑定直播间 targetId...`);

    const discovered = await discoverTarget(liveUrlArg);
    if (!discovered) {
        console.warn(`⚠️ [${ts}] 重新绑定失败：未发现可用直播间标签页`);
        return false;
    }

    if (discovered !== targetId) {
        console.warn(`♻️ [${ts}] targetId 已更新: ${targetId} -> ${discovered}`);
        targetId = discovered;
    } else {
        console.warn(`🔄 [${ts}] targetId 校验完成，继续使用: ${targetId}`);
    }

    resetHealthCounters();
    lastSnapshot = '';
    return true;
}

// ===== 核心逻辑 =====

/**
 * 单次轮询
 */
async function tick() {
    tickCount++;

    try {
        // 1. 获取快照
        const snapshot = await getSnapshot();
        if (!snapshot) {
            emptySnapshotCount++;
            if (emptySnapshotCount >= EMPTY_SNAPSHOT_THRESHOLD) {
                await recoverTarget(`连续 ${emptySnapshotCount} 次获取到空快照`);
            }
            return;
        }

        emptySnapshotCount = 0;
        if (snapshot === lastSnapshot) {
            staleSnapshotCount++;
            if (staleSnapshotCount >= STALE_SNAPSHOT_THRESHOLD) {
                await recoverTarget(`快照连续 ${staleSnapshotCount} 次未变化`);
            }
        } else {
            staleSnapshotCount = 0;
            lastSnapshot = snapshot;
        }

        // 2. 解析评论
        const allComments = parseComments(snapshot, MAX_COMMENTS);
        if (allComments.length === 0) {
            emptyParseCount++;
            if (emptyParseCount >= EMPTY_PARSE_THRESHOLD) {
                await recoverTarget(`连续 ${emptyParseCount} 次未解析到任何评论`);
            }
            return;
        }

        emptyParseCount = 0;

        // 3. 筛选新评论
        const newComments = allComments.filter(c => {
            if (seenIds.has(c.id)) return false;
            if (c.type === 'system' || c.type === 'enter') return false;
            return true;
        });

        // 4. 标记为已见
        for (const c of allComments) {
            seenIds.add(c.id);
        }

        // 防止 seenIds 无限增长
        if (seenIds.size > 5000) {
            const arr = [...seenIds];
            arr.splice(0, arr.length - 2000);
            seenIds.clear();
            arr.forEach(id => seenIds.add(id));
        }

        if (newComments.length === 0) return;

        // 5. 追加到待评论文件
        const addedCount = appendPending(newComments);

        if (addedCount > 0) {
            const ts = new Date().toLocaleString('zh-CN');
            console.log(`📨 [${ts}] 🔔 发现 ${addedCount} 条新弹幕，已写入待评论队列`);
            for (const c of newComments) {
                console.log(`   💬 @${c.username}: ${c.content}`);
            }
            newCommentCount += addedCount;
        }

        errorCount = 0;

    } catch (err) {
        errorCount++;
        const ts = new Date().toLocaleString('zh-CN');
        console.error(`❌ [${ts}] 轮询异常 (连续第 ${errorCount} 次): ${err.message}`);

        if (errorCount >= ERROR_RECOVERY_THRESHOLD) {
            await recoverTarget(`连续 ${errorCount} 次请求异常`);
        }

        if (errorCount >= 10) {
            console.error(`⚠️  连续错误过多，暂停 30 秒...`);
            await new Promise(r => setTimeout(r, 30000));
            errorCount = 0;
        }
    }
}

/**
 * 主循环
 */
async function main() {
    const liveUrl = process.argv[2] || '';
    liveUrlArg = liveUrl;

    console.log('');
    console.log('🔭 抖音直播弹幕监控器 v1.0 (文件队列模式)');
    console.log('━'.repeat(50));

    // 确保 data 目录存在
    const dataDir = path.resolve(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // 自动发现 targetId
    if (!targetId && liveUrl) {
        console.log(`🔍 正在自动发现直播间 targetId...`);
        const discovered = await discoverTarget(liveUrl);
        if (discovered) {
            targetId = discovered;
            console.log(`✅ 找到: ${targetId}`);
        } else {
            console.error('❌ 未发现直播间标签页，请确保浏览器已打开直播间');
            process.exit(1);
        }
    }

    if (!targetId) {
        console.error('❌ 缺少 targetId，请在 config.js 中配置或传入直播间 URL');
        process.exit(1);
    }

    console.log(`📺 目标: ${liveUrl || '(config 中的 targetId)'}`);
    console.log(`🆔 TargetId: ${targetId}`);
    console.log(`⏱️  轮询间隔: ${POLL_INTERVAL}ms`);
    console.log(`🔗 Gateway: ${GATEWAY_BASE}`);
    console.log(`📁 待评论文件: ${PENDING_FILE}`);
    console.log(`🛡️  自恢复阈值: 空快照 ${EMPTY_SNAPSHOT_THRESHOLD} / 空解析 ${EMPTY_PARSE_THRESHOLD} / 静止快照 ${STALE_SNAPSHOT_THRESHOLD}`);
    console.log('━'.repeat(50));
    console.log('');

    // 预热：标记当前弹幕为已读
    console.log('🔄 预热中（标记当前弹幕为已读）...');
    try {
        const snapshot = await getSnapshot();
        const existingComments = parseComments(snapshot, MAX_COMMENTS);
        for (const c of existingComments) {
            seenIds.add(c.id);
        }
        console.log(`✅ 预热完成，已标记 ${existingComments.length} 条历史弹幕`);
    } catch (err) {
        console.warn(`⚠️  预热失败: ${err.message}（继续运行）`);
    }
    console.log('');

    // 主循环
    while (running) {
        await tick();
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
}

// 优雅退出
process.on('SIGINT', () => {
    console.log(`\n🛑 收到中断信号，正在停止... (累计发现 ${newCommentCount} 条新弹幕)`);
    running = false;
    setTimeout(() => process.exit(0), 500);
});

process.on('SIGTERM', () => {
    running = false;
    setTimeout(() => process.exit(0), 500);
});

main().catch(err => {
    console.error('💀 启动失败:', err.message);
    process.exit(1);
});
