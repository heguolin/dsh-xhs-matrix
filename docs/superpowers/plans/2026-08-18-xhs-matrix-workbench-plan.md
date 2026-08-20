# 小红书矩阵工作台扩展实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有小红书矩阵插件扩展为多真实账号隔离的内容运营工作台，支持账号数据导入与采集、账号级人设和知识库权重、Apify 外部选题、矩阵专属模型创作台及人工编辑草稿。

**Architecture:** Host 端继续拥有单一版本化 JSON 存储、Loopback HTTP API、Apify 适配器、定时采集和矩阵专属模型服务；Client 端通过现有 API 客户端和独立 Tab/视图提供混合运营总览与创作台。所有新对象都以 `accountId` 关联，模型请求只接收当前账号的矩阵上下文，绝不复用 Harness 主工作区会话、文件上下文或非矩阵工具。

**Tech Stack:** TypeScript、Node.js ESM、Cordis Host/Client 双半插件、React 18、现有 Loopback WebRoute、现有 `MatrixStore` 原子 JSON 存储、Vitest/jsdom、Apify HTTP API、DeepSeek Harness 已配置的 LLM Service。

**Spec:** `docs/superpowers/specs/2026-08-18-xhs-matrix-workbench-design.md`

## Global Constraints

- 每个矩阵账号独立管理真实账号连接、人设、知识库、权重、趋势结果、草稿和创作会话。
- 后台真实数据没有可靠授权 API 时使用按账号 CSV/JSON 导入；Apify 只负责公开数据、外部趋势和爆款选题发现。
- 定时任务只更新已发布笔记指标和采集状态，不定时生成内容、不自动发布。
- 已发布笔记知识库只保存用户自己已经发布的内容；Apify 外部样本单独保存，不自动进入本地知识库。
- 黑名单 Tab、黑名单 API、黑名单工具和独立黑名单模型全部删除；禁用规则属于账号人设/选题标准，低权重笔记作为负向经验。
- 所有模型生成结果必须先成为可编辑草稿，由人工审核和发布。
- 创作台只复用 Harness 模型配置，不复用主工作区聊天、路径、文件上下文、系统提示词或 Shell/SSH 等工具。
- 创作台必须按账号隔离会话和上下文；账号 A 的人设、知识库、草稿和会话不得进入账号 B。
- 实际上下文上限以当前模型配置为准；超过上限时必须明确提示并采用可见的摘要或分批策略，不得静默截断或虚假显示百万上下文。
- API Token、账号密码、Cookie 不进入 Client、会话记录、草稿或知识库；不保存不必要的评论者个人资料。
- 每个非纯机械行为变更都要有测试；源代码改动后运行 `pnpm build`，并提交更新后的 `lib/` 构建产物。
- UI 文案、文档和代码注释默认使用中文；技术标识符、协议字段和 HTTP 原文保留英文。

---

## 文件地图

### 新增 Host 领域与服务文件

- `packages/dsh-xhs-matrix/src/metrics.ts`：指标快照、来源和采集状态的纯函数与校验。
- `packages/dsh-xhs-matrix/src/knowledge.ts`：已发布笔记知识库、权重排序和账号隔离查询。
- `packages/dsh-xhs-matrix/src/importer.ts`：CSV/JSON 后台数据导入解析、校验、去重和事务式应用。
- `packages/dsh-xhs-matrix/src/trends.ts`：外部趋势样本和推荐分的统一类型、筛选和排序。
- `packages/dsh-xhs-matrix/src/apify.ts`：Apify Actor Run/Dataset 适配器，只输出统一外部样本和采集状态。
- `packages/dsh-xhs-matrix/src/scheduler.ts`：按账号执行指标采集的调度器，生命周期绑定插件 Fiber。
- `packages/dsh-xhs-matrix/src/studio.ts`：矩阵创作会话、上下文组装、模型调用和草稿引用依据。
- `packages/dsh-xhs-matrix/src/migration.ts`：从当前 `StoreFile` version 1 移除 negatives 并迁移到新版本。

### 修改 Host 文件

- `packages/dsh-xhs-matrix/src/types.ts`：增加账号连接、采集配置、已发布笔记、指标快照、外部样本、创作会话和草稿编辑字段。
- `packages/dsh-xhs-matrix/src/store.ts`：升级存储版本，增加新实体的原子 CRUD、账号隔离查询和事务式导入。
- `packages/dsh-xhs-matrix/src/routes.ts`：增加账号连接、知识库、指标、趋势、导入、创作会话和草稿编辑路由，删除 negatives 路由。
- `packages/dsh-xhs-matrix/src/protocol.ts`：增加新 API 路径和导入/创作台协议常量。
- `packages/dsh-xhs-matrix/src/tools.ts`：删除黑名单工具，增加账号知识库/趋势/创作相关的矩阵工具，保持主动触发语义。
- `packages/dsh-xhs-matrix/src/composer.ts`：改为组装结构化人设、选题标准、权重样本和趋势摘要，并包含原创约束。
- `packages/dsh-xhs-matrix/src/index.ts`：注册新路由、工具、调度器和创作台 Host 方法；配置 Apify 与采集参数。
- `packages/dsh-xhs-matrix/src/events.ts`：扩展指标采集、草稿保存和反馈事件所需的最小 payload。
- `packages/dsh-xhs-matrix/package.json`：更新描述、必要的运行时/开发依赖和脚本说明。

