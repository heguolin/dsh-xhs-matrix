# 人设拥有内容资产（v4）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task. 每个 Task 使用一个全新实现子代理，再使用一个独立 Task Reviewer 同时给出规格符合度和代码质量两个结论；修改同一核心文件的 Task 必须串行。

**Goal:** 把已发布知识库、爆款池、人工权重、写作规则、结尾互动钩子和违禁词迁移为“人设资产”，让同人设账号真实共享，并完成无损迁移、手动爆款、两阶段去 AI 味、结构化流式创作和账号即时刷新。

**Architecture:** 账号只表示发布入口与来源快照，`personaId` 是知识库和爆款的唯一内容归属。存储升级到 v4，旧数据先备份再原子迁移；无法可靠归属的完整记录进入强类型 `pendingOwnership`。服务端拆出人设资产与内容质量边界，创作台只展示可审计创作摘要和最终稿，不展示模型内部原始推理。

**Tech Stack:** TypeScript、Node.js、Cordis、Vitest、React 18、tsdown。

**Spec:** `docs/superpowers/specs/2026-08-22-persona-owned-content-architecture-design.md`

**UI Reference:** `docs/superpowers/ui/2026-08-22-persona-owned-content-ui-reference.html`

**Test Plan:** `docs/superpowers/plans/2026-08-22-persona-owned-content-test-plan.md`

## Global Constraints

- 所有命令在 `packages/dsh-xhs-matrix` 目录执行。
- 每个 Task 先写失败测试、确认失败原因正确、最小实现、运行本 Task 测试、运行 `pnpm typecheck`，通过后才提交。
- 不得提交明知不能通过 `pnpm typecheck` 的中间状态。
- 每次源码提交前运行 `pnpm build` 并同步对应的 `lib/**`；最终里程碑再次全量构建。
- git 身份固定为：`git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit ...`。
- `scripts/install.sh` 当前存在用户保留的权限变化 `100755 => 100644`。不得修改、暂存或还原；开工和收尾的 `git diff --summary -- scripts/install.sh` 必须完全相同，且 `git diff --cached --quiet -- scripts/install.sh` 返回成功。
- 内容权重必须是 `0–5` 整数。机器 `score` 与人工 `weight` 独立；创作参考先按人工权重降序，再按机器分数降序。
- 手动新增爆款强制 `source:'manual'`、`status:'accepted'`、`weight:5`；自动采集默认 `status:'pending'`、`weight:1`。
- 违禁词只有人设级来源。参考素材命中仅警告；生成稿命中必须阻止助手消息落库和草稿保存。
- 兼容一个版本的 `accountId` 查询入口：内部解析为账号当前人设；同时传入不一致的 `accountId` 与 `personaId` 返回 `409`。
- 账号删除保留人设资产与历史指标，删除账号专属会话、草稿和采集配置；账号换绑不移动历史资产。
- 生成结果只进入会话或草稿，不自动发布到小红书。
- UI 遵循参考稿的信息结构与窄宽响应规则；允许复用现有 CSS 命名，不要求逐像素复刻。

## 文件职责与依赖顺序

| 单元 | 主要文件 | 职责 |
|---|---|---|
| 领域与持久化 | `types.ts`、`store.ts`、`migration.ts` | v4 类型、不变量、备份、原子迁移、待归属 |
| 人设资产 | `persona-assets.ts`、`composer.ts` | 人设资产操作、排序、显式转移、创作上下文 |
| 内容质量 | `content-quality.ts` | 去 AI 味流式审校、违禁词扫描、质量报告 |
| 服务端契约 | `routes/**`、`protocol.ts`、`tools.ts` | 兼容解析、API、工具、SSE、持久幂等 |
| 客户端状态 | `client/api.ts`、`XhsPanel.tsx` | 类型化 API、人设资产作用域、账号即时刷新 |
| 业务界面 | `KnowledgeTab`、`ViralTab`、`PersonasTab`、`StudioTab` | 人设资产操作与创作体验 |

依赖链：Milestone 1 → 2 → 3 → 4 → 5 → 6。每个里程碑验收通过后才进入下一个。

---

## Milestone 1：v4 领域模型与无损迁移

### Task 1：一次性升级领域类型与 Store 不变量

**Files:**
- Modify: `src/types.ts`、`src/store.ts`
- Test: `tests/types-v4.test.ts`、`tests/store.test.ts`

**Interfaces:**

