/**
 * 抖音直播自动回复系统 - 评论解析模块
 * 
 * 负责：
 * - 从页面DOM快照中解析评论 [F01-F05]
 * - 提取用户名、评论内容、时间戳
 * - 识别评论类型（普通评论、礼物、系统消息等）
 */

import config from './config.js';

/**
 * @typedef {Object} Comment
 * @property {string} id        - 评论唯一ID（用户名+内容hash）
 * @property {string} username  - 用户名
 * @property {string} content   - 评论内容
 * @property {number} timestamp - 解析时间戳
 * @property {'comment'|'gift'|'system'|'enter'} type - 评论类型
 * @property {boolean} isReply  - 是否已回复
 */

/**
 * 从页面快照中解析评论列表
 * 支持 HTML 格式和 AI 格式
 * 
 * @param {string} snapshot - browser.snapshot() 返回的内容
 * @param {number} [limit] - 最大获取评论数
 * @returns {Comment[]} 评论列表
 */
export function parseComments(snapshot, limit = config.maxComments) {
    const comments = [];

    if (!snapshot) {
        return comments;
    }

    // 自动检测格式
    if (snapshot.includes('[ref=e') && snapshot.includes('- generic')) {
        // AI 格式解析
        const aiComments = parseAIFormat(snapshot);
        comments.push(...aiComments);
    } else {
        // HTML 格式解析（原有逻辑）
        const itemRegex = /webcast-chatroom___item[\s\S]*?(?=webcast-chatroom___item|$)/gi;
        const items = snapshot.match(itemRegex) || [];

        for (const item of items) {
            const comment = parseOneComment(item);
            if (comment) {
                comments.push(comment);
            }
        }

        // 备选解析方案
        if (comments.length === 0) {
            const altComments = parseCommentsAlt(snapshot);
            comments.push(...altComments);
        }
    }

    // 限制返回数量
    if (limit && comments.length > limit) {
        return comments.slice(-limit);
    }

    return comments;
}

/**
 * 解析 AI 格式快照
 * 格式示例：
 * - generic [ref=e315]:
 *   - generic [ref=e316] [cursor=pointer]: 啊biu：
 *   - generic [ref=e317]: 大家好
 * @param {string} snapshot 
 * @returns {Comment[]}
 */
function parseAIFormat(snapshot) {
    const comments = [];
    const lines = snapshot.split('\n');

    let currentComment = null;
    let expectContent = false; // 是否正在等待内容行（紧跟用户名之后）

    // 需要过滤的 UI / 系统文本关键词
    const noiseKeywords = [
        '欢迎来到直播间', '抖音严禁', '与大家互动', '直播间规则',
        '禁止', '违规', '举报', '分享直播', '关注',
        '开播时间', '在线观众', '点赞',
    ];

    function isNoise(text) {
        return noiseKeywords.some(kw => text.includes(kw));
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 匹配用户名的行：包含 "用户名：" 格式
        // 例如："- generic [ref=e316] [cursor=pointer]: 啊biu："
        const usernameMatch = line.match(/\[ref=e(\d+)\].*?:\s*([^：:]+)[：:]\s*$/);

        if (usernameMatch) {
            // 保存上一条评论
            if (currentComment && currentComment.username && currentComment.content) {
                comments.push(currentComment);
            }

            // 开始新评论
            currentComment = {
                username: usernameMatch[2].trim(),
                content: '',
                ref: usernameMatch[1],
            };
            expectContent = true; // 接下来要捕获内容行
            continue;
        }

        // 只在刚匹配到用户名之后才接受内容行（防止错位）
        if (!expectContent || !currentComment) {
            continue;
        }

        // 匹配评论内容的行：紧跟在用户名行之后
        // 例如："- generic [ref=e317]: 大家好"
        const contentMatch = line.match(/\[ref=e(\d+)\]:\s*(.+)$/);

        if (contentMatch) {
            const content = contentMatch[2].trim();
            // 跳过系统/UI 噪音文本
            if (content && !isNoise(content) && content.length < 50) {
                currentComment.content = content;
            }
            // 无论是否有效，都锁定——不再接受后续行覆盖
            expectContent = false;
        }
    }

    // 保存最后一条评论
    if (currentComment && currentComment.username && currentComment.content) {
        comments.push(currentComment);
    }

    // 转换为标准格式
    return comments.map(c => ({
        id: generateCommentId(c.username, c.content),
        username: c.username,
        content: c.content,
        timestamp: Date.now(),
        type: identifyCommentType(c.content, ''),
        isReply: false,
    }));
}

/**
 * 解析单条评论
 * @param {string} itemHtml - 单条评论的HTML片段
 * @returns {Comment|null}
 */
