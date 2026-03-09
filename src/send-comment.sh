#!/bin/bash

set -euo pipefail

# 抖音直播发送评论脚本
# 用法: ./send-comment.sh -t <targetId> -m <message>
# 说明:
# 1. 默认从 src/config.js 读取 BASE_URL / TOKEN / targetId
# 2. -t 传入的 targetId 优先级高于 config.js
# 3. 长文本会自动拆分多条发送

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.js"

TARGET_ID=""
MESSAGE=""
BASE_URL=""
TOKEN=""
CONFIG_TARGET_ID=""
MAX_LENGTH=50  # 抖音单条评论最大50个字符（中文/英文都按字符计算）

load_config() {
  local config_json
  config_json=$(node --input-type=module -e "
    import config from '${CONFIG_FILE}';
    console.log(JSON.stringify({
      baseUrl: config.browser?.baseUrl || 'http://127.0.0.1:18791',
      token: config.browser?.token || '',
      targetId: config.browser?.targetId || ''
    }));
  ")

  BASE_URL=$(printf '%s' "$config_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["baseUrl"])')
  TOKEN=$(printf '%s' "$config_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
  CONFIG_TARGET_ID=$(printf '%s' "$config_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["targetId"])')
}

usage() {
  echo "用法: $0 [-t <targetId>] -m <消息内容>"
  echo "示例: $0 -t 78790073E2DD92EDF7E521B7F5D6D873 -m 你好"
  echo "示例: $0 -m 你好   # 使用 config.js 中的 targetId"
  echo ""
  echo "注意: 如果消息超过50字，会自动拆分成多条发送"
}

# 解析参数
while getopts "t:m:h" opt; do
  case $opt in
    t) TARGET_ID="$OPTARG" ;;
    m) MESSAGE="$OPTARG" ;;
    h)
      usage
      exit 0
      ;;
    *)
      echo "无效参数"
      usage
      exit 1
      ;;
  esac
done

load_config

if [ -z "$TARGET_ID" ]; then
  TARGET_ID="$CONFIG_TARGET_ID"
fi

if [ -z "$MESSAGE" ]; then
  echo "错误: 需要指定消息内容"
  usage
  exit 1
fi

if [ -z "$TARGET_ID" ]; then
  echo "错误: 需要指定 targetId，或在 src/config.js 中配置 browser.targetId"
  usage
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo "错误: src/config.js 中缺少 browser.token"
  exit 1
fi

# 按字符数拆分（支持中文，按 Unicode 字符计算）
split_message() {
  local msg="$1"
  local max_len="$2"

  python3 << EOF
msg = """$msg"""
max_len = $max_len
if len(msg) <= max_len:
    print(msg)
else:
    for i in range(0, len(msg), max_len):
        print(msg[i:i + max_len])
EOF
}

# 获取输入框 ref (只返回数字部分)
get_input_ref() {
  local snapshot
  snapshot=$(curl -fsS "$BASE_URL/snapshot?targetId=$TARGET_ID" -H "Authorization: Bearer $TOKEN")

  # 优先匹配包含"互动"的输入框（抖音直播间的输入框特征）
  local ref
  ref=$(echo "$snapshot" | grep -o "ref=e[0-9]*.*互动" | grep -o "e[0-9]*" | tail -1 || true)

  # 如果没找到，尝试匹配 [active] 的输入框
  if [ -z "$ref" ]; then
    ref=$(echo "$snapshot" | grep -o "\[active\] \[ref=e[0-9]*\]" | grep -o "e[0-9]*" | tail -1 || true)
  fi

  # 如果还没找到，使用默认值
  if [ -z "$ref" ]; then
    ref="e308"
  fi

  echo "${ref#e}"
}

echo "🔗 Gateway: $BASE_URL"
echo "🆔 TargetId: $TARGET_ID"
echo "📝 消息长度: ${#MESSAGE} 字符"

# 用 python 计算正确的字符数（支持中文）
MSG_LEN=$(python3 -c "print(len('''$MESSAGE'''))")
echo "📝 实际字符数: $MSG_LEN (中文按字计算)"

# 拆分消息
MESSAGES=()
while IFS= read -r line; do
  [ -n "$line" ] && MESSAGES+=("$line")
done < <(split_message "$MESSAGE" "$MAX_LENGTH")

echo "📤 将发送 ${#MESSAGES[@]} 条消息"

INPUT_REF=$(get_input_ref)
FULL_REF="e$INPUT_REF"
echo "🎯 使用输入框 ref: $FULL_REF"

for i in "${!MESSAGES[@]}"; do
  msg="${MESSAGES[$i]}"
  echo "  [$((i + 1))/${#MESSAGES[@]}] 发送: $msg"

  RESULT=$(curl -fsS -X POST "$BASE_URL/act" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"targetId\":\"$TARGET_ID\",\"kind\":\"type\",\"ref\":\"$FULL_REF\",\"text\":\"$msg\",\"submit\":true}")

  if echo "$RESULT" | grep -q "ok"; then
    echo "  ✅ 发送成功"
  else
    echo "  ❌ 发送失败: $RESULT"
  fi

  if [ "$i" -lt "$((${#MESSAGES[@]} - 1))" ]; then
    sleep 1
  fi
done

echo "🎉 全部发送完成"