- `PublishedNote`、`ViralItem`、`ViralBatch` 使用 `personaId` 唯一归属；来源为可选 `sourceAccountId`、`sourceAccountName`。
- `Persona` 新增 `writingStyles`、`endingHookConstraints`、`endingHookExamples`、`forbiddenWords`。
- `Draft` 新增 `personaIdSnapshot`、`qualityReport`；`StudioMessage` 新增 `personaIdSnapshot`、`requestId`；`MetricSnapshot` 新增 `accountNameSnapshot`。
- `StoreFile.version = 4`，新增 `pendingOwnership`。

待归属必须是完整、可辨识联合，禁止 `Record<string, unknown>`：

```ts
type PendingPublishedNotePayload = Omit<PublishedNote, 'personaId'>
type PendingViralItemPayload = Omit<ViralItem, 'personaId'>
type PendingOwnership =
  | { id: string; kind: 'published-note'; payload: PendingPublishedNotePayload; sourceAccountId?: string; sourceAccountName?: string; reason: string; migratedAt: string }
  | { id: string; kind: 'viral-item'; payload: PendingViralItemPayload; sourceAccountId?: string; sourceAccountName?: string; reason: string; migratedAt: string }
```

- [ ] **Step 1：写失败测试**

```ts
it('完整待归属笔记归属后保持 id、正文和权重', () => {
  const store = createStore()
  const personaId = store.upsertPersona({ name: 'P', prompt: 'p' }).id
  store.stashPendingOwnership({
    kind: 'published-note',
    payload: { id: 'legacy-note', title: '孤儿笔记', copy: '完整正文', publishedAt: '2026-08-22', source: 'manual', weight: 3, createdAt: ISO, updatedAt: ISO },
    sourceAccountId: 'deleted-account', reason: '账号不存在',
  })
  const pending = store.listPendingOwnership()[0]
  expect(store.assignPendingOwnership(pending.id, personaId)).toMatchObject({ id: 'legacy-note', personaId, copy: '完整正文', weight: 3 })
  expect(store.listPendingOwnership()).toHaveLength(0)
})

it('手动爆款固定 accepted+5，采集爆款默认 pending+1', () => {
  const { store, personaId } = seededPersona()
  expect(store.addManualViral(personaId, { title: '手动', body: '正文' })).toMatchObject({ source: 'manual', status: 'accepted', weight: 5 })
  expect(store.saveViralItem({ personaId, title: '采集', body: '正文', source: 'apify', score: 8, reasons: [] })).toMatchObject({ status: 'pending', weight: 1 })
})

it.each([-1, 1.5, 6])('拒绝非法权重 %s', weight => {
  const { store, personaId, noteId } = seededNote()
  expect(() => store.setNoteWeight(personaId, noteId, weight)).toThrow(/0.*5.*整数/)
})

it('删除账号只清理账号私有数据，保留人设资产和指标快照', () => {
  const seeded = seededAccountWithAssets()
  seeded.store.deleteAccount(seeded.accountId)
  expect(seeded.store.listPublishedNotes(seeded.personaId)).toHaveLength(1)
  expect(seeded.store.listViralItems(seeded.personaId)).toHaveLength(1)
  expect(seeded.store.listMetricSnapshotsByNote(seeded.noteId)).toHaveLength(1)
  expect(seeded.store.listStudioMessages(seeded.accountId)).toHaveLength(0)
  expect(seeded.store.listDrafts(seeded.accountId)).toHaveLength(0)
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/types-v4.test.ts tests/store.test.ts`

Expected: FAIL，仅因 v4 字段、方法和约束尚不存在。

- [ ] **Step 3：实现精确 Store API**

```ts
listPublishedNotes(personaId?: string): PublishedNote[]
savePublishedNote(payload: PublishedNotePayload): PublishedNote
importPublishedNotes(personaId: string, payloads: PublishedNotePayload[]): PublishedNote[]
setNoteWeight(personaId: string, noteId: string, weight: number): PublishedNote
transferNotes(personaId: string, noteIds: string[], targetPersonaId: string): PublishedNote[]
listViralItems(personaId?: string, status?: ViralStatus, batchId?: string): ViralItem[]
saveViralItem(payload: ViralItemPayload): ViralItem
addManualViral(personaId: string, payload: ManualViralPayload): ViralItem
setViralWeight(personaId: string, itemId: string, weight: number): ViralItem
transferViralItems(personaId: string, itemIds: string[], targetPersonaId: string): ViralItem[]
assignPendingOwnership(id: string, targetPersonaId: string): PublishedNote | ViralItem
personaInUse(personaId: string): { accountCount: number; noteCount: number; viralCount: number }
```

