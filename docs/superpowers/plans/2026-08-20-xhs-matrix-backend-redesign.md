# dsh-xhs-matrix 后端重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按领域拆分后端（爆款池替代选题池、采集层独立、store 领域分区、路由拆文件、创作台复用 Harness 模型、数据迁移 v3），并同步调整前端。

**Architecture:** 数据层 store 按领域分区（单 JSON 持久化，接口化预留 SQLite 迁移口）；采集层独立为 `src/collector/`（provider 接口 + Apify 适配器 + 人设排序）；路由按领域拆 `src/routes/*`；创作台 LLM 读取 `agent-default-model` 配置而非硬编码 provider；`trendSamples`/`topics` 迁移为账号级爆款池 `viralItems`。

**Tech Stack:** TypeScript、Node.js、Cordis、lightningcss/tsdown（构建）、vitest（测试）、schemastery（配置）。

**Spec:** `docs/superpowers/specs/2026-08-20-xhs-matrix-backend-redesign.md`

## Global Constraints

- 所有文档/注释/UI 文案用中文（技术标识符保持英文）。
- git 身份：`git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit ...`。
- 每次源码变更必须 `pnpm build` 重建 lib/ 并一并提交（GitHub 直装依赖预构建产物）。
- 数据文件版本升到 v3；旧 v1/v2 文件必须自动迁移。
- 爆款池按账号隔离；账号 A 的数据不得进入账号 B。
- 创作台不再硬编码 `deepseek`；模型来自 `agent-default-model` 用户设置，兜底 `ctx.llm.listProviders()`。
- Apify 配置唯一来源 `store.settings`（删除插件 Config 的 apify 字段）。
- 所有命令在 `packages/dsh-xhs-matrix` 目录执行（WSL 原生路径）。
- 测试命令：`pnpm test`（vitest run）；类型：`pnpm typecheck`；构建：`pnpm build`。

---

### Task 1: 领域类型 v3（types.ts）

**Files:**
- Modify: `src/types.ts`
- Test: `tests/types-v3.test.ts`（新建，纯类型编译期断言）

**Interfaces:**
- Produces: `ViralStatus = 'pending' | 'accepted' | 'ignored'`；`ViralItem { id, accountId, title, body, sourceUrl?, source: 'apify'|'manual'|'import', status, score, reasons: string[], publishedAt?, collectedAt }`；`Draft` 移除 `topicId`；`StoreFile.version = 3` 且字段含 `viralItems: ViralItem[]`、不含 `topics`/`trendSamples`；`MatrixSettings` 保留。

- [ ] **Step 1: 写失败测试（类型断言）**

```ts
// tests/types-v3.test.ts
import { describe, expect, it } from 'vitest'
import type { Draft, StoreFile, ViralItem } from '../src/types.ts'

describe('v3 领域类型', () => {
  it('ViralItem 含标题/正文/链接/审核状态', () => {
    const item: ViralItem = {
      id: 'v1', accountId: 'a1', title: '爆款标题', body: '正文',
      sourceUrl: 'https://x.com/1', source: 'apify', status: 'pending',
      score: 35, reasons: ['匹配人设方向'], collectedAt: '2026-08-20T00:00:00.000Z',
    }
    expect(item.status).toBe('pending')
    expect(item.sourceUrl).toContain('https')
  })
  it('Draft 不再有 topicId', () => {
    const draft: Draft = { id: 'd1', accountId: 'a1', date: '2026-08-20', copy: 'c', coverPrompt: 'p', status: 'generated', createdAt: '2026-08-20T00:00:00.000Z' }
    expect('topicId' in draft).toBe(false)
  })
  it('StoreFile v3 有 viralItems 无 topics', () => {
    const file: StoreFile = { version: 3, accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], settings: { apify: { actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 30000, maxPolls: 120 } } }
    expect(file.version).toBe(3)
    expect('topics' in file).toBe(false)
    expect('trendSamples' in file).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm typecheck`
Expected: 编译错误（`ViralItem` 不存在、`Draft.topicId` 报错等）

- [ ] **Step 3: 实现 types.ts**

在 `src/types.ts` 中：
- 删除 `Topic`、`TopicStatus`、`TrendSample`、`Draft.topicId`。
- 新增 `ViralStatus`、`ViralItem`。
- `Draft` 接口移除 `topicId`。
- `StoreFile` 改为 `version: 3`，字段：`accounts/personas/drafts/publishedNotes/metricSnapshots/viralItems/studioMessages/settings`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm typecheck && pnpm test`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/types.ts tests/types-v3.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(types): v3 领域类型（ViralItem 替代 Topic/TrendSample，Draft 去 topicId）"
```

---

### Task 2: store 爆款池领域方法（v3 数据形状）

