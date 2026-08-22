# DeepSeek Harness 执行提示词

请在当前仓库中执行“人设拥有内容资产 v4”实施计划，持续工作直到计划全部完成或遇到技能规定的真正停止条件。

开始前必须完整阅读以下三个文件，它们按优先级组成执行契约：

1. 规格：`docs/superpowers/specs/2026-08-22-persona-owned-content-architecture-design.md`
2. 实施计划：`docs/superpowers/plans/2026-08-22-persona-owned-content-implementation.md`
3. UI 视觉参考：`docs/superpowers/ui/2026-08-22-persona-owned-content-ui-reference.html`

规格是需求权威；计划规定实现顺序与接口；UI 参考规定 Task 9–11 的信息结构、视觉层级和窄宽响应。你有视觉能力，请在前端任务开始前实际打开 HTML 参考，不要仅通过文件名猜测界面。

使用以下技能链：

1. `superpowers:using-git-worktrees`：先创建或确认隔离 worktree。未经用户额外授权，不得直接在 main/master 上实现。
2. `superpowers:subagent-driven-development`：作为总控制流程，按 Task 1→12 串行执行，并创建该计划专属 ledger。
3. `superpowers:test-driven-development`：每个实现 Task 严格 RED → GREEN → REFACTOR；必须先看到测试因目标行为缺失而失败。
4. 每个 Task 完成后按 subagent-driven-development 生成 task brief、实现报告和 review package，再派独立 Task Reviewer；Reviewer 必须同时给出规格符合度和代码质量结论。
5. 所有 Task 完成后使用 `superpowers:requesting-code-review` 做全分支审查。
6. 最终使用 `superpowers:verification-before-completion` 运行完整验证并核对证据。
7. 最后使用 `superpowers:finishing-a-development-branch` 提供分支处理选项；不要自行 push、merge、发布或自动发布小红书内容。

执行规则：

- 先运行 subagent-driven-development 的 pre-flight 扫描，把 Task 文件重叠、接口生产/消费关系和计划自洽性写入 ledger，然后直接开始 Task 1。
- 一个 Task 一个全新实现子代理；不同实现 Task 不并行。实现子代理不得自行再派子代理。
- 每个实现子代理只读取当前 task brief、必要的早期接口、规格和全局约束，不要把完整聊天历史塞给子代理。
- 每个子代理必须明确选择模型：多文件集成任务使用标准/强模型，Task Reviewer 使用不低于实现者的模型，最终全分支审查使用最强可用模型。
- 子代理报告不能作为完成证据；主代理必须检查真实 diff、提交范围和测试输出。
- 发现缺陷时回到原实现子代理修复并做 scoped re-review；不得把问题留给下一 Task 顺手修。
- 除不可逆操作、安全敏感操作、worktree 外部副作用或计划完全无法判定外，不要在 Task 之间询问“是否继续”。
- 不做范围外重构，不改变已批准的数据归属模型，不降低迁移、违禁词、质量门、流式输出或 UI 要求。
- `scripts/install.sh` 当前有用户保留的 `100755 => 100644` 权限变化。不得修改、暂存或还原；按计划记录开工和收尾摘要。
- Task 12 必须报告 `pnpm test`、`pnpm typecheck`、`pnpm build`、浏览器验收、质量评估状态和最终 git 状态的真实证据。

现在先声明你正在使用上述技能链，建立隔离 worktree 和 ledger，完成 pre-flight 表格，然后开始 Task 1。不要一次性直接修改所有文件。