`assignPendingOwnership` 先验证完整载荷和目标人设，再写正式集合，最后移除 pending；失败时不得移除 pending。

`deleteAccount` 必须删除该账号的会话、草稿和采集配置，保留 `PublishedNote`、`ViralItem` 与 `MetricSnapshot`；删除后指标调度器不得再向该账号 id 写新快照。

- [ ] **Step 4：本 Task 验收**

Run: `pnpm vitest run tests/types-v4.test.ts tests/store.test.ts && pnpm typecheck && pnpm build`

- [ ] **Step 5：提交**

```bash
git add src/types.ts src/store.ts tests/types-v4.test.ts tests/store.test.ts lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(store): 建立 v4 人设资产领域模型"
```

### Task 2：v3→v4 备份、原子迁移与失败恢复

**Files:**
- Modify: `src/migration.ts`、`src/store.ts`
- Test: `tests/migration.test.ts`、`tests/store.test.ts`

**Interfaces:**

```ts
migrateStoreFileV3ToV4(file: StoreFileV3): StoreFile
backupStoreFile(filePath: string, now?: () => Date): string
atomicWriteStoreFile(filePath: string, data: StoreFile): void
```

迁移函数直接从 `file.accounts` 和 `file.personas` 解析归属，不接收可能与文件不一致的外部 resolver。

- [ ] **Step 1：写迁移和故障注入测试**

覆盖：可靠归属、账号缺失、账号无人设、旧字段改名、旧爆款默认权重 1、审核状态保留、Draft/Studio 快照补齐、备份逐字节一致、原子重命名失败时原 v3 不变。多个账号映射到同一人设时内容自然合并，但内容 id 不重写、既有权重不平均也不覆盖。

```ts
it('写 v4 失败时原 v3 与备份均可用', () => {
  const filePath = seedV3File()
  const before = readFileSync(filePath)
  expect(() => loadWithInjectedRenameFailure(filePath)).toThrow()
  expect(readFileSync(filePath)).toEqual(before)
  expect(readFileSync(findBackups(filePath)[0])).toEqual(before)
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/migration.test.ts tests/store.test.ts -t "v3|备份|原子"`

- [ ] **Step 3：实现**

同目录写 `<filename>.tmp-<pid>-<random>`，成功后 `renameSync` 替换正式文件；失败时仅删除已解析的临时文件，保留 v3 与备份。v1/v2 先迁为内存 v3，再走同一 v3→v4 流程。

- [ ] **Step 4：Milestone 1 验收门**

Run: `pnpm vitest run tests/types-v4.test.ts tests/store.test.ts tests/migration.test.ts && pnpm typecheck && pnpm build`

- [ ] **Step 5：提交**

```bash
git add src/migration.ts src/store.ts tests/migration.test.ts tests/store.test.ts lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(migration): 无损迁移人设资产存储到 v4"
```

---

## Milestone 2：人设资产服务与内容质量服务

### Task 3：PersonaAssetService、共享排序与历史来源

**Files:**
- Create: `src/persona-assets.ts`
- Modify: `src/composer.ts`、`src/metrics.ts`、`src/importer.ts`、`src/collector/rank.ts`
- Test: `tests/persona-assets.test.ts`、`tests/composer.test.ts`、`tests/metrics.test.ts`、`tests/collector-rank.test.ts`

**Interfaces:** `PersonaAssetService` 是路由和工具操作人设资产的唯一入口，提供列表、导入、调权、手动爆款、审核、`deleteBatch(personaId, batchId)`、批量转移、待归属和 `personaInUse`。`composeBrief(persona, viralItems, accountName?)` 使用 v4 字段；参考排序为 `weight DESC, score DESC`。

- [ ] **Step 1：写共享与历史来源失败测试**

```ts
it('同人设两账号共享资产，账号换绑不改变来源快照', () => {
  const { service, personaId, accountA, accountB } = seededSharedPersona()
  const note = service.importNotes(personaId, [validNoteInput()], accountA.id, accountA.name)[0]
  expect(accountB.personaId).toBe(personaId)
  rebindAccount(accountA.id, anotherPersonaId())
  expect(service.listNotes(personaId)[0]).toMatchObject({ id: note.id, sourceAccountId: accountA.id, sourceAccountName: accountA.name })
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/persona-assets.test.ts tests/composer.test.ts tests/metrics.test.ts tests/collector-rank.test.ts`

- [ ] **Step 3：实现**