function parseOneComment(itemHtml) {
    // 提取用户名
    const username = extractUsername(itemHtml);
    // 提取内容
    const content = extractContent(itemHtml);

    if (!username && !content) {
        return null;
    }

    // 识别评论类型
    const type = identifyCommentType(content, itemHtml);

    // 过滤系统消息（可根据需求调整）
    if (type === 'system' && !content) {
        return null;
    }

    return {
        id: generateCommentId(username || 'unknown', content || ''),
        username: username || '匿名用户',
        content: content || '',
        timestamp: Date.now(),
        type,
        isReply: false,
    };
}

/**
 * 提取用户名 [F02]
 * @param {string} html
 * @returns {string|null}
 */
function extractUsername(html) {
    // 尝试多种匹配模式

    // 模式1: 通过 class 匹配 (v8LY0gZF)
    const classMatch = html.match(/v8LY0gZF[^>]*>([^<]+)</);
    if (classMatch) return cleanText(classMatch[1]);

    // 模式2: 常见的用户名格式 "用户名："
    const colonMatch = html.match(/([^\s<>]+?)[\s]*[：:]/);
    if (colonMatch) return cleanText(colonMatch[1]);

    // 模式3: 通过aria-label等属性
    const ariaMatch = html.match(/aria-label="([^"]+?)"/);
    if (ariaMatch) return cleanText(ariaMatch[1]);

    return null;
}

/**
 * 提取评论内容 [F03]
 * @param {string} html
 * @returns {string|null}
 */
function extractContent(html) {
    // 模式1: content-with-emoji-text
    const emojiMatch = html.match(
        /content-with-emoji-text[^>]*>([^<]+)/
    );
    if (emojiMatch) return cleanText(emojiMatch[1]);

    // 模式2: room-message
    const msgMatch = html.match(
        /room-message[^>]*>([^<]+)/
    );
    if (msgMatch) return cleanText(msgMatch[1]);

    // 模式3: 冒号后面的内容
    const colonContent = html.match(/[：:][\s]*([^<]+)/);
    if (colonContent) return cleanText(colonContent[1]);

    return null;
}

/**
 * 识别评论类型
 * @param {string} content - 评论内容
 * @param {string} html    - 原始HTML
 * @returns {'comment'|'gift'|'system'|'enter'}
 */
function identifyCommentType(content, html) {
    if (!content) return 'system';

    const lowerContent = content.toLowerCase();

    // 礼物消息
    if (
        lowerContent.includes('送出了') ||
        lowerContent.includes('礼物') ||
        html.includes('gift') ||
        html.includes('webcast-chatroom___gift')
    ) {
        return 'gift';
    }

    // 入场消息
    if (
        lowerContent.includes('来了') ||
        lowerContent.includes('进入直播间') ||
        html.includes('enter')
    ) {
        return 'enter';
    }

    // 系统消息
    if (
        lowerContent.includes('欢迎来到') ||
        lowerContent.includes('直播间规则') ||
        html.includes('system')
    ) {
        return 'system';
    }

    return 'comment';
}

/**
 * 备选解析方案（更宽松的匹配）
 * @param {string} html - 整个页面HTML
 * @returns {Comment[]}
 */
function parseCommentsAlt(html) {
    const comments = [];

    // 尝试匹配 "用户名：内容" 格式
    const pattern = /([^\s<>]{2,20})[：:][\s]*([^<\n]{1,100})/g;
    let match;

    while ((match = pattern.exec(html)) !== null) {
        const username = cleanText(match[1]);
        const content = cleanText(match[2]);

        // 过滤无效内容
        if (username && content && content.length > 0 && content.length < 100) {
            comments.push({
                id: generateCommentId(username, content),
                username,
                content,
                timestamp: Date.now(),
                type: identifyCommentType(content, ''),
                isReply: false,
            });
        }
    }

    return comments;
}

/**
 * 生成评论唯一ID
 * @param {string} username
 * @param {string} content
 * @returns {string}
 */
function generateCommentId(username, content) {
    // 简单hash: 用户名 + 内容前20字
    const key = `${username}::${content.substring(0, 20)}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return `cmt_${Math.abs(hash).toString(36)}`;
}

/**
 * 清理文本（去除多余空白、HTML实体等）
 * @param {string} text
 * @returns {string}
 */
function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 从快照中提取所有评论（便捷函数）
 * @param {string} snapshot
 * @param {number} limit
 * @returns {Comment[]}
 */
export function getAllComments(snapshot, limit) {
    return parseComments(snapshot, limit);
}

export default {
    parseComments,
    getAllComments,
};
