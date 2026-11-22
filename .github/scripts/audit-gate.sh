#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# audit-gate 判定器（被 .github/workflows/audit-gate.yml 调用；也可本地/CI 单测）
#
# 规则只有一条：
#   PR 改的文件全部在 people/ 下   → 免审计，退出码 0（作者自己就能合）
#   有任何一个文件在 people/ 以外  → 必须有审计 approve，否则退出码 1（合不进去）
#
# 需要的环境变量：GH_TOKEN、REPO（owner/name）、NUMBER（PR 号）、PR_AUTHOR
# 可覆盖：AUDITOR（默认 naruto7）
# 退出码：0 = 通过；1 = 拦截。任何读不到信息的情况一律按 1 处理（fail-closed）。
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

AUDITOR="${AUDITOR:-naruto7}"
REPO="${REPO:?REPO 未设置}"
NUMBER="${NUMBER:?NUMBER 未设置}"
PR_AUTHOR="${PR_AUTHOR:-}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

say() { echo "$@"; }
to_summary() { echo "$@" >> "$SUMMARY"; }

say "PR #$NUMBER · 作者：${PR_AUTHOR:-未知}"

# 1) 改动文件清单。读不到就拦，不放行。
if ! RAW=$(gh api --paginate "repos/$REPO/pulls/$NUMBER/files?per_page=100" \
            --jq '.[].filename' 2>/dev/null); then
  say "::error::读取本 PR 的改动文件失败，默认拦截（fail-closed），请重跑本检查。"
  exit 1
fi
mapfile -t FILES <<< "$RAW"

SHARED=()
for f in "${FILES[@]}"; do
  [ -z "$f" ] && continue
  case "$f" in
    people/*) ;;
    *) SHARED+=("$f") ;;
  esac
done

# 2) 只动 people/ → 免审计
if [ "${#SHARED[@]}" -eq 0 ]; then
  to_summary ""
  to_summary "### ✅ 免审计（only people/）"
  to_summary ""
  to_summary "本 PR 只动了 \`people/\` 下的个人文件，属于个人上传：不需要评审，自己点 **Merge pull request** 就行。"
  say "PASS: 只改 people/，免审计"
  exit 0
fi

# 3) 动到共享区 → 查当前有效的 Approve（DISMISSED / 旧提交的不算）
APPROVERS=$(gh api --paginate "repos/$REPO/pulls/$NUMBER/reviews?per_page=100" \
  --jq '.[] | select(.state=="APPROVED") | "\(.user.login)|\(.author_association)"' 2>/dev/null || true)

HAS_AUDITOR=0
HAS_PEER=0
while IFS='|' read -r login assoc; do
  [ -z "$login" ] && continue
  if [ "$login" = "$AUDITOR" ]; then HAS_AUDITOR=1; continue; fi
  case "$assoc" in
    MEMBER|OWNER|COLLABORATOR)
      [ "$login" != "$PR_AUTHOR" ] && HAS_PEER=1
      ;;
  esac
done <<< "$APPROVERS"

# 组长本人开共享区 PR 时不能自己 approve 自己 → 由任一其他组员 approve 即可
if [ "$HAS_AUDITOR" -eq 1 ] || { [ "$PR_AUTHOR" = "$AUDITOR" ] && [ "$HAS_PEER" -eq 1 ]; }; then
  to_summary ""
  to_summary "### ✅ 已审计"
  to_summary ""
  to_summary "共享区改动已通过审计，可以合并。"
  say "PASS: 共享区改动已获得审计 approve"
  exit 0
fi

# 4) 其余一律拦
to_summary ""
to_summary "### ❌ 需要组长审计"
to_summary ""
to_summary "本 PR 动到了 \`people/\` 以外的共享区："
to_summary ""
for f in "${SHARED[@]}"; do
  to_summary "- \`$f\`"
done
to_summary ""
to_summary "怎么过："
to_summary "1. 如果只是个人素材 / 草稿 → 挪进 \`people/<你的 GitHub 名>/\`，本检查会自动变绿；"
to_summary "2. 如果确实要改共享文件 → 群里 @$AUDITOR，等他在本 PR 点 **Approve**，本检查自动变绿。"

say "::error::共享区改动缺少审计 approve：需要 @$AUDITOR 在 PR 上点 Approve（或把文件移回 people/ 下）。"
exit 1