**Files:**
- Modify: `src/store.ts`、`src/migration.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `ViralItem`/`StoreFile`/`MatrixSettings`
- Produces: `MATRIX_STORE_VERSION = 3`；`defaultMatrixSettings()`（保留）；store 方法：`listViralItems(accountId?, status?)`、`saveViralItem(payload)`、`reviewViralItem(accountId, itemId, status)`、`getSettings()`/`updateApifySettings()`（保留）；`empty()` 返回 v3 空结构。

- [ ] **Step 1: 写失败测试（追加到 tests/store.test.ts）**

```ts
it('爆款池 CRUD 与审核状态流转', () => {
  const item = store.saveViralItem({ accountId: 'a1', title: '爆款', body: '正文', sourceUrl: 'https://x.com/1', source: 'apify', score: 35, reasons: ['匹配人设方向'] })
  expect(item.status).toBe('pending')
  const accepted = store.reviewViralItem('a1', item.id, 'accepted')
  expect(accepted.status).toBe('accepted')
  expect(store.listViralItems('a1', 'accepted')).toHaveLength(1)
  expect(store.listViralItems('a1', 'pending')).toHaveLength(0)
  expect(() => store.reviewViralItem('a2', item.id, 'accepted')).toThrow(/账号/)
})
```

（前置：`beforeEach` 中先 `store.upsertAccount({ name: 'a', personaId: '', enabled: true })` 取得账号 id，账户 fixture 参照现有测试。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -t "爆款池"`
Expected: FAIL（`saveViralItem` 不存在）

- [ ] **Step 3: 实现 store.ts**

- `MATRIX_STORE_VERSION = 3`；`empty()` 返回 `{ version: 3, accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], settings: defaultMatrixSettings() }`。
- `load()` 的 v2 分支改为走 `migrateStoreFile`（见 Task 3）；v3 分支补默认 settings。
- 新增方法（放在「运行时设置」区之前）：

```ts
listViralItems(accountId?: string, status?: ViralStatus): ViralItem[] {
  let items = this.data.viralItems
  if (accountId !== undefined) items = items.filter(i => i.accountId === accountId)
  if (status !== undefined) items = items.filter(i => i.status === status)
  return items
}
saveViralItem(payload: ViralItemPayload): ViralItem {
  this.requireAccount(payload.accountId)
  const item: ViralItem = { id: nextId(), ...payload, status: payload.status ?? 'pending', collectedAt: new Date().toISOString() }
  this.data.viralItems.push(item)
  this.save()
  return item
}
reviewViralItem(accountId: string, itemId: string, status: 'accepted' | 'ignored'): ViralItem {
  this.requireAccount(accountId)
  const item = this.data.viralItems.find(i => i.id === itemId && i.accountId === accountId)
  if (item === undefined) throw new MatrixStoreError(`爆款不存在或不属于该账号：${itemId}`)
  item.status = status
  this.save()
  return item
}
```

- `ViralItemPayload` 导出：`{ accountId, title, body, sourceUrl?, source, score, reasons, publishedAt?, status? }`。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/store.ts tests/store.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(store): v3 爆款池领域方法（CRUD + 审核状态流转）"
```

---

### Task 3: 数据迁移 v2 → v3

**Files:**
- Modify: `src/migration.ts`
- Test: `tests/migration.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 类型、Task 2 `defaultMatrixSettings`
- Produces: `migrateStoreFile(file: unknown): StoreFile` 支持 v1 与 v2 输入；`trendSamples`→`viralItems`（`status:'pending'`，`body` 取 `summary`/`desc`，链接保留，score 0 + reasons `['历史趋势样本迁移']`）；`topics` 丢弃；`draft.topicId` 删除。

- [ ] **Step 1: 写失败测试**

```ts
// tests/migration.test.ts
import { describe, expect, it } from 'vitest'
import { migrateStoreFile } from '../src/migration.ts'

describe('v2 → v3 迁移', () => {
  it('trendSamples 转为爆款池 pending 条目', () => {
    const migrated = migrateStoreFile({
      version: 2,
      accounts: [{ id: 'a1', name: 'x', personaId: '', enabled: true, createdAt: '2026-08-01T00:00:00.000Z', connection: { status: 'unbound' }, collection: { enabled: false, intervalMinutes: 1440, maxItems: 100 }, collectionStatus: { running: false, lastStatus: 'idle' } }],
      personas: [], drafts: [], publishedNotes: [], metricSnapshots: [],
      trendSamples: [{ id: 't1', accountId: 'a1', title: '爆款标题', summary: '摘要正文', sourceUrl: 'https://x.com/1', source: 'apify', collectedAt: '2026-08-10T00:00:00.000Z', status: 'success' }],
      studioMessages: [],
      settings: { apify: { actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 30000, maxPolls: 120 } },
    } as never)
    expect(migrated.version).toBe(3)
    expect(migrated.viralItems).toHaveLength(1)
    expect(migrated.viralItems[0].status).toBe('pending')
    expect(migrated.viralItems[0].body).toBe('摘要正文')
    expect(migrated.viralItems[0].sourceUrl).toBe('https://x.com/1')
    expect('topics' in migrated).toBe(false)
  })
  it('draft 迁移后移除 topicId', () => {
    const migrated = migrateStoreFile({ version: 2, accounts: [], personas: [], topics: [{ id: 'tp1', title: 't', source: 'manual', status: 'open', createdAt: '2026-08-01T00:00:00.000Z' }], drafts: [{ id: 'd1', accountId: 'a1', topicId: 'tp1', date: '2026-08-20', copy: 'c', coverPrompt: 'p', status: 'generated', createdAt: '2026-08-20T00:00:00.000Z' }], publishedNotes: [], metricSnapshots: [], trendSamples: [], studioMessages: [], settings: { apify: { actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 30000, maxPolls: 120 } } } as never)
    const draft = migrated.drafts[0] as Record<string, unknown>
    expect('topicId' in draft).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/migration.test.ts`
Expected: FAIL（`migrateStoreFile` 签名不符）

- [ ] **Step 3: 实现 migration.ts**