### 新增 Client 文件

- `packages/dsh-xhs-matrix/src/client/panel/OverviewTab.tsx`：多账号运营总览。
- `packages/dsh-xhs-matrix/src/client/panel/KnowledgeTab.tsx`：已发布知识库、指标摘要和 0-5 权重。
- `packages/dsh-xhs-matrix/src/client/panel/StudioTab.tsx`：三栏百万上下文矩阵创作台。
- `packages/dsh-xhs-matrix/src/client/panel/AccountSettings.tsx`：真实账号连接与采集状态。
- `packages/dsh-xhs-matrix/src/client/panel/DraftEditor.tsx`：标题、正文、标签、封面提示词和局部操作编辑器。
- `packages/dsh-xhs-matrix/src/client/panel/StatusBadge.tsx`：连接、采集、数据来源和保存状态展示。
- `packages/dsh-xhs-matrix/src/client/panel/ImportDialog.tsx`：CSV/JSON 后台数据导入。
- `packages/dsh-xhs-matrix/tests/knowledge-tab.test.tsx`：知识库 UI 测试。
- `packages/dsh-xhs-matrix/tests/studio-tab.test.tsx`：创作台隔离、加载和保存草稿 UI 测试。
- `packages/dsh-xhs-matrix/tests/draft-editor.test.tsx`：草稿编辑行为测试。

### 修改 Client 文件

- `packages/dsh-xhs-matrix/src/client/api.ts`：增加新 API 方法，删除 negatives 方法。
- `packages/dsh-xhs-matrix/src/client/panel/XhsPanel.tsx`：采用混合布局，增加总览、知识库、创作台和账号设置入口，移除黑名单 Tab。
- `packages/dsh-xhs-matrix/src/client/panel/AccountsTab.tsx`：显示真实账号链接、连接状态和采集状态，保留账号档案编辑。
- `packages/dsh-xhs-matrix/src/client/panel/PersonasTab.tsx`：扩展结构化人设字段、钩子多选、自定义字段和保存反馈。
- `packages/dsh-xhs-matrix/src/client/panel/TopicsTab.tsx`：改为趋势候选、推荐理由、人工编辑和进入创作台。
- `packages/dsh-xhs-matrix/src/client/panel/DraftsTab.tsx`：接入 DraftEditor、来源依据、编辑版本和账号筛选。
- `packages/dsh-xhs-matrix/src/client/panel/NegativesTab.tsx`：删除并从构建入口移除。
- `packages/dsh-xhs-matrix/src/client/panel/panel.module.css`：实现 A 方向品牌红/暖白混合布局、三栏创作台、状态反馈和响应式规则。
- `packages/dsh-xhs-matrix/tests/accounts-tab.test.tsx`、`personas-tab.test.tsx`、`drafts-tab.test.tsx`：更新旧 UI 断言和黑名单移除后的行为。

### 文档与构建产物

- `packages/dsh-xhs-matrix/README.md`：更新功能、配置、Apify/导入边界、创作台隔离和数据安全说明。
- `packages/dsh-xhs-matrix/lib/**`：每次源代码改动后由 `pnpm build` 更新并提交。
- `docs/superpowers/specs/2026-08-18-xhs-matrix-workbench-design.md`：实现过程中只在需求变化时更新，不用它记录实现过程。

---

## Task 1: 升级存储模型并删除独立黑名单

**Files:**
- Modify: `packages/dsh-xhs-matrix/src/types.ts`
- Modify: `packages/dsh-xhs-matrix/src/store.ts`
- Create: `packages/dsh-xhs-matrix/src/migration.ts`
- Modify: `packages/dsh-xhs-matrix/src/protocol.ts`
- Test: `packages/dsh-xhs-matrix/tests/store.test.ts`
- Test: `packages/dsh-xhs-matrix/tests/migration.test.ts`

**Interfaces:**
- Produces `MATRIX_STORE_VERSION = 2`。
- Produces `PublishedNote`, `MetricSnapshot`, `AccountConnection`, `CollectionConfig`, `TrendSample`, `StudioSession`, `StudioMessage` and `DraftEvidence` types。
- Produces `MatrixStore.listPublishedNotes(accountId)`, `upsertPublishedNote(accountId, payload, id?)`, `setNoteWeight(accountId, noteId, weight)`, `appendMetricSnapshot(accountId, noteId, snapshot)`, `listMetricSnapshots(accountId, noteId)`, `listTrendSamples(accountId)`, `listStudioMessages(accountId)` and `saveStudioMessage(accountId, message)`。
- Produces `MatrixStore.importPublishedNotes(accountId, records)`，要求全部记录验证成功后一次性写入。
- Migration input is current version 1 `StoreFile`; output is version 2 with `negatives: []` removed and existing accounts/personas/topics/drafts retained。

