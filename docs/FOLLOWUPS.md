# 后续项（Follow-ups）

> 来源：10 个任务的逐任务审查 + 整支终审（2026-08-18）汇总的 deferred minors 与 follow-up 建议。
> MVP 全部验收通过后，按优先级处理；其中「发布前」项应在推送到公开仓库/发布 npm 前完成。

## 发布前（push/发布 npm 前）

- README 本地安装命令含本机绝对路径（`/home/administrator/tmp/deepseek-harness/...`），应改为通用写法（如 `$REPO_ROOT` 或 `~/`）。
- 确认 npm scope 与包名（当前 `dsh-xhs-matrix` 无 scope，发布时按需加 `@you/dsh-xhs-matrix`）。

## 建议尽快（低成本、体验/一致性）

- 面板 i18n 二选一：删除 `helpers.ts` 的 `tt()` 恒等 stub 与 `locales.ts` 未消费词典，或真正接线（组件用 `t()`）——当前两套机制并存且均未生效。
- `xhs_topics` 的 `message` 与 `topics` 数组内容重复，结构化数组可改为 `{id,status,title}` 对象。
- `DraftsTab` 录入指标仅 reads 且 `Number(reads) || 0` 有损，建议补 likes/comments 输入。
- `DraftsTab` 显示原始 accountId/topicId，可改为解析名称。
- `PersonasTab`/`AccountsTab` 注释「增删改」与实际不符：`AccountsTab` 已补行内编辑（改名称+选人设，2cdbb41）；`PersonasTab` 仍无编辑 UI（改人设名称/prompt 需删了重建），建议补。
- `store.ts` 与 `invariant.ts` 两处版本诊断措辞不同源，改一处时同步另一处。
- `/drafts/status` 路由接受 `'generated'` 状态而工具/UI 只允许 published/dropped，收紧一致。

## 可后置（低价值或需更大改动）

- `fifo` 测试补不同 createdAt 用例，真正覆盖「最旧优先」排序分支。
- `load()` 逐字段形状校验硬化（当前数组字段宽容为 `[]`）。
- `nextId()` 并发碰撞保证（单用户场景可接受）。
- 413 超限时区分「too large」消息并排空请求流。
- `deleteDraft` 对不存在 id 静默 no-op（当前唯一调用方安全）。
- 路由标记 published+metrics 时不发射 `xhs/feedback`（仅工具路径发射）——进化闭环会漏掉 UI 回填的发布，建议 follow-up 让路由也发射。
- `DEFAULT_SELECTION` 与 Config schema 默认值双源。
- `readJson` 错误携带 `cause`。
- 工具 `args.status as DraftStatus` 冗余 cast 清理。
- 面板互斥协议的单向性（ssh/taskboard 状态残留）属协议级不对称，留给协议所有者。