- `migrateStoreFile(file: { version: 1 | 2; ... }): StoreFile`：
  - 先归一账号默认字段（connection/collection/collectionStatus）。
  - `viralItems = (trendSamples ?? []).map(sample => ({ id: nextId(), accountId: sample.accountId, title: sample.title, body: sample.summary ?? '', sourceUrl: sample.sourceUrl, source: sample.source === 'manual' ? 'manual' : 'apify', status: 'pending', score: 0, reasons: ['历史趋势样本迁移'], publishedAt: sample.publishedAt, collectedAt: sample.collectedAt }))`（`nextId` 在 migration 内实现或用时间戳）。
  - `drafts = (file.drafts ?? []).map(({ topicId: _topicId, ...draft }) => draft)`。
  - 丢弃 `topics`/`negatives`。
  - 返回 v3 `StoreFile`（settings 用 `defaultMatrixSettings()` 或输入 settings）。
- `store.load()` 改为：`if (file.version === 1 || file.version === 2) { this.data = migrateStoreFile(file as never); this.save(); return this.data }`；v3 分支直接解析（补默认 settings，逻辑保留 Task 2 的 v3 分支）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/migration.ts src/store.ts tests/migration.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(migration): v2→v3 迁移（trendSamples→爆款池、删 topics、draft 去 topicId）"
```

---

### Task 4: 采集层 provider 接口（src/collector/provider.ts）

**Files:**
- Create: `src/collector/provider.ts`
- Modify: `src/types.ts`（无，复用 Task 1）
- Test: `tests/collector-provider.test.ts`（接口类型断言）

**Interfaces:**
- Produces: `NormalizedViral { title, body?, sourceUrl?, source: 'apify'|'manual', publishedAt?, reads?, likes?, comments? }`；`RankedViral extends NormalizedViral { score, reasons }`；`ViralProviderRequest { accountId, query, maxItems }`；`ViralCollectionResult { items: NormalizedViral[]; status: 'success'|'failed'; error? }`；`ViralProvider { search(request): Promise<ViralCollectionResult> }`。

- [ ] **Step 1: 写测试（编译期 + normalize 函数）**

```ts
// tests/collector-provider.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeApifyItem } from '../src/collector/provider.ts'