- [ ] **Step 1: Write failing storage and migration tests**

```ts
it('migrates version 1 data without negatives into version 2', () => {
  const migrated = migrateStoreFile({ version: 1, accounts: [], personas: [], topics: [], negatives: [{ id: 'n1', keyword: 'x', reason: 'y', createdAt: '2026-01-01' }], drafts: [] })
  expect(migrated.version).toBe(2)
  expect('negatives' in migrated).toBe(false)
})

it('keeps note weights isolated by account and validates 0 through 5', () => {
  const store = new MatrixStore(tempPath())
  const a = store.upsertAccount({ name: 'A', personaId: '', enabled: true })
  const b = store.upsertAccount({ name: 'B', personaId: '', enabled: true })
  const noteA = store.upsertPublishedNote(a.id, publishedPayload('a'))
  store.upsertPublishedNote(b.id, publishedPayload('b'))
  store.setNoteWeight(a.id, noteA.id, 5)
  expect(store.listPublishedNotes(a.id)[0].weight).toBe(5)
  expect(() => store.setNoteWeight(a.id, noteA.id, 6)).toThrow('权重必须是 0-5 的整数')
  expect(() => store.listPublishedNotes(b.id).find(note => note.id === noteA.id)).not.toThrow()
})

it('appends metric snapshots without replacing prior snapshots', () => {
  const store = new MatrixStore(tempPath())
  const account = store.upsertAccount({ name: 'A', personaId: '', enabled: true })
  const note = store.upsertPublishedNote(account.id, publishedPayload('a'))
  store.appendMetricSnapshot(account.id, note.id, metricsPayload(10))
  store.appendMetricSnapshot(account.id, note.id, metricsPayload(20))
  expect(store.listMetricSnapshots(account.id, note.id).map(item => item.reads)).toEqual([10, 20])
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- store.test.ts migration.test.ts`

Expected: FAIL because the version 2 entities and migration functions do not exist.

- [ ] **Step 3: Implement version 2 types, migration, and atomic store methods**

Add the new entities to `types.ts`, make `StoreFile` version 2 without `negatives`, implement `migrateStoreFile()` in `migration.ts`, and have `MatrixStore.load()` migrate exactly version 1 before rejecting unknown versions. Every write must continue using the existing temporary-file-plus-rename path. `list*` methods must filter by the explicit `accountId`; no method may return another account's notes, snapshots, trend samples or messages.

- [ ] **Step 4: Run focused tests and the existing store suite**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- store.test.ts migration.test.ts`

Expected: PASS.

Run: `pnpm --dir packages/dsh-xhs-matrix test -- tests/store.test.ts`

Expected: PASS with old negatives assertions removed or replaced by migration assertions.

- [ ] **Step 5: Commit the storage foundation**

```bash
git add packages/dsh-xhs-matrix/src/types.ts packages/dsh-xhs-matrix/src/store.ts packages/dsh-xhs-matrix/src/migration.ts packages/dsh-xhs-matrix/src/protocol.ts packages/dsh-xhs-matrix/tests/store.test.ts packages/dsh-xhs-matrix/tests/migration.test.ts
git commit -m "feat: 扩展矩阵知识库存储模型"
```

## Task 2: 账号连接、人设配置与后台数据导入 API

**Files:**
- Modify: `packages/dsh-xhs-matrix/src/types.ts`
- Modify: `packages/dsh-xhs-matrix/src/store.ts`
- Create: `packages/dsh-xhs-matrix/src/importer.ts`
- Modify: `packages/dsh-xhs-matrix/src/routes.ts`
- Modify: `packages/dsh-xhs-matrix/src/protocol.ts`
- Test: `packages/dsh-xhs-matrix/tests/importer.test.ts`
- Test: `packages/dsh-xhs-matrix/tests/routes.test.ts`

**Interfaces:**
- Produces `MatrixStore.updateAccountConnection(accountId, payload)` and `MatrixStore.updateCollectionConfig(accountId, payload)`。
- Produces `parsePublishedNoteImport(input, format)` and `applyPublishedNoteImport(store, accountId, records)`。
- Adds `GET/PATCH /api/dsh-xhs-matrix/accounts?account=<id>` for connection and collection settings without exposing secrets。
- Adds `POST /api/dsh-xhs-matrix/accounts/import` with `{ accountId, format: 'csv'|'json', content }` and all-or-nothing response。
- Adds `GET/PATCH /api/dsh-xhs-matrix/personas?persona=<id>` for the expanded fields。

- [ ] **Step 1: Write failing import and route tests**

```ts
it('imports valid published notes and rejects the whole batch when one row is invalid', () => {
  const valid = JSON.stringify([{ title: '已发布', copy: '正文', publishedAt: '2026-08-01', sourceUrl: 'https://xhs.example/n1' }])
  expect(parsePublishedNoteImport(valid, 'json')).toHaveLength(1)
  expect(() => parsePublishedNoteImport(JSON.stringify([{ title: '' }]), 'json')).toThrow('title 必填')
})