指标按 `sourceAccountId` 找历史笔记并写 `accountNameSnapshot`；若来源账号已删除则跳过新采集。采集开始时捕获 `personaId` 并写入结果；导入显式接收目标 `personaId`；排名不得再按 `note.accountId` 过滤。

- [ ] **Step 4：验证、构建、提交**

Run: `pnpm vitest run tests/persona-assets.test.ts tests/composer.test.ts tests/metrics.test.ts tests/collector-rank.test.ts && pnpm typecheck && pnpm build`

```bash
git add src/persona-assets.ts src/composer.ts src/metrics.ts src/importer.ts src/collector/rank.ts tests/persona-assets.test.ts tests/composer.test.ts tests/metrics.test.ts tests/collector-rank.test.ts lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(assets): 建立人设共享资产服务"
```

### Task 4：流式去 AI 味、违禁词扫描与评估集

**Files:**
- Create: `src/content-quality.ts`、`tests/content-quality.test.ts`、`tests/fixtures/content-quality-eval.json`、`scripts/eval-content-quality.ts`
- Modify: `package.json`

**Interfaces:**

```ts
interface ContentQualityService {
  naturalizeStream(rawDraft: string, persona: Persona, onDelta: (delta: string) => void): Promise<string>
  check(text: string, persona: Persona): { report: QualityReport; allowed: boolean }
}
```

`naturalizeStream` 必须调用 `StudioLlmClient.stream`；禁止先 `complete` 全文再伪造流式分块。

- [ ] **Step 1：写扫描、提示词与流式失败测试**

```ts
it('只转发审校后的增量并返回相同完整文本', async () => {
  const deltas: string[] = []
  const quality = createQualityService(fakeStream(['更自然的', '最终稿']))
  const result = await quality.naturalizeStream('原始初稿', persona(), d => deltas.push(d))
  expect(deltas).toEqual(['更自然的', '最终稿'])
  expect(result).toBe('更自然的最终稿')
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/content-quality.test.ts`

- [ ] **Step 3：实现服务与评估脚本**

评估集至少 8 个固定样例，每例包含 `rawDraft`、`requiredFacts`、`forbiddenFacts`、`persona`。`pnpm eval:quality` 调真实模型后检查必需事实未丢失、禁止事实未新增、违禁词为零；无模型凭证时退出非零，不伪装通过。

- [ ] **Step 4：Milestone 2 验收门与提交**

Run: `pnpm vitest run tests/content-quality.test.ts tests/persona-assets.test.ts tests/composer.test.ts && pnpm typecheck && pnpm build`

Run when credentials exist: `pnpm eval:quality`

```bash
git add src/content-quality.ts tests/content-quality.test.ts tests/fixtures/content-quality-eval.json scripts/eval-content-quality.ts package.json lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(quality): 增加流式去 AI 味与人设质量门"
```

---

## Milestone 3：服务端 API、创作事务与持久幂等

### Task 5：人设作用域 API、兼容路由与工具契约

**Files:**
- Modify: `src/protocol.ts`、`src/routes/shared.ts`、`src/routes/knowledge.ts`、`src/routes/viral.ts`、`src/routes/personas.ts`、`src/routes/index.ts`、`src/tools.ts`
- Test: `tests/routes.test.ts`、`tests/tools.test.ts`

**Interfaces:** `resolvePersonaScope(store, accountId?, personaId?): string`；新增 `/viral/manual`、`/notes/transfer`、`/viral/transfer`、`/pending-ownership`。`DELETE /viral?persona=&batch=` 通过 `PersonaAssetService.deleteBatch` 删除当前人设批次，跨人设 batch id 返回 `404`。人设有账号或资产时 DELETE 返回 `409` 和计数。工具新增 `xhs_viral_add`、`xhs_pending_ownership`；`xhs_draft_save` 必须应用与 Studio 路由相同的 `qualityReport` 保存门。

- [ ] **Step 1：写契约失败测试**

```ts
it('account 与 persona 不一致返回 409', async () => {
  expect((await json(`/api/dsh-xhs-matrix/notes?account=${accountA}&persona=${personaB}`)).status).toBe(409)
})
it('手动爆款按 persona 保存为 accepted+5', async () => {
  const res = await json('/api/dsh-xhs-matrix/viral/manual', post({ personaId, title: '手动', body: '正文' }))
  expect(res.body.item).toMatchObject({ personaId, source: 'manual', status: 'accepted', weight: 5 })
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/routes.test.ts tests/tools.test.ts -t "persona|人设|手动爆款|409|待归属"`

- [ ] **Step 3：实现**