describe('normalizeApifyItem', () => {
  it('提取正文与链接', () => {
    const item = normalizeApifyItem({ title: '爆款', desc: '正文内容', url: 'https://x.com/1' })
    expect(item.body).toBe('正文内容')
    expect(item.sourceUrl).toBe('https://x.com/1')
    expect(item.source).toBe('apify')
  })
  it('缺 title 抛错', () => {
    expect(() => normalizeApifyItem({ desc: 'x' })).toThrow(/title/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/collector-provider.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 provider.ts**

```ts
export interface NormalizedViral {
  title: string
  body?: string
  sourceUrl?: string
  source: 'apify' | 'manual'
  publishedAt?: string
  reads?: number
  likes?: number
  comments?: number
}
export interface RankedViral extends NormalizedViral { score: number; reasons: string[] }
export interface ViralProviderRequest { accountId: string; query: string; maxItems: number }
export interface ViralCollectionResult { items: NormalizedViral[]; status: 'success' | 'failed'; error?: string }
export interface ViralProvider { search(request: ViralProviderRequest): Promise<ViralCollectionResult> }

export function normalizeApifyItem(item: unknown): NormalizedViral {
  if (typeof item !== 'object' || item === null) throw new Error('Apify item 必须是对象')
  const value = item as Record<string, unknown>
  if (typeof value.title !== 'string' || value.title.trim() === '') throw new Error('Apify item 缺少 title')
  const num = (key: string): number | undefined => typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] as number : undefined
  const body = typeof value.body === 'string' ? value.body : typeof value.content === 'string' ? value.content : typeof value.desc === 'string' ? value.desc : typeof value.text === 'string' ? value.text : undefined
  const url = typeof value.url === 'string' ? value.url : typeof value.noteUrl === 'string' ? value.noteUrl : undefined
  return {
    title: value.title.trim(),
    body: body === undefined ? undefined : body.trim(),
    sourceUrl: url,
    source: 'apify',
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : undefined,
    reads: num('reads') ?? num('viewCount'), likes: num('likes') ?? num('likeCount'),
    comments: num('comments') ?? num('commentCount'),
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/collector/provider.ts tests/collector-provider.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(collector): 爆款标准化接口（正文/链接提取）"
```

---

### Task 5: Apify 适配器（src/collector/apify.ts）

**Files:**
- Create: `src/collector/apify.ts`
- Delete: `src/apify.ts`
- Test: `tests/collector-apify.test.ts`

**Interfaces:**
- Consumes: Task 4 `ViralProvider`/`ViralProviderRequest`/`ViralCollectionResult`/`normalizeApifyItem`；`ApifyConfig { actorId, apiToken, maxItems, requestTimeoutMs, maxPolls }`
- Produces: `class ApifyViralProvider implements ViralProvider`；构造函数 `(config: ApifyConfig, options?: { fetcher?: typeof fetch; sleep?: (ms) => Promise<void> })`；`search` 输入含多键搜索词（`query/searchKeyword/keyword/search/operation:'note search'/maxItems/maxResults`）。

- [ ] **Step 1: 写失败测试**

```ts
// tests/collector-apify.test.ts
import { describe, expect, it } from 'vitest'
import { ApifyViralProvider } from '../src/collector/apify.ts'

describe('ApifyViralProvider', () => {
  it('Run 输入携带多键搜索词，Dataset 结果标准化', async () => {
    let runBody: Record<string, unknown> | undefined
    const fetcher = async (url: string, init?: RequestInit) => {
      if (String(url).includes('/runs')) {
        runBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ data: { id: 'r1', defaultDatasetId: 'd1', status: 'SUCCEEDED' } }), { status: 200 })
      }
      if (String(url).includes('/datasets/')) {
        return new Response(JSON.stringify([{ title: '爆款', desc: '正文', url: 'https://x.com/1' }]), { status: 200 })
      }
      return new Response(JSON.stringify({ data: { status: 'SUCCEEDED' } }), { status: 200 })
    }
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'tok', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'AI 工具', maxItems: 5 })
    expect(result.status).toBe('success')
    expect(runBody?.searchKeyword).toBe('AI 工具')
    expect(runBody?.operation).toBe('note search')
    expect(result.items[0]?.body).toBe('正文')
  })
  it('Run 401 返回失败', async () => {
    const fetcher = async () => new Response('', { status: 401 })
    const provider = new ApifyViralProvider({ actorId: 'o/a', apiToken: 'bad', maxItems: 10, requestTimeoutMs: 5000, maxPolls: 2 }, { fetcher: fetcher as typeof fetch, sleep: async () => {} })
    const result = await provider.search({ accountId: 'a1', query: 'q', maxItems: 5 })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('401')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/collector-apify.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 apify.ts**

将 `src/apify.ts` 的 `ApifyTrendProvider` 迁移为 `src/collector/apify.ts` 的 `ApifyViralProvider`：
- `search(request)`：Run POST body 为 `{ query, searchKeyword, keyword, search, operation: 'note search', maxItems, maxResults }`；轮询状态；Dataset 读取后 `normalizeApifyItem`；错误消息保留（`Apify Run HTTP ${status}` 等）。
- `src/apify.ts` 删除。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 通过（确认无残留 `src/apify.ts` 引用）

- [ ] **Step 5: 提交**

```bash
git add src/collector/apify.ts tests/collector-apify.test.ts && git rm src/apify.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(collector): Apify 爆款适配器（多键搜索词/正文/链接/401错误）"
```

---

### Task 6: 人设相关性排序（src/collector/rank.ts）

**Files:**
- Create: `src/collector/rank.ts`
- Delete: `src/trends.ts`
- Test: `tests/collector-rank.test.ts`

**Interfaces:**
- Consumes: Task 4 `RankedViral`/`NormalizedViral`
- Produces: `rankViralItems(account: Account, persona: Persona, notes: PublishedNote[], items: NormalizedViral[]): RankedViral[]`——人设名+定位+领域+内容方向+选题标准+钩子风格进词表；命中 +35「匹配人设方向」；权重≥4 笔记相近 +30；互动 >0 加 `Math.min(25, Math.log10(engagement+1)*8)`；7 天内 +10；降序。

- [ ] **Step 1: 写失败测试**

```ts
// tests/collector-rank.test.ts
import { describe, expect, it } from 'vitest'
import { rankViralItems } from '../src/collector/rank.ts'
import type { Account, Persona, PublishedNote } from '../src/types.ts'

const account: Account = { id: 'a1', name: 'AI研究所', personaId: 'p1', enabled: true, createdAt: '2026-08-01T00:00:00.000Z', connection: { status: 'unbound' }, collection: { enabled: false, intervalMinutes: 1440, maxItems: 100 }, collectionStatus: { running: false, lastStatus: 'idle' } }
const persona: Persona = { id: 'p1', name: 'AI大模型应用开发工程师', prompt: '', expertise: 'AI工具、大模型应用', createdAt: '2026-08-01T00:00:00.000Z' }

describe('rankViralItems', () => {
  it('符合人设的爆款得分高于无关内容', () => {
    const ranked = rankViralItems(account, persona, [], [
      { title: '大模型应用实战指南', body: 'AI', source: 'apify' },
      { title: '露营帐篷推荐', body: '户外', source: 'apify' },
    ])
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
    expect(ranked[0].reasons).toContain('匹配AI研究所的人设方向')
  })
  it('高权重笔记相近内容加分', () => {
    const notes: PublishedNote[] = [{ id: 'n1', accountId: 'a1', title: 'AI 提效工具实测', copy: '', publishedAt: '2026-08-01', source: 'import', weight: 5, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }]
    const ranked = rankViralItems(account, persona, notes, [{ title: 'AI 提效工具实测同款', body: '', source: 'apify' }])
    expect(ranked[0].score).toBeGreaterThanOrEqual(65)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/collector-rank.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 rank.ts**

```ts
import type { Account, Persona, PublishedNote } from '../types.ts'
import type { NormalizedViral, RankedViral } from './provider.ts'

export function rankViralItems(account: Account, persona: Persona, notes: PublishedNote[], items: NormalizedViral[]): RankedViral[] {
  const terms = [persona.name, persona.positioning, persona.expertise, persona.contentDirections, persona.topicCriteria, persona.hookStyles?.join(' ')]
    .filter((item): item is string => Boolean(item)).join(' ').toLowerCase()
  return items.map(item => {
    const haystack = `${item.title} ${item.body ?? ''}`.toLowerCase()
    const reasons: string[] = []
    let score = 0
    if (terms !== '' && terms.split(/[,，、\s]+/).some(term => term.length > 1 && haystack.includes(term))) { score += 35; reasons.push(`匹配${account.name}的人设方向`) }
    const highWeight = notes.some(note => note.accountId === account.id && note.weight >= 4 && (haystack.includes(note.title.toLowerCase()) || (note.topic !== undefined && haystack.includes(note.topic.toLowerCase()))))
    if (highWeight) { score += 30; reasons.push('与账号高权重历史内容相近') }
    const engagement = (item.likes ?? 0) + (item.comments ?? 0)
    if (engagement > 0) { score += Math.min(25, Math.log10(engagement + 1) * 8); reasons.push('存在公开互动信号') }
    if (item.publishedAt !== undefined && Date.now() - Date.parse(item.publishedAt) < 7 * 86400000) { score += 10; reasons.push('近期趋势') }
    return { ...item, score: Math.round(score), reasons }
  }).sort((a, b) => b.score - a.score)
}
```

- 删除 `src/trends.ts`；全局搜索并清理 `trends.ts` 引用（`src/metrics.ts`、`src/routes.ts` 后续 Task 处理）。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 通过（如 metrics/routes 报错属预期，后续任务修复；本任务可先更新 `src/metrics.ts` 的 `TrendProvider` import 为 `ViralProvider` 并改用 `src/collector/provider.ts`）

- [ ] **Step 5: 提交**

```bash
git add src/collector/rank.ts tests/collector-rank.test.ts src/metrics.ts && git rm src/trends.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(collector): 人设相关性排序（rankViralItems 替代 rankTrends）"
```

---

### Task 7: 创作台模型解析（src/model-config.ts）

**Files:**
- Create: `src/model-config.ts`
- Test: `tests/model-config.test.ts`

**Interfaces:**
- Consumes: `@deepseek-ai/dsh-settings` 的 `SettingsService.get(namespace)`；`@deepseek-ai/dsh-llm` 的 `LlmRuntime.listProviders()`
- Produces: `ModelRoute { provider: string; model: string }`；`resolveStudioModel(getDefaultModel: () => ModelRoute | undefined, listProviders: () => Array<{ id: string }>): ModelRoute`——优先读 `agent-default-model`，缺 model 时抛错；未配置时用 `listProviders()[0].id` + 空 model 也抛错；两者皆无返回 `undefined`。

- [ ] **Step 1: 写失败测试**

```ts
// tests/model-config.test.ts
import { describe, expect, it } from 'vitest'
import { resolveStudioModel } from '../src/model-config.ts'

describe('resolveStudioModel', () => {
  it('优先用 agent-default-model', () => {
    const route = resolveStudioModel(() => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }), () => [{ id: 'other' }])
    expect(route).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })
  it('默认缺失时用第一个注册 provider 并报缺 model', () => {
    expect(() => resolveStudioModel(() => undefined, () => [{ id: 'openai-compatible' }])).toThrow(/model/)
  })
  it('两者皆无返回 undefined', () => {
    expect(resolveStudioModel(() => undefined, () => [])).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test tests/model-config.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 model-config.ts**

```ts
export interface ModelRoute { provider: string; model: string }

export function resolveStudioModel(
  getDefaultModel: () => ModelRoute | undefined,
  listProviders: () => Array<{ id: string }>,
): ModelRoute | undefined {
  const configured = getDefaultModel()
  if (configured !== undefined && configured.provider !== '' && configured.model !== '') return configured
  const providers = listProviders()
  if (providers.length === 0) return undefined
  throw new Error('未配置默认模型：请在 Harness 设置 agent-default-model 的 provider 与 model')
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/model-config.ts tests/model-config.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(model-config): 创作台模型解析（agent-default-model 优先）"
```

---

### Task 8: 路由拆分——账号/人设/知识库/设置（src/routes/*）

**Files:**
- Create: `src/routes/accounts.ts`、`src/routes/personas.ts`、`src/routes/knowledge.ts`、`src/routes/settings.ts`、`src/routes/index.ts`
- Modify: `src/routes.ts`（删除；拆分后移除）
- Test: `tests/routes.test.ts`（更新）

**Interfaces:**
- Consumes: `MatrixStore`；`XHS_API` 路径；`isLoopbackRequest`/`writeJson`/`readJsonBody`/`queryParam`（从 `src/routes.ts` 迁移到 `src/routes/shared.ts`）
- Produces: 各文件导出 `makeAccountsRoutes(store)`、`makePersonasRoutes(store)`、`makeKnowledgeRoutes(store)`、`makeSettingsRoutes(store, reload?)`，返回 `WebRoute[]`；`routes/index.ts` 导出 `makeRoutes(deps)` 汇总全部。

- [ ] **Step 1: 建共享工具并迁移现有 handler**

创建 `src/routes/shared.ts`（`writeJson`/`readJsonBody`/`queryParam`/`guard`/`fail`，从旧 `src/routes.ts` 原样搬入）。

- [ ] **Step 2: 拆出 accounts/personas/knowledge/settings 路由文件**

- `accounts.ts`：账号 GET/POST/PATCH/DELETE + `accountImport`（逻辑从旧 routes.ts 账号段搬入）。
- `personas.ts`：人设 CRUD（搬入）。
- `knowledge.ts`：`notes` GET/PATCH（权重）+ `metrics` GET/POST + `metrics/collect`（搬入；`metrics/collect` 依赖 `scheduler`，签名 `makeKnowledgeRoutes(store, scheduler?)`）。
- `settings.ts`：`settingsApify` GET/PATCH（搬入，`makeSettingsRoutes(store, reload?)`）。

- [ ] **Step 3: 更新 tests/routes.test.ts 指向新 makeRoutes**

`tests/routes.test.ts` 顶部 `import { makeRoutes } from '../src/routes.ts'` 改为 `import { makeRoutes } from '../src/routes/index.ts'`；`beforeEach` 不变。现有断言（账号 CRUD、选题批量导入、草稿回填、settings）保留；**删除**「批量导入选题」相关断言（选题池移除），补「爆款采集/审核」断言（见 Task 9 完成后一并更新——本任务先删选题断言）。

- [ ] **Step 4: 运行确认**

Run: `pnpm test && pnpm typecheck`
Expected: 通过（草稿/studio/trends 相关路由尚未迁移，`src/routes/index.ts` 本任务先只装配已拆分的四组 + 占位后续任务，保证编译通过）

- [ ] **Step 5: 提交**

```bash
git add src/routes/ && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "refactor(routes): 账号/人设/知识库/设置路由拆分为独立文件"
```

---

### Task 9: 爆款池路由（src/routes/viral.ts）

**Files:**
- Create: `src/routes/viral.ts`
- Modify: `src/routes/index.ts`、`src/protocol.ts`
- Test: `tests/routes.test.ts`

**Interfaces:**
- Consumes: Task 2 store 爆款方法、Task 6 `rankViralItems`、Task 5 `ViralProvider`
- Produces: `makeViralRoutes(store, provider?)`：`GET /viral?account=`（列表，可带 `status`）；`POST /viral`（`{ accountId, query?, maxItems? }` 触发采集 → rank → 批量 `saveViralItem`(pending) → 返回入库条目）；`PATCH /viral?account=&item=`（`{ status: 'accepted'|'ignored' }` 审核）。
- `src/protocol.ts`：新增 `viral: XHS_API_BASE + '/viral'`；删除 `topics`、`trends` 路径。

- [ ] **Step 1: 写失败测试（追加 tests/routes.test.ts）**

```ts
it('爆款采集入库 pending 并可审核', async () => {
  const provider = {
    search: async () => ({ status: 'success' as const, items: [{ title: '大模型应用实战', body: '正文', sourceUrl: 'https://x.com/1', source: 'apify' as const }] }),
  }
  // 需要 makeRoutes 支持注入 provider——路由测试 server 构造处改用 makeRoutes({ store, viralProvider: provider })
  const created = await json('/api/dsh-xhs-matrix/viral', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId: 'a1', query: 'AI 工具', maxItems: 5 }),
  })
  expect(created.status).toBe(201)
  const item = (created.body as { items: Array<{ id: string; status: string }> }).items[0]
  expect(item.status).toBe('pending')
  const reviewed = await json(`/api/dsh-xhs-matrix/viral?account=a1&item=${item.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'accepted' }),
  })
  expect(reviewed.status).toBe(200)
  const list = await json('/api/dsh-xhs-matrix/viral?account=a1')
  expect((list.body as { items: Array<{ status: string }> }).items[0].status).toBe('accepted')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test -t "爆款采集"`
Expected: FAIL（路由不存在）

- [ ] **Step 3: 实现 viral.ts 并接线**

```ts
export function makeViralRoutes(store: MatrixStore, provider?: ViralProvider): WebRoute[] {
  // GET 列表：?account= 必填，可选 status=pending|accepted|ignored
  // POST 采集：accountId 必填；query 缺省用该账号人设（topicCriteria/expertise/contentDirections/name）；
  //   provider 未配置返回 400「未配置趋势数据源」；采集失败 502；成功 rank 后批量 saveViralItem(pending)，返回 { items }
  // PATCH 审核：account+item 必填，status 限 accepted|ignored → store.reviewViralItem
}
```

`src/routes/index.ts` 的 `RoutesDeps` 增加 `viralProvider?: ViralProvider`，装配 `makeViralRoutes`；删除旧的 trends/topics 路由注册。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/routes/viral.ts src/routes/index.ts src/protocol.ts tests/routes.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(routes): 爆款池采集/列表/审核路由（选题池与趋势路由移除）"
```

---

### Task 10: 草稿/创作台路由（src/routes/drafts.ts、studio.ts）

**Files:**
- Create: `src/routes/drafts.ts`、`src/routes/studio.ts`
- Modify: `src/routes/index.ts`
- Test: `tests/routes.test.ts`

**Interfaces:**
- Consumes: Task 7 `resolveStudioModel`；store 草稿/创作方法；`StudioService`
- Produces: `makeDraftsRoutes(store)`（drafts GET/POST/PATCH + drafts/status，**去掉 topicId 必填校验**）；`makeStudioRoutes(store, studio?)`（studioMessages GET/POST、studio/draft POST——draft 保存不再要求 topicId，改为可选 `topicId` 兼容，无则跳过 `markTopicUsed`）。
- `src/studio.ts`：`saveDraft` 签名改为 `saveDraft(accountId, { copy, coverPrompt, evidence? })`（无 topicId）。

- [ ] **Step 1: 更新草稿创建测试（去 topicId）**

`tests/routes.test.ts` 草稿创建 POST body 移除 `topicId` 字段；「草稿引用不存在选题返回 400」测试删除。

- [ ] **Step 2: 实现 drafts.ts / studio.ts / studio.ts 改动**

- `drafts.ts`：搬入草稿 handler；POST 必填字段改为 `accountId/date/copy/coverPrompt`（去 topicId）；`store.saveDraft(payload)` 不再 `markTopicUsed`。
- `studio.ts`：搬入创作台 handler；`studio/draft` POST 的 `topicId` 改为可选（`body.topicId !== undefined` 时才走 `markTopicUsed`）。
- `src/studio.ts`：`StudioService.saveDraft` payload 类型去 `topicId`；`StudioService` 构造函数签名不变（`(store, llmClient)`）。

- [ ] **Step 3: 运行确认**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 4: 提交**

```bash
git add src/routes/drafts.ts src/routes/studio.ts src/routes/index.ts src/studio.ts tests/routes.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "refactor(routes): 草稿/创作台路由拆分，草稿去 topicId"
```

---

### Task 11: 装配与工具同步（index.ts、tools.ts、composer/decision）

**Files:**
- Modify: `src/index.ts`、`src/tools.ts`、`src/composer.ts`
- Delete: `src/decision.ts`（选题过滤废弃）
- Test: `tests/tools.test.ts`、`tests/composer.test.ts`

**Interfaces:**
- Consumes: Task 5 `ApifyViralProvider`、Task 7 `resolveStudioModel`、Task 9 `makeViralRoutes`
- Produces: `index.ts` 装配：模型解析（`ctx.settings.get(settingsNamespace('agent-default-model'))` → `resolveStudioModel`）；`viralProvider` 用 store settings 的 apify 配置创建（回退逻辑删除，唯一来源 store）；路由 deps 传 `viralProvider`；工具：删 `xhs_topics`/`xhs_topic_add`，新增 `xhs_virals`，`xhs_today` 改用爆款池。

- [ ] **Step 1: 更新 tools.ts**

- 删除 `xhs_topics`、`xhs_topic_add` 的定义与注册。
- 新增 `xhs_virals`：参数 `{ accountId, status? }`，返回该账号爆款池条目（id/title/body/sourceUrl/status/score/reasons），description 中文。
- `xhs_today`：简报中「选题」来源改为「该账号 pending/accepted 爆款池」，`composer.composeBrief` 签名调整（去掉 topics 参数）。
- `XHS_GUIDANCE` 更新：移除选题池相关、新增爆款池。

- [ ] **Step 2: 更新 composer.ts / 删除 decision.ts**

`composeBrief(account, persona, viralItems)`——`decision.ts` 的 `filterTopics`/`selectTopic` 删除，`tests/decision.test.ts` 删除，`tests/composer.test.ts` 更新为爆款池参数。

- [ ] **Step 3: 更新 index.ts 装配**

```ts
const modelRoute = resolveStudioModel(
  () => { try { const m = ctx.settings.get(settingsNamespace('agent-default-model')) as { provider?: string; model?: string }; return m.provider && m.model ? { provider: m.provider, model: m.model } : undefined } catch { return undefined } },
  () => ctx.llm.listProviders().map(p => ({ id: p.id })),
)
const apifyStore = store.getSettings().apify
const viralProvider = apifyStore.actorId !== '' && apifyStore.apiToken !== ''
  ? new ApifyViralProvider({ actorId: apifyStore.actorId, apiToken: apifyStore.apiToken, maxItems: apifyStore.maxItems, requestTimeoutMs: apifyStore.requestTimeoutMs, maxPolls: apifyStore.maxPolls })
  : undefined
const llmClient: StudioLlmClient = modelRoute === undefined ? { complete: async () => { throw new Error('未配置创作台模型：请在 Harness 设置 agent-default-model') } } : { /* 用 modelRoute.provider/model 调 ctx.llm.stream */ }
```

- 路由 deps：`makeRoutes({ store, viralProvider, scheduler, studio, reload: sync })`（scheduler 用 `ViralProvider`）。
- 插件 Config 删除 `apifyActorId/apifyApiToken/apifyMaxItems/apifyRequestTimeoutMs/apifyMaxPolls` 字段；`installSettingsSection` 移除这些字段。

- [ ] **Step 4: 运行确认**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 全绿（含 lib/ 重建）

- [ ] **Step 5: 提交**

```bash
git add src/index.ts src/tools.ts src/composer.ts src/decision.ts tests/ && git rm src/decision.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(host): 装配爆款池/模型解析/工具同步（删选题池工具）"
```

---

### Task 12: 前端 API 层（client/api.ts）

**Files:**
- Modify: `src/client/api.ts`
- Test: `tests/client-api.test.ts`

**Interfaces:**
- Produces: 删除 `listTopics/addTopic/importTopics/retireTopic/collectTrends/listTrends`；新增 `listViralItems(accountId, status?)`、`collectViral(accountId, query?, maxItems?)`、`reviewViralItem(accountId, itemId, status)`；`updateDraft` payload 去 `topicId` 相关；保留其余。

- [ ] **Step 1: 更新 client-api.test.ts**

新增用例：`collectViral` POST body 含 `accountId/query/maxItems`；`reviewViralItem` PATCH `{ status: 'accepted' }`。

- [ ] **Step 2: 实现 api.ts**

按 Interfaces 增删方法；`XHS_API` 引用同步（topics/trends 移除、viral 新增）。

- [ ] **Step 3: 运行确认**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 4: 提交**

```bash
git add src/client/api.ts src/protocol.ts tests/client-api.test.ts && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(client-api): 爆款池 API 方法（采集/列表/审核），移除选题池与趋势"
```

---

### Task 13: 前端爆款池页面与审核交互

**Files:**
- Create: `src/client/panel/ViralTab.tsx`
- Modify: `src/client/panel/XhsPanel.tsx`、`src/client/panel/OverviewTab.tsx`
- Test: `tests/viral-tab.test.tsx`（新建）

**Interfaces:**
- Consumes: Task 12 api 方法
- Produces: `ViralTab({ api, accountId })`：当前账号爆款池列表（标题/正文摘要/来源链接/推荐分/理由/状态），每条「采纳」「忽略」按钮；顶部「配置 Apify」「采集爆款」按钮（复用 TopicsTab 的配置弹窗逻辑，可抽 `ApifyConfigDialog.tsx`）；导航项「趋势选题」改为「爆款池」。

- [ ] **Step 1: 写失败测试（viral-tab.test.tsx）**

mock api（listViralItems/collectViral/reviewViralItem），断言：渲染 pending 条目、点「采纳」调用 `reviewViralItem(accountId, id, 'accepted')` 并刷新。

- [ ] **Step 2: 实现 ViralTab.tsx**

按 Interfaces 实现列表 + 审核交互 + 采集按钮；`XhsPanel` 的 `PageId` 中 `topics` 更名 `viral`，导航项「爆款池」，`OverviewTab` 账号卡片入口改为 `viral`，外部趋势计数用 `listViralItems`。

- [ ] **Step 3: 运行确认**

Run: `pnpm test && pnpm typecheck`
Expected: 通过

- [ ] **Step 4: 提交**

```bash
git add src/client/panel/ViralTab.tsx src/client/panel/XhsPanel.tsx src/client/panel/OverviewTab.tsx tests/viral-tab.test.tsx && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(client): 爆款池页面（列表/采集/审核）替换趋势选题页"
```

---

### Task 14: 前端知识库导入简化 + 创作台调整

**Files:**
- Modify: `src/client/panel/ImportDialog.tsx`、`src/client/panel/StudioTab.tsx`、`src/client/panel/DraftEditor.tsx`、`src/client/panel/DraftsTab.tsx`

**Interfaces:**
- Consumes: Task 12 api
- Produces: ImportDialog 表单只保留「标题+正文」必填（移除格式选择/JSON-CSV 说明，改为固定 JSON 数组 `[{title,copy}]` 粘贴或标题/正文双文本域——**采用双文本域简化版**）；StudioTab 右侧上下文栏「外部趋势」改为「已采纳爆款参考」；DraftEditor 移除「生成依据」中选题相关引用；DraftsTab 移除选题 id 展示。

- [ ] **Step 1: 更新 ImportDialog.tsx**

改为两文本域：标题（textarea 每行一个标题）与正文（textarea 与标题对应，行号对应）。POST `accountImport` payload `{ accountId, format: 'json', content: JSON.stringify([{ title, copy }...]) }`。

- [ ] **Step 2: 更新 StudioTab/DraftEditor/DraftsTab**

- StudioTab：上下文栏「外部趋势」改为 `accepted` 爆款计数（`listViralItems(accountId, 'accepted')`）；保存草稿不再用 window.prompt 输入选题（直接以最近助手结果保存，`studioSaveDraft` 不带 topicId）。
- DraftEditor/DraftsTab：移除 `topicId` 展示与相关文案。

- [ ] **Step 3: 运行确认**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: 全绿

- [ ] **Step 4: 提交**

```bash
git add src/client/panel/ && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "feat(client): 导入简化（标题+正文）、创作台爆款参考、草稿独立"
```

---

### Task 15: 全量回归、README 与收尾

**Files:**
- Modify: `README.md`、`package.json`（description 更新）

- [ ] **Step 1: 清理残留引用**

Run: `grep -rn "topics\|trendSamples\|xhs_topic\|xhs_topics\|Topic\b" src tests --include="*.ts" --include="*.tsx" | grep -v "viral\|爆款"`
Expected: 无残留（除设计文档/README 历史说明外）。

- [ ] **Step 2: 全量验证**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 全绿；`rm -rf lib && pnpm build` 确认无陈旧 chunk。

- [ ] **Step 3: 更新 README**

功能清单：爆款池（采集/审核/账号隔离）、知识库（标题+正文导入/权重）、创作台（复用 Harness 模型）、草稿；配置表移除 apify 字段（改为「爆款池页内配置」）；数据与隐私说明更新 v3。

- [ ] **Step 4: 提交**

```bash
git add -A && git -c user.name="xhs-matrix" -c user.email="dev@xhs-matrix.local" commit -m "chore: 全量回归与文档更新（v3 爆款池架构）"
```

---

## Self-Review 结果

- **Spec 覆盖**：领域模型（Task 1-2）、迁移（Task 3）、采集层（Task 4-6）、模型复用（Task 7）、路由拆分（Task 8-10）、装配与工具（Task 11）、前端（Task 12-14）、回归文档（Task 15）——逐条对应 spec 第 2-8 节。
- **占位符扫描**：无 TBD/TODO；各任务含实际测试与实现代码。
- **类型一致性**：`ViralItem`/`ViralStatus`/`saveViralItem`/`reviewViralItem`/`listViralItems`/`rankViralItems`/`normalizeApifyItem`/`resolveStudioModel`/`makeViralRoutes` 在前后任务签名一致。