it('patches account connection without returning credentials', async () => {
  const response = await request('/api/dsh-xhs-matrix/accounts?account=a1', 'PATCH', { connection: { profileUrl: 'https://xhs.example/u/a1', status: 'bound' }, secret: 'must-not-persist' })
  expect(response.status).toBe(200)
  expect(JSON.stringify(response.body)).not.toContain('must-not-persist')
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- importer.test.ts routes.test.ts`

Expected: FAIL because import parsing, connection fields, and routes are not implemented.

- [ ] **Step 3: Implement strict import parsing and account/persona routes**

Accept JSON arrays and a documented CSV header set. Normalize empty optional fields, reject missing title/copy/publishedAt, reject invalid dates and mismatched account IDs, deduplicate by source URL or stable note ID, and apply only after all rows pass. Store only source metadata and supported fields. Expand persona payload validation for structured text arrays and selected hook styles while keeping `prompt` required for existing callers.

- [ ] **Step 4: Run tests and verify data-source isolation**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- importer.test.ts routes.test.ts`

Expected: PASS, including loopback fencing and no secret response assertions.

- [ ] **Step 5: Commit account and import API**

```bash
git add packages/dsh-xhs-matrix/src/types.ts packages/dsh-xhs-matrix/src/store.ts packages/dsh-xhs-matrix/src/importer.ts packages/dsh-xhs-matrix/src/routes.ts packages/dsh-xhs-matrix/src/protocol.ts packages/dsh-xhs-matrix/tests/importer.test.ts packages/dsh-xhs-matrix/tests/routes.test.ts
git commit -m "feat: 增加账号连接和笔记导入接口"
```

## Task 3: 外部趋势模型与 Apify 适配器

**Files:**
- Create: `packages/dsh-xhs-matrix/src/trends.ts`
- Create: `packages/dsh-xhs-matrix/src/apify.ts`
- Modify: `packages/dsh-xhs-matrix/src/store.ts`
- Modify: `packages/dsh-xhs-matrix/src/routes.ts`
- Modify: `packages/dsh-xhs-matrix/src/protocol.ts`
- Modify: `packages/dsh-xhs-matrix/src/index.ts`
- Test: `packages/dsh-xhs-matrix/tests/trends.test.ts`
- Test: `packages/dsh-xhs-matrix/tests/apify.test.ts`

**Interfaces:**
- Produces `TrendProvider` with `search(request): Promise<NormalizedTrend[]>` and `refresh(request): Promise<CollectionResult>`。
- Produces `ApifyTrendProvider` configured with `actorId`, `apiToken`, `maxItems`, `requestTimeoutMs` and injected `fetch`.
- Produces `rankTrends(account, persona, notes, trends): RankedTrend[]` with explainable `reasons` and numeric `score`。
- Adds `POST /api/dsh-xhs-matrix/trends/collect` and `GET /api/dsh-xhs-matrix/trends?account=<id>`。

- [ ] **Step 1: Write failing normalization and ranking tests**

```ts
it('normalizes only supported public fields from an Apify item', () => {
  const item = normalizeApifyItem({ title: '标题', url: 'https://xhs.example/n1', likes: 120, comments: 9, authorPhone: 'discard' })
  expect(item.title).toBe('标题')
  expect(item.likes).toBe(120)
  expect(JSON.stringify(item)).not.toContain('authorPhone')
})

it('ranks matching high-signal topics with reasons and excludes zero-weight local directions', () => {
  const ranked = rankTrends(accountFixture(), personaFixture(), [weightedNote(0, '泛鸡汤')], [trendFixture('AI 工具实测')])
  expect(ranked[0].score).toBeGreaterThan(0)
  expect(ranked[0].reasons.join('')).toContain('人设')
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- trends.test.ts apify.test.ts`

Expected: FAIL because the provider, normalization, and ranking functions do not exist.

- [ ] **Step 3: Implement the provider-neutral contract and Apify client**

Submit Actor Run using the configured Actor ID and token in Host only, poll until terminal state with bounded retries, read the default Dataset, normalize public fields, and return a failure result without deleting prior samples. Use injected `fetch` so tests never call the network. Store `source: 'apify'`, Actor ID, collection timestamps and status. Add configurable max items, timeout, retry count and budget fields; do not hardcode deployment tunables in the plugin.

- [ ] **Step 4: Implement explainable ranking and routes**

Calculate score from persona relevance, topic relevance, public engagement, freshness, similarity to high-weight local notes and duplicate risk. Add explicit reasons for every positive or negative factor. A zero-weight local note is a negative sample for ranking, not a global blacklist. Routes must be account-scoped and return previous samples when the latest collection fails.

- [ ] **Step 5: Run tests and commit the adapter**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- trends.test.ts apify.test.ts`

Expected: PASS.

```bash
git add packages/dsh-xhs-matrix/src/trends.ts packages/dsh-xhs-matrix/src/apify.ts packages/dsh-xhs-matrix/src/store.ts packages/dsh-xhs-matrix/src/routes.ts packages/dsh-xhs-matrix/src/protocol.ts packages/dsh-xhs-matrix/src/index.ts packages/dsh-xhs-matrix/tests/trends.test.ts packages/dsh-xhs-matrix/tests/apify.test.ts
git commit -m "feat: 接入 Apify 外部趋势适配器"
```

## Task 4: 指标快照与账号级采集调度

**Files:**
- Create: `packages/dsh-xhs-matrix/src/metrics.ts`
- Create: `packages/dsh-xhs-matrix/src/scheduler.ts`
- Modify: `packages/dsh-xhs-matrix/src/store.ts`
- Modify: `packages/dsh-xhs-matrix/src/routes.ts`
- Modify: `packages/dsh-xhs-matrix/src/index.ts`
- Modify: `packages/dsh-xhs-matrix/src/events.ts`
- Test: `packages/dsh-xhs-matrix/tests/metrics.test.ts`
- Test: `packages/dsh-xhs-matrix/tests/scheduler.test.ts`

**Interfaces:**
- Produces `appendMetricSnapshot()` validation for reads, likes, comments and optional shares.
- Produces `CollectionScheduler.start()`, `stop()` and `runAccount(accountId)`; all timers/disposers belong to the plugin Fiber.
- Adds `POST /api/dsh-xhs-matrix/metrics/collect` and `GET /api/dsh-xhs-matrix/metrics?account=<id>&note=<id>`。
- Adds collection status fields: `running`, `success`, `failed`, `lastSuccessAt`, `lastError`。

- [ ] **Step 1: Write failing snapshot and scheduler tests**

```ts
it('rejects negative and non-finite metrics', () => {
  expect(() => validateMetricSnapshot({ reads: -1, likes: 0, comments: 0, collectedAt: '2026-08-01', source: 'import' })).toThrow()
  expect(() => validateMetricSnapshot({ reads: Number.NaN, likes: 0, comments: 0, collectedAt: '2026-08-01', source: 'import' })).toThrow()
})

it('records a failed collection without deleting the prior successful snapshot', async () => {
  const scheduler = new CollectionScheduler({ provider: failingProvider(), store, now: fixedNow })
  await scheduler.runAccount('a1')
  expect(store.getCollectionStatus('a1').status).toBe('failed')
  expect(store.listMetricSnapshots('a1', 'n1')).toHaveLength(1)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- metrics.test.ts scheduler.test.ts`

Expected: FAIL because snapshot validation and scheduler do not exist.

- [ ] **Step 3: Implement snapshot validation and append-only persistence**

Validate finite non-negative metric numbers and ISO collection timestamps. Store every successful collection as a new snapshot with source and collected time. Never mutate the manual weight during collection. Match imported/collected records by stable note ID, source URL or account-scoped URL key.

- [ ] **Step 4: Implement lifecycle-safe scheduling**

Create one scheduler per plugin run. Use the configured interval and per-account enable flag. `runAccount()` updates status before and after provider work, catches provider errors into `lastError`, retains old snapshots, and never invokes generation or publishing. Register timer cleanup through `ctx.effect()` or the scheduler disposer; stop/update/undefine must cancel pending work.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- metrics.test.ts scheduler.test.ts`

Expected: PASS.

```bash
git add packages/dsh-xhs-matrix/src/metrics.ts packages/dsh-xhs-matrix/src/scheduler.ts packages/dsh-xhs-matrix/src/store.ts packages/dsh-xhs-matrix/src/routes.ts packages/dsh-xhs-matrix/src/index.ts packages/dsh-xhs-matrix/src/events.ts packages/dsh-xhs-matrix/tests/metrics.test.ts packages/dsh-xhs-matrix/tests/scheduler.test.ts
git commit -m "feat: 增加账号指标快照采集"
```

## Task 5: 矩阵专属创作会话与模型调用

**Files:**
- Create: `packages/dsh-xhs-matrix/src/studio.ts`
- Modify: `packages/dsh-xhs-matrix/src/composer.ts`
- Modify: `packages/dsh-xhs-matrix/src/store.ts`
- Modify: `packages/dsh-xhs-matrix/src/routes.ts`
- Modify: `packages/dsh-xhs-matrix/src/protocol.ts`
- Modify: `packages/dsh-xhs-matrix/src/index.ts`
- Modify: `packages/dsh-xhs-matrix/package.json`
- Test: `packages/dsh-xhs-matrix/tests/studio.test.ts`
- Test: `packages/dsh-xhs-matrix/tests/composer.test.ts`

**Interfaces:**
- Produces `buildStudioContext(accountId, request)` returning only owned JSON context and `contextUsage` metadata。
- Produces `StudioService.send(accountId, input)` returning `{ message, evidence, usage, truncated: false|true }`。
- Produces `StudioService.saveDraft(accountId, draftInput)` and `listMessages(accountId)`。
- Adds `GET/POST /api/dsh-xhs-matrix/studio/messages?account=<id>` and `POST /api/dsh-xhs-matrix/studio/generate`。
- Adds `PATCH /api/dsh-xhs-matrix/drafts?draft=<id>` for editable title/copy/tags/cover prompt and evidence。

- [ ] **Step 1: Write failing isolation and context-limit tests**

```ts
it('builds context from only the selected account', () => {
  const context = buildStudioContext('a1', { prompt: '写一篇', mode: 'creative' })
  expect(JSON.stringify(context)).toContain('a1 的人设')
  expect(JSON.stringify(context)).not.toContain('b1 的人设')
  expect(JSON.stringify(context)).not.toContain('/workspace')
})

it('reports a visible limit result instead of silently truncating', () => {
  const result = buildStudioContext('a1', { prompt: '写一篇', mode: 'full' }, { maxInputTokens: 10 })
  expect(result.truncated).toBe(true)
  expect(result.warning).toContain('上下文')
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- studio.test.ts composer.test.ts`

Expected: FAIL because the studio service and structured composer do not exist.

- [ ] **Step 3: Implement structured prompt assembly and evidence**

Assemble only current account persona, selection criteria, relevant local notes with weights and metric summaries, zero-weight negative examples, external trend summaries, current draft and account-scoped messages. Include explicit original-content and matrix-only instructions. Return evidence IDs and reasons with the model response. Never serialize live Services or whole store objects.

- [ ] **Step 4: Connect to the configured Harness model Service**

Inspect the actual `dsh-llm` Service contract before coding. Use the existing Host injection pattern and the configured model route; do not create a second API-key setting. Restrict the studio request to the text-generation method and matrix-owned data. If the configured model reports a lower context limit, return visible usage/warning metadata. Store only user/model messages, model configuration identifier, evidence IDs and timestamps; never store credentials.

- [ ] **Step 5: Implement draft editing and studio routes**

Generation must not save a draft automatically. Explicit save creates or updates a draft for the selected account, preserves evidence, and returns the saved draft. All routes require a valid account and account-owned draft/message IDs. Add tests proving cross-account IDs are rejected.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- studio.test.ts composer.test.ts`

Expected: PASS.

```bash
git add packages/dsh-xhs-matrix/src/studio.ts packages/dsh-xhs-matrix/src/composer.ts packages/dsh-xhs-matrix/src/store.ts packages/dsh-xhs-matrix/src/routes.ts packages/dsh-xhs-matrix/src/protocol.ts packages/dsh-xhs-matrix/src/index.ts packages/dsh-xhs-matrix/package.json packages/dsh-xhs-matrix/tests/studio.test.ts packages/dsh-xhs-matrix/tests/composer.test.ts
git commit -m "feat: 增加矩阵专属创作会话"
```

## Task 6: Client API、账号/人设/知识库/趋势页面

**Files:**
- Modify: `packages/dsh-xhs-matrix/src/client/api.ts`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/XhsPanel.tsx`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/AccountsTab.tsx`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/PersonasTab.tsx`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/TopicsTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/OverviewTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/KnowledgeTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/AccountSettings.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/ImportDialog.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/StatusBadge.tsx`
- Delete: `packages/dsh-xhs-matrix/src/client/panel/NegativesTab.tsx`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/panel.module.css`
- Test: `packages/dsh-xhs-matrix/tests/accounts-tab.test.tsx`
- Test: `packages/dsh-xhs-matrix/tests/personas-tab.test.tsx`
- Test: `packages/dsh-xhs-matrix/tests/knowledge-tab.test.tsx`

**Interfaces:**
- `XhsApi` exposes account connection, import, notes, metrics, trends and persona update methods matching Tasks 1-4。
- `XhsPanel` tab IDs become `overview | accounts | personas | knowledge | topics | drafts | studio`。
- `KnowledgeTab` receives `{ api, accountId }` and emits `onOpenStudio(noteId?)`。
- `StatusBadge` receives `{ status, source? }` and renders a Chinese accessible label。

- [ ] **Step 1: Write failing component tests**

```tsx
it('shows account connection state and does not expose credentials', async () => {
  render(<AccountsTab api={fakeApi({ connectionStatus: 'bound' })} />)
  await waitFor(() => expect(screen.getByText('已绑定')).toBeTruthy())
  expect(screen.queryByText('API Token')).toBeNull()
})

it('updates a note weight and announces that recommendations will change', async () => {
  render(<KnowledgeTab api={fakeApi({ notes: [noteFixture({ weight: 2 })] })} accountId="a1" />)
  await userEvent.click(screen.getByRole('button', { name: '权重 5' }))
  expect(await screen.findByText(/将影响下一次推荐/)).toBeTruthy()
})
```

- [ ] **Step 2: Run focused UI tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- accounts-tab.test.tsx personas-tab.test.tsx knowledge-tab.test.tsx`

Expected: FAIL because the new props, tabs and views do not exist.

- [ ] **Step 3: Extend the API client and account/persona views**

Add typed fetch wrappers for every new route. Keep `XhsApiError` behavior. Update account cards to show profile URL, connection status, public/import source and collection status. Expand persona fields with controlled inputs, hook multi-select, custom text, save feedback and account assignment.

- [ ] **Step 4: Build overview, knowledge and trend surfaces**

Implement the approved A-direction visual language: warm white/pale pink surfaces, `--xhs-red` actions, white content cards, compact status badges and responsive layout. Overview must show multiple accounts, metrics, high-weight notes, trend summary and draft count. Knowledge must show note title, metrics, source, latest collection status and clickable 0-5 weight. Topics must show Apify candidates, recommendation score, reasons, edit action, refresh/retry and enter-studio action.

- [ ] **Step 5: Remove blacklist UI and update existing tests**

Remove the Negatives import/tab, delete its API calls, and replace old blacklist assertions with the account-scoped persona/selection-rule behavior. Do not leave a hidden blacklist route or navigation entry in Client.

- [ ] **Step 6: Run UI tests and commit**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- accounts-tab.test.tsx personas-tab.test.tsx knowledge-tab.test.tsx`

Expected: PASS.

```bash
git add packages/dsh-xhs-matrix/src/client packages/dsh-xhs-matrix/tests/accounts-tab.test.tsx packages/dsh-xhs-matrix/tests/personas-tab.test.tsx packages/dsh-xhs-matrix/tests/knowledge-tab.test.tsx
git commit -m "feat: 增加矩阵运营管理界面"
```

## Task 7: Client 创作台与草稿编辑器

**Files:**
- Create: `packages/dsh-xhs-matrix/src/client/panel/StudioTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/DraftEditor.tsx`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/DraftsTab.tsx`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/XhsPanel.tsx`
- Modify: `packages/dsh-xhs-matrix/src/client/api.ts`
- Modify: `packages/dsh-xhs-matrix/src/client/panel/panel.module.css`
- Test: `packages/dsh-xhs-matrix/tests/studio-tab.test.tsx`
- Test: `packages/dsh-xhs-matrix/tests/draft-editor.test.tsx`
- Test: `packages/dsh-xhs-matrix/tests/drafts-tab.test.tsx`

**Interfaces:**
- `StudioTab` props: `{ api: XhsApi; accountId: string; onOpenDraft: (draftId: string) => void }`。
- `DraftEditor` props: `{ api: XhsApi; accountId: string; draft: DraftRow; onSaved: () => void }`。
- `StudioTab` keeps messages per account, renders usage/warning, sends prompts, refreshes trends and passes evidence into save-draft。
- `DraftEditor` updates title/copy/tags/cover prompt and performs explicit save only。

- [ ] **Step 1: Write failing isolation and editor tests**

```tsx
it('switches studio context by account and never renders another account message', async () => {
  const api = fakeApi({ messages: { a1: [message('a1')], b1: [message('b1')] } })
  render(<StudioTab api={api} accountId="a1" onOpenDraft={vi.fn()} />)
  expect(await screen.findByText('a1')).toBeTruthy()
  expect(screen.queryByText('b1')).toBeNull()
})

it('requires explicit save and preserves edited copy', async () => {
  const onSaved = vi.fn()
  render(<DraftEditor api={fakeApi()} accountId="a1" draft={draftFixture()} onSaved={onSaved} />)
  await userEvent.clear(screen.getByLabelText('正文'))
  await userEvent.type(screen.getByLabelText('正文'), '人工编辑后的正文')
  expect(api.updateDraft).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  expect(api.updateDraft).toHaveBeenCalledWith(expect.objectContaining({ copy: '人工编辑后的正文' }))
})
```

- [ ] **Step 2: Run focused UI tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- studio-tab.test.tsx draft-editor.test.tsx drafts-tab.test.tsx`

Expected: FAIL because StudioTab, DraftEditor and the new API methods do not exist.

- [ ] **Step 3: Implement the three-column studio**

Build the approved layout: left account/module rail, central conversation area, right current-account context and evidence. Display “仅矩阵内容”, actual model context usage, million-context capability only when reported by Host, and visible warning when truncated or summarized. Add prompt composer, sending/loading/error states, retry, trend refresh and “打开草稿编辑”.

- [ ] **Step 4: Implement direct draft editing**

Render title, body, tags and cover prompt as controlled fields. Add local actions for rewrite title, optimize opening and tone adjustment through the studio service; never auto-save their result. Show source evidence and originality reminder. Save only on explicit button click and keep status as generated/draft until human marks published.

- [ ] **Step 5: Integrate account selection and drafts**

Make the selected account the single source for all StudioTab, KnowledgeTab and DraftsTab queries. Add account filter and draft evidence display. Preserve existing publish/dropped status behavior while extending metrics fields and source display.

- [ ] **Step 6: Run UI tests and commit**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- studio-tab.test.tsx draft-editor.test.tsx drafts-tab.test.tsx`

Expected: PASS.

```bash
git add packages/dsh-xhs-matrix/src/client/panel/StudioTab.tsx packages/dsh-xhs-matrix/src/client/panel/DraftEditor.tsx packages/dsh-xhs-matrix/src/client/panel/DraftsTab.tsx packages/dsh-xhs-matrix/src/client/panel/XhsPanel.tsx packages/dsh-xhs-matrix/src/client/api.ts packages/dsh-xhs-matrix/src/client/panel/panel.module.css packages/dsh-xhs-matrix/tests/studio-tab.test.tsx packages/dsh-xhs-matrix/tests/draft-editor.test.tsx packages/dsh-xhs-matrix/tests/drafts-tab.test.tsx
git commit -m "feat: 增加矩阵百万上下文创作台"
```

## Task 8: 完成插件装配、文档、构建产物和回归验证

**Files:**
- Modify: `packages/dsh-xhs-matrix/src/index.ts`
- Modify: `packages/dsh-xhs-matrix/src/tools.ts`
- Modify: `packages/dsh-xhs-matrix/src/events.ts`
- Modify: `packages/dsh-xhs-matrix/src/composer.ts`
- Modify: `packages/dsh-xhs-matrix/package.json`
- Modify: `packages/dsh-xhs-matrix/README.md`
- Modify: `packages/dsh-xhs-matrix/cordis.patch.yml` only if new Client dependencies require it
- Generate: `packages/dsh-xhs-matrix/lib/**`
- Test: `packages/dsh-xhs-matrix/tests/tools.test.ts`
- Test: existing package test suite

**Interfaces:**
- Plugin activation registers all new routes/tools/scheduler effects and disposes them on stop/update.
- Tool set contains no `xhs_negative_add` or negative query tool; active tools expose account-scoped notes, trends, collection status and draft actions.
- README documents Apify configuration, public-vs-backend data limits, import format, context isolation and no-auto-publish behavior.

- [ ] **Step 1: Write failing tool and lifecycle tests**

```ts
it('does not register blacklist tools and keeps trend tools account-scoped', () => {
  const names = makeTools(deps).map(tool => tool.name)
  expect(names).not.toContain('xhs_negative_add')
  expect(names).toContain('xhs_trends')
})

it('disposes scheduler and routes when the plugin Fiber stops', async () => {
  const run = await activatePlugin()
  await run.stop()
  expect(scheduler.active).toBe(false)
  expect(webServer.hasRoute('/api/dsh-xhs-matrix/trends')).toBe(false)
})
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir packages/dsh-xhs-matrix test -- tools.test.ts`

Expected: FAIL because the old tool set and assembly do not yet match the expanded plugin.

- [ ] **Step 3: Update tools, plugin composition and configuration**

Remove negatives tools and their data access. Add concise account-scoped tools for published notes, trends, collection status and studio draft operations. Add validated Config fields for Apify Actor ID/token reference, max items, timeout, retry count, budget and account collection interval. Register all effects through existing `ctx.effect()` patterns and do not add a timer without a disposer.

- [ ] **Step 4: Update docs and remove obsolete references**

Update package description and README to describe the actual workflow, Apify as public-data adapter, manual backend import, account isolation, matrix-only studio context and manual publishing. Remove blacklist instructions and old “today generation” wording where it conflicts with on-demand generation. Keep all docs in Chinese.

- [ ] **Step 5: Build committed artifacts and run package checks**

Run:

```bash
pnpm --dir packages/dsh-xhs-matrix test
pnpm --dir packages/dsh-xhs-matrix typecheck
pnpm --dir packages/dsh-xhs-matrix build
```

Expected: all tests pass, typecheck exits 0, and `lib/` contains updated Host/Client bundles and declarations.

- [ ] **Step 6: Inspect the final diff and commit**

Run:

```bash
git diff --check
git status --short
git diff --stat HEAD~1
```

Confirm no credentials, `.superpowers/` files, raw Apify responses or unrelated workspace files are staged. Then commit:

```bash
git add packages/dsh-xhs-matrix/src packages/dsh-xhs-matrix/tests packages/dsh-xhs-matrix/README.md packages/dsh-xhs-matrix/package.json packages/dsh-xhs-matrix/lib
git commit -m "feat: 完成矩阵工作台闭环"
```

## Verification Matrix

After Task 8, run the smallest relevant checks for each surface:

- Storage/migration: `pnpm --dir packages/dsh-xhs-matrix test -- store.test.ts migration.test.ts`
- Import/routes: `pnpm --dir packages/dsh-xhs-matrix test -- importer.test.ts routes.test.ts`
- Apify/ranking: `pnpm --dir packages/dsh-xhs-matrix test -- trends.test.ts apify.test.ts`
- Scheduling/metrics: `pnpm --dir packages/dsh-xhs-matrix test -- metrics.test.ts scheduler.test.ts`
- Studio/composer: `pnpm --dir packages/dsh-xhs-matrix test -- studio.test.ts composer.test.ts`
- Client surfaces: `pnpm --dir packages/dsh-xhs-matrix test -- '*tab.test.tsx' '*editor.test.tsx'`
- Full package regression: `pnpm --dir packages/dsh-xhs-matrix test`
- Type/build: `pnpm --dir packages/dsh-xhs-matrix typecheck && pnpm --dir packages/dsh-xhs-matrix build`

The implementation is complete only when the full package suite, typecheck, build and a refreshed DeepSeek Harness GUI smoke test confirm that the new matrix panel loads, account switching isolates data, the studio sends only matrix context, and saving a draft does not publish it.
