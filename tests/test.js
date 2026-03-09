import assert from 'node:assert/strict';
import { parseComments } from '../src/comment-parser.js';

const aiSnapshot = `
- generic [ref=e315]:
  - generic [ref=e316] [cursor=pointer]: 啊biu：
  - generic [ref=e317]: 大家好
`;

const htmlSnapshot = `
<div class="webcast-chatroom___item">
  <span class="v8LY0gZF">小明</span>
  <span class="webcast-chatroom___content-with-emoji-text">你好啊主播</span>
</div>
<div class="webcast-chatroom___item">
  <span class="v8LY0gZF">系统</span>
  <span class="webcast-chatroom___content-with-emoji-text">欢迎来到直播间</span>
</div>
`;

const aiComments = parseComments(aiSnapshot);
assert.equal(aiComments.length, 1);
assert.equal(aiComments[0].username, '啊biu');
assert.equal(aiComments[0].content, '大家好');

const htmlComments = parseComments(htmlSnapshot);
assert.equal(htmlComments.length, 2);
assert.equal(htmlComments[0].username, '小明');
assert.equal(htmlComments[0].type, 'comment');
assert.equal(htmlComments[1].type, 'system');

const limitedComments = parseComments(`${htmlSnapshot}${htmlSnapshot}`, 1);
assert.equal(limitedComments.length, 1);

console.log('tests/test.js passed');