错误映射：参数错误 `400`、未找到 `404`、作用域或依赖冲突 `409`。资产响应必须带 `personaId`；兼容 account 查询响应增加 `resolvedPersonaId`。

- [ ] **Step 4：验证、构建、提交**

Run: `pnpm vitest run tests/routes.test.ts tests/tools.test.ts && pnpm typecheck && pnpm build`

```bash
git add src/protocol.ts src/routes src/tools.ts tests/routes.test.ts tests/tools.test.ts lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(api): 提供人设资产路由与兼容工具契约"
```

### Task 6：两阶段 Studio、结构化 SSE 与持久完成态幂等

**Files:**
- Modify: `src/studio.ts`、`src/routes/studio.ts`、`src/store.ts`
- Test: `tests/studio.test.ts`、`tests/routes.test.ts`

**Interfaces:**

```ts
type StudioSseEvent =
  | { type: 'phase'; phase: 'planning' | 'drafting' | 'polishing' | 'checking' }
  | { type: 'evidence'; evidence: DraftEvidence }
  | { type: 'plan_delta'; delta: string }
  | { type: 'content_delta'; delta: string }
  | { type: 'quality'; report: QualityReport; allowed: boolean }
  | { type: 'done'; messageId: string; coverPrompt: string; quality: QualityReport; evidence: DraftEvidence; personaId: string; deduplicated?: boolean }
  | { type: 'error'; stage: string; retryable: boolean; message: string }
```

完成态幂等通过落库的 `StudioMessage.requestId`；进程内只维护正在执行 key，并在 `finally` 删除，禁止无界保存历史 requestId。

- [ ] **Step 1：写事务、流式和幂等失败测试**

```ts
it('content_delta 只含去 AI 味后的最终稿', async () => {
  const events: StudioSseEvent[] = []
  await studio.sendStream(accountId, '写一篇', 'creative', e => events.push(e), { requestId: 'req-1' })
  expect(join(events, 'content_delta')).toBe('最终审校稿')
  expect(join(events, 'content_delta')).not.toContain('原始初稿')
})
it('相同 requestId 完成后重试不调用模型或重复落库', async () => {
  await send('req-1'); const calls = llmCallCount(); const replay = await send('req-1')
  expect(llmCallCount()).toBe(calls)
  expect(replay.done.deduplicated).toBe(true)
  expect(messagesByRequestId('req-1')).toHaveLength(2)
})
```

