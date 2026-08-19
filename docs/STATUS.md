# dsh-xhs-matrix 状态（2026-08-19）

> 供跨会话交接：重启 GUI 后新会话/新代理可直接读取此文件接手。

## 当前状态

- **MVP 已实现并全部审查通过**：分支 `mvp`，19 个提交（spec+plan+实现+修复），49 测试 + typecheck + build 全绿。
- **已安装到运行中的 web profile**：`dsh plugin --profile web add link:<repo>/packages/dsh-xhs-matrix` 成功；
  bundle 层 `dsh-xhs-matrix` 已入 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`；
  node_modules symlink 指向 `/home/administrator/tmp/deepseek-harness/dsh-xhs-matrix/packages/dsh-xhs-matrix`。
- **组合已验证**（`--dump-config` 含 `- id: xhs-matrix / name: dsh-xhs-matrix`），Host 半模块导入冒烟通过。

## 待办（用户验收，spec §12）

重启 Web GUI 后，在新会话按下列六步验收；发现问题让 agent 修（仓库 `mvp` 分支）：

1. 侧边栏出现「矩阵」入口 → 点击后中栏显示五 Tab 面板
2. UI 配置：人设「干货风」→ 添加账号 A 并分配 → 添加 3 个选题 → 添加 1 条全局黑名单
3. 对话问「今天要发什么」→ agent 调 `xhs_today` → 创作简报 → 文案+封面提示词 → `xhs_draft_save` → chat 卡片
4. 再问一次 → 同账号当日不重复
5. 剩余选题加入黑名单 → `xhs_today` 排除；选题池耗尽有中文诊断
6. 草稿标记 published + 录入阅读量 → `xhs/feedback` 事件出现在日志

## 关键路径

- 仓库：`/home/administrator/tmp/deepseek-harness/dsh-xhs-matrix`（branch `mvp`）
- 数据文件：`~/.dsh/dsh-xhs-matrix.json`
- 后续项：`docs/FOLLOWUPS.md`
- 设计/计划：`docs/specs/2026-08-18-xhs-matrix-design.md`、`docs/superpowers/plans/2026-08-18-xhs-matrix-mvp.md`
- 安装：`dsh plugin --profile web add link:<repo>/packages/dsh-xhs-matrix`（或 npm 发布后按包名）
- 构建/测试：`cd packages/dsh-xhs-matrix && bash ../../scripts/install.sh`（首次/新依赖后）→ `pnpm build && pnpm test && pnpm typecheck`

## 收尾待决

- 验收通过后：合并 `mvp` → `main`、推送 GitHub（仓库尚无 remote）、发布 npm。
- 删除 SDD 工作区（`.superpowers/sdd/`，gitignored）待分支落地后执行。
