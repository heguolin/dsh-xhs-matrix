#!/usr/bin/env bash
# 本仓库的 pnpm install 入口。
# 沙箱环境不允许向全局 store（~/.local/share/pnpm）写项目符号链接，
# 统一用工作区本地 store（<repo-root>/.pnpm-store）。pnpm 11.7 在此环境
# 不读取 .npmrc 的 store-dir，因此用显式 flag。
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/packages/dsh-xhs-matrix"
exec pnpm install --store-dir "$REPO_ROOT/.pnpm-store" "$@"