另测：进行中重复返回 `409 REQUEST_IN_PROGRESS`；审校失败不落消息；违禁词命中不落消息且草稿保存返回 `409 QUALITY_BLOCKED`；SSE 断开不保存半截助手消息。

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/studio.test.ts tests/routes.test.ts -t "两阶段|content_delta|requestId|QUALITY_BLOCKED|SSE"`

- [ ] **Step 3：实现固定事务顺序**

捕获账号与当前人设快照 → 构建证据 → 流式计划并在服务端缓冲原始初稿 → `naturalizeStream` 输出最终稿增量 → 确定性扫描 → 质量通过后一次性保存 user/assistant 两条消息和 requestId → `done`。历史只读取相同 `accountId` 且 `personaIdSnapshot` 等于当前人设的消息。

- [ ] **Step 4：Milestone 3 验收门与提交**

Run: `pnpm vitest run tests/studio.test.ts tests/routes.test.ts tests/tools.test.ts && pnpm typecheck && pnpm build`

```bash
git add src/studio.ts src/routes/studio.ts src/store.ts tests/studio.test.ts tests/routes.test.ts lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(studio): 增加两阶段流式质量门与持久幂等"
```

---

## Milestone 4：客户端 API、统一人设作用域与账号即时刷新

### Task 7：类型化客户端 API 与 SSE 解析

**Files:**
- Modify: `src/client/api.ts`
- Test: `tests/client-api.test.ts`

- [ ] **Step 1：写 API 失败测试**

覆盖 persona 查询参数、manual/transfer/pending 端点、权重 PATCH、结构化 SSE 跨网络 chunk 解析、错误事件、done 负载和 requestId 透传。

```ts
it('SSE JSON 被网络分块拆开时仍按事件回调', async () => {
  mockSseChunks(['data: {"type":"content_', 'delta","delta":"最终稿"}\n\n', 'data: {"type":"done","messageId":"m1"}\n\n'])
  const events: StudioSseEvent[] = []
  await api.studioSendStream('a1', '写', 'creative', e => events.push(e), 'req-1')
  expect(events.map(x => x.type)).toEqual(['content_delta', 'done'])
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/client-api.test.ts`

- [ ] **Step 3：实现客户端契约**

公开资产方法以 `personaId` 为主参数；兼容 account 使用显式对象 `{ accountId }`，不得用无类型字符串猜测账号或人设。SSE parser 保留跨 chunk 缓冲区，只在完整空行分隔后解析事件。

- [ ] **Step 4：验证、构建、提交**

Run: `pnpm vitest run tests/client-api.test.ts && pnpm typecheck && pnpm build`

```bash
git add src/client/api.ts tests/client-api.test.ts lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(client): 对齐人设资产与结构化 SSE 契约"
```

### Task 8：统一人设作用域状态与账号创建后即时选中

**Files:**
- Modify: `src/client/panel/XhsPanel.tsx`、`src/client/panel/AccountsDialog.tsx`
- Create: `src/client/panel/PersonaScopeSelector.tsx`
- Test: `tests/xhs-panel.test.tsx`

**Interfaces:** `XhsPanel` 保存 `assetPersonaId`：默认跟随当前账号人设；知识库/爆款池允许临时切换；再次选择账号时重新跟随该账号人设。`AccountsDialog.onSaved(createdId)` 返回新账号 id。

- [ ] **Step 1：写状态失败测试**

```ts
it('创建账号后等待刷新并立即选中新账号', async () => {
  renderPanel()
  await createAccount({ name: '新账号', personaId: 'p1' })
  expect(api.listAccounts).toHaveBeenCalledTimes(2)
  expect(selectedAccount()).toBe('新账号')
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/xhs-panel.test.tsx -t "创建账号|人设作用域"`

- [ ] **Step 3：实现单一状态源**

成功顺序固定为：API 创建 → `await refreshAccounts()` → `setAccountId(createdId)` → 关闭弹窗。弹窗不得维护无法通知侧栏的账号副本；失败时保留表单并显示错误。

- [ ] **Step 4：Milestone 4 验收门与提交**

Run: `pnpm vitest run tests/client-api.test.ts tests/xhs-panel.test.tsx tests/client-mount.test.tsx && pnpm typecheck && pnpm build`

```bash
git add src/client/panel/XhsPanel.tsx src/client/panel/AccountsDialog.tsx src/client/panel/PersonaScopeSelector.tsx tests/xhs-panel.test.tsx lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "fix(panel): 统一人设作用域并即时刷新新账号"
```

---

## Milestone 5：知识库、爆款池与人设配置界面

### Task 9：知识库与爆款池人设资产视图

**Files:**
- Modify: `src/client/panel/KnowledgeTab.tsx`、`src/client/panel/ViralTab.tsx`、`src/client/panel/ImportDialog.tsx`、`src/client/panel/panel.module.css`
- Test: `tests/knowledge-tab.test.tsx`、`tests/viral-tab.test.tsx`、`tests/import-dialog.test.tsx`

**UI Contract:** 遵循 UI 参考文件的顶部人设作用域带、共享账号提示、来源快照、0–5 分段权重、素材违禁词警告、显式转移和待归属入口。爆款批次左侧为摘要，条目右侧为可扫描列表，禁止默认展开全部长正文。

- [ ] **Step 1：写核心交互失败测试**

覆盖默认跟随账号人设、临时切换人设、导入目标人设、手动新增后即时显示 accepted+5、爆款权重、来源账号、批次删除、转移、待归属、警告不阻止收录。仅当 pending 数量大于 0 时显示“待归属”入口。

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/knowledge-tab.test.tsx tests/viral-tab.test.tsx tests/import-dialog.test.tsx`

- [ ] **Step 3：按参考稿实现**

手动新增弹窗字段：归属人设（只读当前作用域）、标题、正文、可选来源链接、可选发布日期；按钮旁明确显示“默认已采纳 · 权重 5”。

- [ ] **Step 4：验证、构建、提交**

Run: `pnpm vitest run tests/knowledge-tab.test.tsx tests/viral-tab.test.tsx tests/import-dialog.test.tsx && pnpm typecheck && pnpm build`

```bash
git add src/client/panel/KnowledgeTab.tsx src/client/panel/ViralTab.tsx src/client/panel/ImportDialog.tsx src/client/panel/panel.module.css tests/knowledge-tab.test.tsx tests/viral-tab.test.tsx tests/import-dialog.test.tsx lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(ui): 提供人设知识库与爆款资产视图"
```

### Task 10：人设写作规则、结尾钩子、安全词与历史 UI

**Files:**
- Modify: `src/client/panel/PersonasTab.tsx`、`src/client/panel/DraftsTab.tsx`、`src/client/panel/DraftEditor.tsx`、`src/client/panel/OverviewTab.tsx`、`src/client/locales.ts`、`src/client/panel/panel.module.css`
- Test: `tests/personas-tab.test.tsx`、`tests/drafts-tab.test.tsx`

**UI Contract:** “写作风格”支持预设建议与自由新增/编辑/删除；“结尾互动钩子约束”是独立自由文本；“最佳案例”是可增删列表；“人设违禁词”独立编辑。旧 `hookStyles` 芯片不得继续标为钩子。

- [ ] **Step 1：写表单与历史快照失败测试**

覆盖自定义写作风格、钩子约束、多个案例、违禁词保存；旧 `toneTags` 仍作为口癖/语气标签并与写作风格分开；草稿/编辑器展示 `personaIdSnapshot` 与 `qualityReport`；人设有资产时删除按钮展示 409 依赖数量。

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/personas-tab.test.tsx tests/drafts-tab.test.tsx`

- [ ] **Step 3：按参考稿实现**

使用“写作风格 / 结尾互动钩子 / 人设违禁词 / 生效范围”四区块；Harness 窄宽度下降为单栏，不得让中文输入形成逐字竖排。

- [ ] **Step 4：Milestone 5 验收门与提交**

Run: `pnpm vitest run tests/personas-tab.test.tsx tests/drafts-tab.test.tsx tests/knowledge-tab.test.tsx tests/viral-tab.test.tsx && pnpm typecheck && pnpm build`

```bash
git add src/client/panel/PersonasTab.tsx src/client/panel/DraftsTab.tsx src/client/panel/DraftEditor.tsx src/client/panel/OverviewTab.tsx src/client/locales.ts src/client/panel/panel.module.css tests/personas-tab.test.tsx tests/drafts-tab.test.tsx lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(ui): 分离写作风格、结尾钩子与人设安全规则"
```

---

## Milestone 6：创作台体验、全量回归与交付

### Task 11：结构化创作台、最终稿流式输出与智能跟随底部

**Files:**
- Modify: `src/client/panel/StudioTab.tsx`、`src/client/panel/panel.module.css`
- Test: `tests/studio-tab.test.tsx`

**UI Contract:** 落地参考稿中的四阶段进度、可折叠创作说明、最终稿、依据侧栏和质量门。`plan_delta` 是可审计摘要，不得命名为“模型思维链”或展示内部原始推理。

- [ ] **Step 1：写事件与滚动失败测试**

覆盖事件顺序、最终稿增量、质量失败、可重试错误；首次进入、切换账号/人设、历史加载后滚到底；底部附近持续跟随；主动上滚超过阈值后暂停并显示“回到最新”；点击后恢复。

```ts
it('用户上滚后暂停跟随，点击回到最新后恢复', async () => {
  renderStudio(); scrollMessagesAwayFromBottom(); emit({ type: 'content_delta', delta: '新内容' })
  expect(screen.getByRole('button', { name: '回到最新' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '回到最新' }))
  expect(scrollToBottom).toHaveBeenCalled()
})
```

- [ ] **Step 2：确认失败**

Run: `pnpm vitest run tests/studio-tab.test.tsx`

- [ ] **Step 3：实现事件状态机与滚动策略**

只有 `content_delta` 写入最终稿；`plan_delta` 写入创作说明；`quality.allowed === false` 禁用保存。底部阈值为 `scrollHeight - scrollTop - clientHeight <= 80`，不得每次无条件 `scrollIntoView`。

- [ ] **Step 4：验证、构建、提交**

Run: `pnpm vitest run tests/studio-tab.test.tsx tests/client-api.test.ts tests/studio.test.ts && pnpm typecheck && pnpm build`

```bash
git add src/client/panel/StudioTab.tsx src/client/panel/panel.module.css tests/studio-tab.test.tsx lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(studio-ui): 展示结构化流式创作与质量状态"
```

### Task 12：端到端验收、构建产物与工作区保护

**Files:**
- Modify: only generated `lib/**` if the final build changes it
- Test: all tests

- [ ] **Step 1：自动测试**

Run: `pnpm test`

Expected: 0 failing tests；禁止 `.skip`、`.only` 或删除旧测试换取通过。

- [ ] **Step 2：类型、构建与质量评估**

Run: `pnpm typecheck && pnpm build`

Run when credentials exist: `pnpm eval:quality`

若未配置真实模型凭证，报告必须写“质量评估未运行”，不得把单元测试等同于真实模型评估。

- [ ] **Step 3：浏览器验收**

在 `dsh web` 中核对：同人设共享内容与权重；手动爆款 accepted+5；新账号即时出现；风格与钩子分离；创作台阶段/摘要/最终稿/质量/底部跟随；违禁词阻止保存。

- [ ] **Step 4：核对用户文件保护**

Run from repository root:

```bash
git diff --summary -- scripts/install.sh
git diff --cached --quiet -- scripts/install.sh
git status --short
```

第一条仍须为开工记录的 `mode change 100755 => 100644`；第二条退出码为 0。不得要求该文件 git 状态为空。

- [ ] **Step 5：最终构建提交**

仅当最终构建后 `lib/**` 有未提交变化时执行：

```bash
git add packages/dsh-xhs-matrix/lib
git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "build: 同步人设资产 v4 构建产物"
```

- [ ] **Step 6：使用 `superpowers:verification-before-completion` 出具报告**

报告列出命令、退出码、测试数量、浏览器验收、未运行项、`scripts/install.sh` 前后摘要和最终 git 状态。只有强制门槛全部通过后才能宣称完成。

---

## 子代理执行规则

1. Task 1→12 严格串行；一个 Task 一个新实现子代理。
2. 每 Task 完成后，主代理生成完整 diff review package，再派一个独立 Task Reviewer；评审报告必须同时包含“规格符合度”和“代码质量”两个结论，缺一不可。
3. 问题由原实现子代理修正并重新审查，不能让下一个 Task 顺带修。
4. 子代理只接收当前 Task、全局约束、规格与 UI 参考路径；不得把全部 Task 一次塞给同一子代理。
5. Task 12 由主代理执行最终验证，不接受实现子代理口头声称通过。

## 里程碑验收矩阵

| 里程碑 | 必须通过的门槛 |
|---|---|
| 1 | v4 类型、Store、无损迁移、备份与原子失败恢复 |
| 2 | 人设共享服务、历史来源、真实流式去 AI 味、固定评估集 |
| 3 | persona API、account 兼容 409、Studio 事务、持久完成态幂等 |
| 4 | 客户端契约、SSE 跨 chunk、统一作用域、账号即时刷新 |
| 5 | 知识库/爆款/人设配置按 UI 参考稿落地 |
| 6 | 创作台流式与滚动、全量测试、浏览器证据、工作区保护 |

## GSTACK REVIEW REPORT

### Review scope

- Target: 本计划文件
- Spec: `docs/superpowers/specs/2026-08-22-persona-owned-content-architecture-design.md`
- UI reference: `docs/superpowers/ui/2026-08-22-persona-owned-content-ui-reference.html`
- Decision: 用户批准保留完整范围，把原 24 个严格串行任务重组为 6 个里程碑、12 个实现 Task。

### Resolved findings

1. **[P1] 待归属载荷可能破坏领域完整性**：由 `Record<string, unknown>` 改为完整可辨识联合，并要求验证成功后才移除 pending。
2. **[P1] 类型任务门槛矛盾**：类型与 Store 组成同一可通过交付单元，禁止提交破损中间状态。
3. **[P1] 去 AI 味接口不支持真实流式**：改为 `naturalizeStream(..., onDelta)`。
4. **[P1] requestId 内存集合无界且重启失效**：完成态 requestId 落消息历史，内存只追踪正在执行请求并在 `finally` 清理。
5. **[P1] 用户文件验收不可能满足**：由“状态为空”改为前后摘要一致且不得暂存。
6. **[P2] UI 缺少视觉契约**：新增正式 HTML 参考，并写入 Task 9–11。
7. **[P2] LLM 行为缺少评估**：新增固定评估集和 `pnpm eval:quality`，缺少凭证必须披露未运行。
8. **[P2] 24 个子代理过度碎片化**：改为 12 个可独立审查 Task，归入 6 个端到端里程碑。

### Architecture verdict

通过。账号、人设资产、来源快照与历史指标边界明确；迁移失败路径、显式转移和删除保护有可测试契约。

### Code quality verdict

通过计划门槛。新服务职责集中；作用域解析、SSE、Store 和 UI 状态各有单一来源。执行时不得扩大为无关重构。

### Test strategy verdict

通过。覆盖单元、路由、客户端跨 chunk、React 交互、迁移故障注入、真实模型评估和浏览器验收。

### Performance verdict

通过并带监控点。排序和违禁词扫描为线性操作；若单人设资产超过 5,000 条，交付报告记录列表渲染与 Store 全量扫描耗时，再决定是否增加索引或虚拟列表，不提前引入数据库。
