# dsh-xhs-matrix MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现小红书矩阵管理插件 MVP（矩阵核心 + 今日决策流）：账号/人设/选题/黑名单/草稿的持久化与 Web 配置界面，以及「今天要发什么」的选题决策与文案生成。

**Architecture:** 双半插件（Host + Client）。Host 半在宿主进程内提供私有 JSON 文件存储、`/api/dsh-xhs-matrix` 路由族、7 个模型工具与 `xhs/feedback` 事件；Client 半以 DOM 级注入渲染侧边栏入口与中栏五 Tab 面板，通过同源 fetch 调用路由。文案生成复用 agent-loop（工具只产出创作简报，不嵌套调 LLM）。

**Tech Stack:** TypeScript（strict）、schemastery（插件 Config）、tsdown + tsc（构建）、vitest（测试）、React 18（Client）、node:http（路由测试）。

**Spec:** `docs/specs/2026-08-18-xhs-matrix-design.md`（本计划实现的规范文档，执行者须同时阅读）

**权威参考模板（本机已安装，模式完全一致，随时可读）：** `/home/administrator/.dsh/profiles/web/node_modules/@linxin666/dsh-ssh`（含 `src/index.ts`、`src/routes.ts`、`src/store.ts`、`src/tools.ts`、`src/client/*`、`package.json`）

## Global Constraints

- 所有文档、系统提示、界面文案、错误消息使用中文（spec D6）。
- 存储：私有 JSON 文件 `~/.dsh/dsh-xhs-matrix.json`，原子写（tmp + rename），`FORMAT_VERSION = 1`，介质损坏 / version 不匹配 → 明确报错（**对 spec §5 的修订**：第三方面板插件采用 dsh-ssh 同款私有文件存储而非 `ctx.storage`，自包含、不依赖部署方存储后端）。
- 文案生成不嵌套调 LLM：`xhs_today` 只返回创作简报，由 agent 续写；`xhs_draft_save` 是去重闸门。
- 所有路由带 loopback 信任围栏（复制 `loopback.ts` 实现），写操作统一 JSON 校验，业务错误 200 + `{error}`，不静默跳过。
- 每个工具返回 `{ ok: boolean, message: string, ...data }` 结构；错误场景（无账号 / 选题池空 / 全被黑名单命中 / 今日已发）message 给出中文诊断。
- 所有注册走 `ctx.effect()` 返回 disposer；HMR/卸载必须移除全部副作用。
- 账号/人设增删改走 Web UI，agent 只读；选题与黑名单 agent 可写。
- 依赖版本镜像 dsh-ssh：`@deepseek-ai/dsh-*` `^0.1.0-rc.6`、`@deepseek-ai/cordis` `^4.0.1`、`schemastery` `^3.18.0`、`typescript` `~5.7.2`、`tsdown` `0.22.2`、`vitest` `^3.0.0`、`react/react-dom` `^18.3.1`。
- 插件名 `dsh-xhs-matrix`（发布时按你的 npm scope 调整，如 `@you/dsh-xhs-matrix`）；cordis 行 id `xhs-matrix`。
- 构建产物布局对齐已安装模板：`lib/index.js`（Host）、`lib/client.js`（浏览器 bundle）、`lib/types/**`（声明）。

---

### Task 1: 仓库脚手架

**Files:**
- Create: `packages/dsh-xhs-matrix/package.json`
- Create: `packages/dsh-xhs-matrix/tsconfig.json`
- Create: `packages/dsh-xhs-matrix/tsconfig.build.json`
- Create: `packages/dsh-xhs-matrix/tsdown.config.ts`
- Create: `packages/dsh-xhs-matrix/vitest.config.ts`
- Create: `packages/dsh-xhs-matrix/cordis.patch.yml`
- Create: `packages/dsh-xhs-matrix/.gitignore`
- Create: `README.md`（仓库根，中文）

**Interfaces:**
- Consumes: 无（仓库已存在，docs/ 已就位）。
- Produces: 可 `pnpm install`、`pnpm build`、`pnpm test` 的包骨架，后续任务在其上添加 `src/`。

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "dsh-xhs-matrix",
  "description": "小红书矩阵内容管理系统（dsh 双半插件）：账号人设、选题池、黑名单、草稿与「今天要发什么」决策流。",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": "^22.19.0 || >=24.0.0" },
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./invariant": { "types": "./lib/types/invariant.d.ts", "default": "./lib/invariant.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-connection",
        "@deepseek-ai/dsh-client-ui-settings"
      ],
      "platform": "web"
    }
  },
  "peerDependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-connection": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-locale": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-runtime": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-settings": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-sidebar": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-slots": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-host-webserver": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-settings": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-system-prompt": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
    "@types/node": "^22.20.0",
    "@types/react": "~18.3.1",
    "@types/react-dom": "^18.3.5",
    "jsdom": "^25.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "schemastery": "^3.18.0",
    "tsdown": "0.22.2",
    "typescript": "~5.7.2",
    "vitest": "^3.0.0"
  },
  "files": [
    "lib/**/*.js", "lib/**/*.js.map", "lib/**/*.d.ts", "lib/**/*.d.ts.map",
    "src", "cordis.patch.yml", "README.md"
  ],
  "license": "Apache-2.0",
  "scripts": {
    "build": "tsc -p tsconfig.build.json && tsdown",
    "bundle": "tsdown",
    "watch": "tsdown --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: 创建 tsconfig（开发与构建）**

`tsconfig.json`（类型检查用，包含 src 与 tests）：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

`tsconfig.build.json`（产物：`lib/index.js` + `lib/types/**`）：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationDir": "lib/types",
    "outDir": "lib",
    "rootDir": "src",
    "sourceMap": true
  },
  "include": ["src"]
}
```

> 说明：若最终 `lib/` 布局与模板不一致（已安装模板布局见 `/home/administrator/.dsh/profiles/web/node_modules/@linxin666/dsh-ssh/lib`），以 tsdown 输出为准微调 include/exclude（如让 tsdown 单独产出 `lib/client.js` 并排除 `src/client` 的 tsc 输出）。

- [ ] **Step 3: 创建 tsdown.config.ts（浏览器 bundle）**

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  format: ['esm'],
  outDir: 'lib',
  platform: 'browser',
  external: ['react', 'react-dom', /^@deepseek-ai\//],
  sourcemap: true,
})
```

> 若 tsdown 0.22 报配置错误，参照核心仓库双半包 `packages/extensions/ui-cordis/tsdown.config.ts` 与 `packages/client/tsdown.client.ts` 调整（本仓库只 bundle client 单入口）。

- [ ] **Step 4: 创建 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 5: 创建 cordis.patch.yml（插件行插入 web profile）**

```yaml
# dsh-xhs-matrix bundle patch：向 web profile 插入双面插件行。
# Host 半（exports "."）在宿主进程运行（存储、/api/dsh-xhs-matrix 路由、agent 工具），
# 浏览器半（exports "./client"）经 package.json 的 dsh.client 声明在 Web GUI 加载。
- insert:
    - id: xhs-matrix
      name: 'dsh-xhs-matrix'
```

- [ ] **Step 6: 创建 .gitignore 与 README.md**

`.gitignore`：

```
node_modules/
lib/
*.tsbuildinfo
```

`README.md`（中文，内容为插件简介 + 安装 + 使用，安装段写：本地开发 `dsh plugin --profile web add link:/home/administrator/tmp/dsh-xhs-matrix/packages/dsh-xhs-matrix`；发布后 `dsh plugin --profile web add dsh-xhs-matrix` 或经 GUI 插件清单安装）。

- [ ] **Step 7: 安装依赖并验证构建管道**

Run: `cd /home/administrator/tmp/dsh-xhs-matrix/packages/dsh-xhs-matrix && pnpm install`
Expected: 安装成功（node_modules 就位）。

Run: `pnpm build`
Expected: 成功产出 `lib/`（此时 src 尚不存在则先 `mkdir -p src src/client tests`，或先建占位 `src/index.ts` 空导出）。若 tsc 因 src/client 缺失报错，`mkdir -p src/client` 即可。

Run: `pnpm test`
Expected: `No test files found` 或空通过（vitest 正常启动）。

- [ ] **Step 8: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix README.md
git commit -m "chore: dsh-xhs-matrix 包脚手架（构建/测试/组合清单）"
```

---

### Task 2: 领域类型与纯函数决策

**Files:**
- Create: `packages/dsh-xhs-matrix/src/types.ts`
- Create: `packages/dsh-xhs-matrix/src/decision.ts`
- Create: `packages/dsh-xhs-matrix/src/composer.ts`
- Test: `packages/dsh-xhs-matrix/tests/decision.test.ts`
- Test: `packages/dsh-xhs-matrix/tests/composer.test.ts`

**Interfaces:**
- Consumes: Task 1 的包骨架。
- Produces:
  - `types.ts`：`Account`、`Persona`、`TopicStatus`、`Topic`、`NegativeTopic`、`DraftStatus`、`DraftMetrics`、`Draft`、`StoreFile`（字段见下方代码，Task 3-6 全部依赖）。
  - `decision.ts`：`matchesNegative(title, neg): boolean`；`filterTopics(topics, negatives, accountId, todayDrafts): Topic[]`；`selectTopic(candidates, strategy, rand): Topic | undefined`。
  - `composer.ts`：`composeBrief(account, persona, topic, negatives): string`。

- [ ] **Step 1: 写失败的测试（决策过滤）**

```ts
import { describe, expect, it } from 'vitest'
import { filterTopics, matchesNegative, selectTopic } from '../src/decision.ts'
import type { Draft, NegativeTopic, Topic } from '../src/types.ts'

function topic(id: string, title: string, status: Topic['status'] = 'open'): Topic {
  return { id, title, source: 'manual', status, createdAt: '2026-08-18T00:00:00.000Z' }
}
function neg(id: string, keyword: string, accountId?: string): NegativeTopic {
  return { id, keyword, reason: '上次没流量', accountId, createdAt: '2026-08-18T00:00:00.000Z' }
}
function draft(accountId: string, topicId: string, date = '2026-08-18'): Draft {
  return {
    id: 'd' + topicId, accountId, topicId, date, copy: '', coverPrompt: '', status: 'generated',
    createdAt: '2026-08-18T00:00:00.000Z',
  }
}

describe('filterTopics', () => {
  it('剔除已用选题', () => {
    const topics = [topic('t1', '美妆技巧', 'used'), topic('t2', '通勤穿搭', 'open')]
    expect(filterTopics(topics, [], 'acc-a', []).map(t => t.id)).toEqual(['t2'])
  })

  it('剔除标题命中全局黑名单的选题', () => {
    const topics = [topic('t1', '美妆技巧'), topic('t2', '通勤穿搭')]
    const result = filterTopics(topics, [neg('n1', '美妆')], 'acc-a', [])
    expect(result.map(t => t.id)).toEqual(['t2'])
  })

  it('账号级黑名单只作用于该账号', () => {
    const topics = [topic('t1', '美妆技巧'), topic('t2', '通勤穿搭')]
    const negatives = [neg('n1', '美妆', 'acc-a')]
    expect(filterTopics(topics, negatives, 'acc-a', []).map(t => t.id)).toEqual(['t2'])
    expect(filterTopics(topics, negatives, 'acc-b', []).map(t => t.id)).toEqual(['t1', 't2'])
  })

  it('剔除今日已为该账号生成的选题', () => {
    const topics = [topic('t1', '美妆技巧'), topic('t2', '通勤穿搭')]
    const result = filterTopics(topics, [], 'acc-a', [draft('acc-a', 't1')])
    expect(result.map(t => t.id)).toEqual(['t2'])
  })

  it('账号 A 今日已发的选题不影响账号 B', () => {
    const topics = [topic('t1', '美妆技巧'), topic('t2', '通勤穿搭')]
    const result = filterTopics(topics, [], 'acc-b', [draft('acc-a', 't1')])
    expect(result.map(t => t.id)).toEqual(['t1', 't2'])
  })
})

describe('matchesNegative', () => {
  it('子串命中', () => {
    expect(matchesNegative('美妆技巧分享', neg('n1', '美妆'))).toBe(true)
    expect(matchesNegative('通勤穿搭', neg('n1', '美妆'))).toBe(false)
  })
})

describe('selectTopic', () => {
  it('fifo 选最旧未用优先', () => {
    const a = topic('t1', 'a'), b = topic('t2', 'b')
    expect(selectTopic([a, b], 'fifo')?.id).toBe('t1')
    expect(selectTopic([b, a], 'fifo')?.id).toBe('b')
  })

  it('random 使用注入的随机源', () => {
    const a = topic('t1', 'a'), b = topic('t2', 'b')
    expect(selectTopic([a, b], 'random', () => 0.9)?.id).toBe('b')
    expect(selectTopic([a, b], 'random', () => 0.1)?.id).toBe('a')
  })

  it('空候选返回 undefined', () => {
    expect(selectTopic([], 'fifo')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/dsh-xhs-matrix && pnpm vitest run tests/decision.test.ts`
Expected: FAIL（`../src/decision.ts` 不存在）。

- [ ] **Step 3: 写最小实现（types.ts + decision.ts）**

`src/types.ts`：

```ts
/** 领域类型：只放类型，不放运行时代码。 */

/** 矩阵账号。 */
export interface Account {
  id: string
  name: string
  personaId: string
  enabled: boolean
  createdAt: string
}

/** 人设模板。 */
export interface Persona {
  id: string
  name: string
  prompt: string
  toneTags?: string[]
  createdAt: string
}

export type TopicStatus = 'open' | 'used' | 'retired'

/** 选题。 */
export interface Topic {
  id: string
  title: string
  source: 'manual' | 'import'
  status: TopicStatus
  usedByDraftId?: string
  createdAt: string
}

/** 黑名单条目；accountId 为空表示全局。 */
export interface NegativeTopic {
  id: string
  accountId?: string
  keyword: string
  reason: string
  createdAt: string
}

export type DraftStatus = 'generated' | 'published' | 'dropped'

/** 发布后回填的流量指标。 */
export interface DraftMetrics {
  reads: number
  likes: number
  comments: number
  collected: string
}

/** 草稿（文案 + 封面提示词）。 */
export interface Draft {
  id: string
  accountId: string
  topicId: string
  date: string
  copy: string
  coverPrompt: string
  status: DraftStatus
  metrics?: DraftMetrics
  createdAt: string
}

/** 存储文件整体形状。 */
export interface StoreFile {
  version: number
  accounts: Account[]
  personas: Persona[]
  topics: Topic[]
  negatives: NegativeTopic[]
  drafts: Draft[]
}
```

`src/decision.ts`：

```ts
/** 纯函数决策流水线：输入领域状态，输出选题与创作简报，不碰 I/O。 */

import type { Draft, NegativeTopic, Topic } from './types.ts'

/** 标题是否命中黑名单（子串匹配）。 */
export function matchesNegative(title: string, negative: NegativeTopic): boolean {
  return title.includes(negative.keyword)
}

/** 该账号今日已用过的选题 id 集合。 */
function usedTodayIds(accountId: string, todayDrafts: Draft[]): Set<string> {
  return new Set(todayDrafts.filter(d => d.accountId === accountId).map(d => d.topicId))
}

/**
 * 按账号过滤选题：剔除已用 / 命中黑名单（账号级 + 全局）/ 今日已为该账号生成。
 * @param topics - 全部选题。
 * @param negatives - 全部黑名单。
 * @param accountId - 目标账号。
 * @param todayDrafts - 今日草稿。
 * @returns 候选选题。
 */
export function filterTopics(
  topics: Topic[],
  negatives: NegativeTopic[],
  accountId: string,
  todayDrafts: Draft[],
): Topic[] {
  const usedToday = usedTodayIds(accountId, todayDrafts)
  return topics.filter((topic) => {
    if (topic.status !== 'open') return false
    if (usedToday.has(topic.id)) return false
    const hit = negatives.some(n =>
      (n.accountId === undefined || n.accountId === accountId) && matchesNegative(topic.title, n),
    )
    return !hit
  })
}

/**
 * 从候选中选择一个选题。
 * @param candidates - 候选选题。
 * @param strategy - fifo（最旧未用优先，按 createdAt 排序）/ random。
 * @param rand - 随机源，测试注入固定值。
 * @returns 选中选题，候选为空时 undefined。
 */
export function selectTopic(
  candidates: Topic[],
  strategy: 'fifo' | 'random',
  rand: () => number = Math.random,
): Topic | undefined {
  if (candidates.length === 0) return undefined
  if (strategy === 'random') {
    return candidates[Math.floor(rand() * candidates.length)]
  }
  return [...candidates].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/decision.test.ts`
Expected: PASS（全部绿）。

- [ ] **Step 5: 写失败测试（创作简报）**

`tests/composer.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { composeBrief } from '../src/composer.ts'
import type { Account, NegativeTopic, Persona, Topic } from '../src/types.ts'

const account: Account = { id: 'acc-a', name: '账号A', personaId: 'p1', enabled: true, createdAt: '2026-08-18T00:00:00.000Z' }
const persona: Persona = { id: 'p1', name: '干货风', prompt: '专业、数据支撑、不废话', createdAt: '2026-08-18T00:00:00.000Z' }
const topic: Topic = { id: 't1', title: '通勤穿搭', source: 'manual', status: 'open', createdAt: '2026-08-18T00:00:00.000Z' }

describe('composeBrief', () => {
  it('包含账号、人设、选题与任务', () => {
    const brief = composeBrief(account, persona, topic, [])
    expect(brief).toContain('账号A')
    expect(brief).toContain('干货风')
    expect(brief).toContain('通勤穿搭')
    expect(brief).toContain('封面提示词')
  })

  it('逐条列出黑名单约束', () => {
    const negatives: NegativeTopic[] = [
      { id: 'n1', keyword: '美妆技巧', reason: '上次没流量', createdAt: '2026-08-18T00:00:00.000Z' },
    ]
    const brief = composeBrief(account, persona, topic, negatives)
    expect(brief).toContain('美妆技巧')
    expect(brief).toContain('上次没流量')
  })
})
```

- [ ] **Step 6: 运行测试确认失败**

Run: `pnpm vitest run tests/composer.test.ts`
Expected: FAIL（`../src/composer.ts` 不存在）。

- [ ] **Step 7: 写实现（composer.ts）**

```ts
/** 创作简报拼接：人设 + 选题 − 黑名单（纯函数）。 */

import type { Account, NegativeTopic, Persona, Topic } from './types.ts'

/**
 * 拼接创作简报 markdown。
 * @param account - 目标账号。
 * @param persona - 账号人设。
 * @param topic - 选中选题。
 * @param negatives - 全部黑名单（账号级 + 全局）。
 * @returns 简报文本。
 */
export function composeBrief(
  account: Account,
  persona: Persona,
  topic: Topic,
  negatives: NegativeTopic[],
): string {
  const constraints = negatives
    .filter(n => n.accountId === undefined || n.accountId === account.id)
    .map(n => `【约束】不要写类似于「${n.keyword}」的内容，因为${n.reason}`)
  return [
    `【账号】${account.name}（${persona.name}）`,
    `【人设】${persona.prompt}`,
    `【选题】${topic.title}`,
    ...constraints,
    `【任务】按以上人设撰写小红书文案（标题 + 正文 + 话题标签），并给出封面提示词（coverPrompt）。`,
  ].join('\n')
}
```

- [ ] **Step 8: 运行全部测试确认通过**

Run: `pnpm vitest run`
Expected: PASS。

- [ ] **Step 9: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/types.ts packages/dsh-xhs-matrix/src/decision.ts packages/dsh-xhs-matrix/src/composer.ts packages/dsh-xhs-matrix/tests/decision.test.ts packages/dsh-xhs-matrix/tests/composer.test.ts
git commit -m "feat: 领域类型与纯函数决策（过滤/选择/简报拼接）"
```

---

### Task 3: 存储层

**Files:**
- Create: `packages/dsh-xhs-matrix/src/store.ts`
- Test: `packages/dsh-xhs-matrix/tests/store.test.ts`

**Interfaces:**
- Consumes: `types.ts`（Task 2 全部实体）；`StoreFile`。
- Produces: `class MatrixStore`：
  - `constructor(filePath?: string)`（默认 `~/.dsh/dsh-xhs-matrix.json`）
  - `load(): StoreFile`（version 不匹配 / 损坏 → throw `MatrixStoreError`）
  - `save(): void`（原子写）
  - 账号：`listAccounts(): Account[]`、`upsertAccount(payload: AccountPayload, id?): Account`、`deleteAccount(id): void`（级联：关联人设不变，关联草稿保留）
  - 人设：`listPersonas()`、`upsertPersona(payload, id?)`、`deletePersona(id)`（引用了它的账号置空 personaId 为 `''`）
  - 选题：`listTopics()`、`addTopics(titles: string[]): Topic[]`、`retireTopic(id)`、`markTopicUsed(id, draftId)`
  - 黑名单：`listNegatives()`、`addNegative(payload): NegativeTopic`、`deleteNegative(id)`
  - 草稿：`listDrafts()`、`findDraft(accountId, date, topicId): Draft | undefined`、`saveDraft(payload): Draft`、`setDraftStatus(id, status, metrics?): Draft`
  - 校验：`validateAccountPayload`、`validatePersonaPayload`、`validateNegativePayload`（返回错误消息或 undefined）
- 提供 `matrixStorePath(): string`、`export const MATRIX_STORE_VERSION = 1`、`class MatrixStoreError extends Error { constructor(message: string) }`。

- [ ] **Step 1: 写失败的测试**

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MATRIX_STORE_VERSION, MatrixStore, MatrixStoreError, matrixStorePath } from '../src/store.ts'

let dir: string
let file: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xhs-store-')); file = join(dir, 'xhs.json') })
afterEach(() => { })

describe('MatrixStore', () => {
  it('默认路径为 ~/.dsh/dsh-xhs-matrix.json', () => {
    expect(matrixStorePath()).toContain('.dsh')
    expect(matrixStorePath()).toContain('dsh-xhs-matrix.json')
  })

  it('首次加载返回空结构并持久化', () => {
    const store = new MatrixStore(file)
    const data = store.load()
    expect(data.version).toBe(MATRIX_STORE_VERSION)
    expect(data.accounts).toEqual([])
    expect(data.topics).toEqual([])
  })

  it('upsert 与 roundtrip 持久化', () => {
    const store = new MatrixStore(file)
    const account = store.upsertAccount({ name: '账号A', personaId: 'p1', enabled: true })
    expect(account.id).toBeTruthy()
    expect(store.listAccounts()).toHaveLength(1)
    const reloaded = new MatrixStore(file)
    expect(reloaded.listAccounts()[0].name).toBe('账号A')
  })

  it('version 不匹配明确报错', () => {
    writeFileSync(file, JSON.stringify({ version: MATRIX_STORE_VERSION + 1, accounts: [] }))
    expect(() => new MatrixStore(file).load()).toThrow(MatrixStoreError)
    expect(() => new MatrixStore(file).load()).toThrow(/version/)
  })

  it('损坏介质明确报错', () => {
    writeFileSync(file, '{not json')
    expect(() => new MatrixStore(file).load()).toThrow(MatrixStoreError)
  })

  it('去重闸门：同账号+日期+选题的草稿可被 findDraft 发现', () => {
    const store = new MatrixStore(file)
    const topic = store.addTopics(['通勤穿搭'])[0]
    store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    expect(store.findDraft('acc-a', '2026-08-18', topic.id)).toBeTruthy()
    expect(store.findDraft('acc-b', '2026-08-18', topic.id)).toBeUndefined()
  })

  it('markTopicUsed 后选题不再 open', () => {
    const store = new MatrixStore(file)
    const [topic] = store.addTopics(['通勤穿搭'])
    const draft = store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    store.markTopicUsed(topic.id, draft.id)
    expect(store.listTopics()[0].status).toBe('used')
    expect(store.listTopics()[0].usedByDraftId).toBe(draft.id)
  })

  it('setDraftStatus 携带 metrics', () => {
    const store = new MatrixStore(file)
    const [topic] = store.addTopics(['通勤穿搭'])
    const draft = store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    const updated = store.setDraftStatus(draft.id, 'published', { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' })
    expect(updated.status).toBe('published')
    expect(updated.metrics?.reads).toBe(50)
  })

  it('删除人设后引用账号的 personaId 置空', () => {
    const store = new MatrixStore(file)
    const p = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const a = store.upsertAccount({ name: '账号A', personaId: p.id, enabled: true })
    store.deletePersona(p.id)
    expect(store.listAccounts().find(x => x.id === a.id)?.personaId).toBe('')
  })

  it('payload 校验', () => {
    expect(MatrixStore.validateAccountPayload({ name: '', personaId: 'p1', enabled: true })).toMatch(/账号名/)
    expect(MatrixStore.validateAccountPayload({ name: '账号A', personaId: 'p1', enabled: true })).toBeUndefined()
  })

  it('原子写：save 后文件可直接读取', () => {
    const store = new MatrixStore(file)
    store.upsertAccount({ name: '账号A', personaId: '', enabled: true })
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version: number }
    expect(raw.version).toBe(MATRIX_STORE_VERSION)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/store.test.ts`
Expected: FAIL（`../src/store.ts` 不存在）。

- [ ] **Step 3: 写实现（store.ts）**

```ts
/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type {
  Account, Draft, DraftMetrics, DraftStatus, NegativeTopic, Persona, StoreFile, Topic,
} from './types.ts'

/** 存储文件格式版本。 */
export const MATRIX_STORE_VERSION = 1

/** 存储文件默认位置。 */
export function matrixStorePath(): string {
  return join(homedir(), '.dsh', 'dsh-xhs-matrix.json')
}

/** 存储错误：介质损坏 / version 不匹配 / 校验失败。 */
export class MatrixStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatrixStoreError'
  }
}

/** 写接口的载荷形状（不含 id/createdAt）。 */
export interface AccountPayload { name: string; personaId: string; enabled: boolean }
export interface PersonaPayload { name: string; prompt: string; toneTags?: string[] }
export interface NegativePayload { accountId?: string; keyword: string; reason: string }
export interface DraftPayload { accountId: string; topicId: string; date: string; copy: string; coverPrompt: string }

function empty(): StoreFile {
  return { version: MATRIX_STORE_VERSION, accounts: [], personas: [], topics: [], negatives: [], drafts: [] }
}

function nextId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/**
 * 持久化存储：整个 StoreFile 一个文件，写操作后整体原子落盘。
 * @param filePath - 存储文件路径（测试注入临时路径）。
 */
export class MatrixStore {
  static validateAccountPayload(payload: unknown): string | undefined {
    const p = payload as Partial<AccountPayload> | null
    if (typeof p !== 'object' || p === null) return 'body 必须是 JSON 对象'
    if (typeof p.name !== 'string' || p.name.trim() === '') return '账号名必填'
    if (typeof p.personaId !== 'string') return 'personaId 必须是字符串'
    if (typeof p.enabled !== 'boolean') return 'enabled 必须是布尔值'
    return undefined
  }

  static validatePersonaPayload(payload: unknown): string | undefined {
    const p = payload as Partial<PersonaPayload> | null
    if (typeof p !== 'object' || p === null) return 'body 必须是 JSON 对象'
    if (typeof p.name !== 'string' || p.name.trim() === '') return '人设名必填'
    if (typeof p.prompt !== 'string' || p.prompt.trim() === '') return '人设提示词必填'
    return undefined
  }

  static validateNegativePayload(payload: unknown): string | undefined {
    const p = payload as Partial<NegativePayload> | null
    if (typeof p !== 'object' || p === null) return 'body 必须是 JSON 对象'
    if (typeof p.keyword !== 'string' || p.keyword.trim() === '') return '黑名单关键词必填'
    if (typeof p.reason !== 'string' || p.reason.trim() === '') return '黑名单原因必填'
    if (p.accountId !== undefined && typeof p.accountId !== 'string') return 'accountId 必须是字符串'
    return undefined
  }

  private readonly filePath: string
  private data: StoreFile

  constructor(filePath: string = matrixStorePath()) {
    this.filePath = resolve(filePath)
    this.data = empty()
  }

  /** 读取并校验存储文件；缺失则返回空结构。 */
  load(): StoreFile {
    if (!existsSync(this.filePath)) {
      this.data = empty()
      return this.data
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8'))
    } catch {
      throw new MatrixStoreError(`存储文件损坏，无法解析：${this.filePath}`)
    }
    const file = parsed as Partial<StoreFile> | null
    if (typeof file !== 'object' || file === null || typeof file.version !== 'number') {
      throw new MatrixStoreError(`存储文件形状非法：${this.filePath}`)
    }
    if (file.version !== MATRIX_STORE_VERSION) {
      throw new MatrixStoreError(`存储文件版本不匹配：期望 ${MATRIX_STORE_VERSION}，实际 ${file.version}`)
    }
    this.data = {
      version: MATRIX_STORE_VERSION,
      accounts: Array.isArray(file.accounts) ? file.accounts as Account[] : [],
      personas: Array.isArray(file.personas) ? file.personas as Persona[] : [],
      topics: Array.isArray(file.topics) ? file.topics as Topic[] : [],
      negatives: Array.isArray(file.negatives) ? file.negatives as NegativeTopic[] : [],
      drafts: Array.isArray(file.drafts) ? file.drafts as Draft[] : [],
    }
    return this.data
  }

  /** 原子落盘（tmp + rename）。 */
  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(tmp, this.filePath)
  }

  // ---------------------------------------------------------------- 账号
  listAccounts(): Account[] { return this.data.accounts }
  upsertAccount(payload: AccountPayload, id?: string): Account {
    const error = MatrixStore.validateAccountPayload(payload)
    if (error !== undefined) throw new MatrixStoreError(error)
    if (id !== undefined) {
      const existing = this.data.accounts.find(a => a.id === id)
      if (existing === undefined) throw new MatrixStoreError(`账号不存在：${id}`)
      existing.name = payload.name
      existing.personaId = payload.personaId
      existing.enabled = payload.enabled
      this.save()
      return existing
    }
    const account: Account = { id: nextId(), ...payload, createdAt: new Date().toISOString() }
    this.data.accounts.push(account)
    this.save()
    return account
  }
  deleteAccount(id: string): void {
    this.data.accounts = this.data.accounts.filter(a => a.id !== id)
    this.save()
  }

  // ---------------------------------------------------------------- 人设
  listPersonas(): Persona[] { return this.data.personas }
  upsertPersona(payload: PersonaPayload, id?: string): Persona {
    const error = MatrixStore.validatePersonaPayload(payload)
    if (error !== undefined) throw new MatrixStoreError(error)
    if (id !== undefined) {
      const existing = this.data.personas.find(p => p.id === id)
      if (existing === undefined) throw new MatrixStoreError(`人设不存在：${id}`)
      existing.name = payload.name
      existing.prompt = payload.prompt
      existing.toneTags = payload.toneTags
      this.save()
      return existing
    }
    const persona: Persona = { id: nextId(), name: payload.name, prompt: payload.prompt, toneTags: payload.toneTags, createdAt: new Date().toISOString() }
    this.data.personas.push(persona)
    this.save()
    return persona
  }
  deletePersona(id: string): void {
    this.data.personas = this.data.personas.filter(p => p.id !== id)
    for (const account of this.data.accounts) {
      if (account.personaId === id) account.personaId = ''
    }
    this.save()
  }

  // ---------------------------------------------------------------- 选题
  listTopics(): Topic[] { return this.data.topics }
  addTopics(titles: string[]): Topic[] {
    const created: Topic[] = []
    for (const title of titles) {
      const trimmed = title.trim()
      if (trimmed === '') continue
      const topic: Topic = { id: nextId(), title: trimmed, source: 'manual', status: 'open', createdAt: new Date().toISOString() }
      this.data.topics.push(topic)
      created.push(topic)
    }
    this.save()
    return created
  }
  retireTopic(id: string): void {
    const topic = this.data.topics.find(t => t.id === id)
    if (topic === undefined) throw new MatrixStoreError(`选题不存在：${id}`)
    topic.status = 'retired'
    this.save()
  }
  markTopicUsed(id: string, draftId: string): void {
    const topic = this.data.topics.find(t => t.id === id)
    if (topic === undefined) throw new MatrixStoreError(`选题不存在：${id}`)
    topic.status = 'used'
    topic.usedByDraftId = draftId
    this.save()
  }

  // ---------------------------------------------------------------- 黑名单
  listNegatives(): NegativeTopic[] { return this.data.negatives }
  addNegative(payload: NegativePayload): NegativeTopic {
    const error = MatrixStore.validateNegativePayload(payload)
    if (error !== undefined) throw new MatrixStoreError(error)
    const negative: NegativeTopic = { id: nextId(), accountId: payload.accountId, keyword: payload.keyword, reason: payload.reason, createdAt: new Date().toISOString() }
    this.data.negatives.push(negative)
    this.save()
    return negative
  }
  deleteNegative(id: string): void {
    this.data.negatives = this.data.negatives.filter(n => n.id !== id)
    this.save()
  }

  // ---------------------------------------------------------------- 草稿
  listDrafts(): Draft[] { return this.data.drafts }
  findDraft(accountId: string, date: string, topicId: string): Draft | undefined {
    return this.data.drafts.find(d => d.accountId === accountId && d.date === date && d.topicId === topicId)
  }
  saveDraft(payload: DraftPayload): Draft {
    const draft: Draft = { id: nextId(), ...payload, status: 'generated', createdAt: new Date().toISOString() }
    this.data.drafts.push(draft)
    this.save()
    return draft
  }
  setDraftStatus(id: string, status: DraftStatus, metrics?: DraftMetrics): Draft {
    const draft = this.data.drafts.find(d => d.id === id)
    if (draft === undefined) throw new MatrixStoreError(`草稿不存在：${id}`)
    draft.status = status
    if (metrics !== undefined) draft.metrics = metrics
    this.save()
    return draft
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/store.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/store.ts packages/dsh-xhs-matrix/tests/store.test.ts
git commit -m "feat: 私有 JSON 存储层（原子写 + 格式版本 + 全 CRUD）"
```

---

### Task 4: 事件与协议常量

**Files:**
- Create: `packages/dsh-xhs-matrix/src/events.ts`
- Create: `packages/dsh-xhs-matrix/src/protocol.ts`
- Test: `packages/dsh-xhs-matrix/tests/events.test.ts`

**Interfaces:**
- Consumes: `types.ts`（`DraftMetrics`）。
- Produces:
  - `events.ts`：`export interface XhsFeedbackEvent { draftId: string; accountId: string; metrics: DraftMetrics }`、`export interface Events { 'xhs/feedback': XhsFeedbackEvent }`、`export function emitFeedback(ctx: Context, event: XhsFeedbackEvent): void`。
  - `protocol.ts`：`export const XHS_API_BASE = '/api/dsh-xhs-matrix'`、`export const XHS_API = { accounts, personas, topics, negatives, drafts }`（Client 与路由共享的字面量）。

- [ ] **Step 1: 写失败的测试**

```ts
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { emitFeedback, type XhsFeedbackEvent } from '../src/events.ts'

describe('xhs/feedback 事件', () => {
  it('发射携带 draftId/accountId/metrics', () => {
    const ctx = new Context()
    const received: XhsFeedbackEvent[] = []
    ctx.on('xhs/feedback', (event: XhsFeedbackEvent) => { received.push(event) })
    const event: XhsFeedbackEvent = {
      draftId: 'd1',
      accountId: 'acc-a',
      metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' },
    }
    emitFeedback(ctx, event)
    expect(received).toHaveLength(1)
    expect(received[0].draftId).toBe('d1')
    expect(received[0].metrics.reads).toBe(50)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/events.test.ts`
Expected: FAIL（`../src/events.ts` 不存在）。

- [ ] **Step 3: 写实现（events.ts + protocol.ts）**

`src/events.ts`：

```ts
/** xhs/feedback 事件：草稿标记 published 且携带 metrics 时发射（进化闭环挂点）。 */

import type { Context } from '@deepseek-ai/cordis'
import type { DraftMetrics } from './types.ts'

/** 反馈事件载荷。 */
export interface XhsFeedbackEvent {
  draftId: string
  accountId: string
  metrics: DraftMetrics
}

/** 本插件声明的事件表。 */
export interface Events {
  'xhs/feedback': XhsFeedbackEvent
}

/** 发射反馈事件。 */
export function emitFeedback(ctx: Context, event: XhsFeedbackEvent): void {
  ctx.emit('xhs/feedback', event)
}
```

`src/protocol.ts`：

```ts
/** Client 与路由共享的 API 路径字面量。 */

export const XHS_API_BASE = '/api/dsh-xhs-matrix' as const

export const XHS_API = {
  accounts: XHS_API_BASE + '/accounts',
  personas: XHS_API_BASE + '/personas',
  topics: XHS_API_BASE + '/topics',
  negatives: XHS_API_BASE + '/negatives',
  drafts: XHS_API_BASE + '/drafts',
} as const
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/events.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/events.ts packages/dsh-xhs-matrix/src/protocol.ts packages/dsh-xhs-matrix/tests/events.test.ts
git commit -m "feat: xhs/feedback 事件与 API 路径常量"
```

---

### Task 5: Host 装配与路由族

**Files:**
- Create: `packages/dsh-xhs-matrix/src/loopback.ts`
- Create: `packages/dsh-xhs-matrix/src/routes.ts`
- Create: `packages/dsh-xhs-matrix/src/index.ts`
- Test: `packages/dsh-xhs-matrix/tests/routes.test.ts`

**Interfaces:**
- Consumes: `MatrixStore`（Task 3）、`XHS_API`（Task 4）、`@deepseek-ai/dsh-host-webserver` 的 `WebRoute`、`@deepseek-ai/dsh-settings` 的 `installSettingsSection`/`settingsNamespace`。
- Produces:
  - `loopback.ts`：`isLoopbackRequest(req: IncomingMessage): boolean`（复制模板实现）。
  - `routes.ts`：`makeRoutes(deps: { store: MatrixStore }): WebRoute[]`（账号/人设/选题/黑名单/草稿五组 exact 路由）。
  - `index.ts`：`export const name = 'xhs-matrix'`、`inject = ['webServer', 'tools', 'systemPrompt']`、`Config`（schemastery：`selectionStrategy`、`locale`、`announceToAgent`、`enabled`）、`apply(ctx, config)`（store 生命周期、路由注册、settings 集成、系统提示词、工具注册占位——工具在 Task 6 补入）。

- [ ] **Step 1: 写失败的测试（路由经真实 http 服务器 + loopback 围栏）**

```ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeRoutes } from '../src/routes.ts'
import { MatrixStore } from '../src/store.ts'

let server: Server
let base: string
let store: MatrixStore

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-routes-'))
  store = new MatrixStore(join(dir, 'xhs.json'))
  const routes = makeRoutes({ store })
  server = createServer((req, res) => {
    const route = routes.find(r => r.kind === 'exact' && r.path === (new URL(req.url ?? '/', 'http://localhost').pathname))
    if (route === undefined) { res.writeHead(404); res.end('not found'); return }
    route.handler(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})

afterEach(() => { server.close() })

async function json(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(base + path, init)
  const body = await response.json().catch(() => undefined)
  return { status: response.status, body }
}

describe('/api/dsh-xhs-matrix 路由', () => {
  it('账号 CRUD', async () => {
    const created = await json('/api/dsh-xhs-matrix/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '账号A', personaId: 'p1', enabled: true }),
    })
    expect(created.status).toBe(201)
    const id = (created.body as { account: { id: string } }).account.id
    const listed = await json('/api/dsh-xhs-matrix/accounts')
    expect((listed.body as { accounts: unknown[] }).accounts).toHaveLength(1)
    const updated = await json('/api/dsh-xhs-matrix/accounts?account=' + id, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '账号B', personaId: 'p1', enabled: false }),
    })
    expect(updated.status).toBe(200)
    const deleted = await json('/api/dsh-xhs-matrix/accounts?account=' + id, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
  })

  it('校验失败返回 400 + 中文诊断', async () => {
    const res = await json('/api/dsh-xhs-matrix/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', personaId: 'p1', enabled: true }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('账号名')
  })

  it('批量导入选题', async () => {
    const res = await json('/api/dsh-xhs-matrix/topics', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles: ['通勤穿搭', '秋季护肤'] }),
    })
    expect(res.status).toBe(201)
    expect((res.body as { topics: unknown[] }).topics).toHaveLength(2)
  })

  it('草稿状态回填后存储可见', async () => {
    const [topic] = (await json('/api/dsh-xhs-matrix/topics', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles: ['通勤穿搭'] }),
    })).body as unknown as { topics: { id: string }[] }
    const draftRes = await json('/api/dsh-xhs-matrix/drafts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' }),
    })
    const draftId = (draftRes.body as { draft: { id: string } }).draft.id
    const statusRes = await json('/api/dsh-xhs-matrix/drafts/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId, status: 'published', metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' } }),
    })
    expect(statusRes.status).toBe(200)
    expect(store.listDrafts()[0].metrics?.reads).toBe(50)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/routes.test.ts`
Expected: FAIL（`../src/routes.ts` 不存在）。

- [ ] **Step 3: 写实现（loopback.ts，复制模板实现）**

```ts
/** Loopback 信任围栏：socket 地址、Host 头、浏览器同源标记（复制 dsh-ssh 同款实现）。 */

import type { IncomingMessage } from 'node:http'

function isIPv4Loopback(v4: string): boolean {
  const parts = v4.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false
  const normalized = address.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isIPv4Loopback(normalized.slice('::ffff:'.length))
  return isIPv4Loopback(normalized)
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  return isIPv4Loopback(hostname)
}

/** 请求级信任围栏：loopback socket + loopback Host + 非跨站。 */
export function isLoopbackRequest(request: IncomingMessage): boolean {
  if (!isLoopbackAddress(request.socket.remoteAddress)) return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}
```

- [ ] **Step 4: 写实现（routes.ts，五组 exact 路由）**

```ts
/** /api/dsh-xhs-matrix 路由族：账号/人设/选题/黑名单/草稿 CRUD。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback.ts'
import { XHS_API } from './protocol.ts'
import { MatrixStore, type AccountPayload, type DraftPayload, type NegativePayload, type PersonaPayload } from './store.ts'
import type { DraftMetrics, DraftStatus } from './types.ts'

/** JSON 请求体上限。 */
const MAX_JSON_BODY_BYTES = 256 * 1024

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null ? undefined : value
}

/** 围栏 + 方法检查。 */
function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return false
  }
  if (req.method !== method) {
    writeJson(res, 405, { error: `method not allowed: ${req.method}` })
    return false
  }
  return true
}

/** 路由族依赖。 */
export interface RoutesDeps {
  store: MatrixStore
}

/**
 * 构建全部 /api/dsh-xhs-matrix 路由。
 * @param deps - 存储。
 * @returns 路由数组。
 */
export function makeRoutes(deps: RoutesDeps): WebRoute[] {
  const { store } = deps

  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })

  const fail = (res: ServerResponse, error: unknown): void => {
    writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }

  return [
    // ------------------------------------------------------------ 账号
    route(XHS_API.accounts, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { accounts: store.listAccounts() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'account')
      try {
        if (method === 'POST') {
          const account = store.upsertAccount(body as unknown as AccountPayload)
          writeJson(res, 201, { account })
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
          const account = store.upsertAccount(body as unknown as AccountPayload, id)
          writeJson(res, 200, { account })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
          store.deleteAccount(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 人设
    route(XHS_API.personas, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { personas: store.listPersonas() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'persona')
      try {
        if (method === 'POST') {
          const persona = store.upsertPersona(body as unknown as PersonaPayload)
          writeJson(res, 201, { persona })
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'persona 查询参数必填' }); return }
          writeJson(res, 200, { persona: store.upsertPersona(body as unknown as PersonaPayload, id) })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'persona 查询参数必填' }); return }
          store.deletePersona(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 选题
    route(XHS_API.topics, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { topics: store.listTopics() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'topic')
      try {
        if (method === 'POST') {
          if (typeof body.title === 'string') {
            const topics = store.addTopics([body.title])
            writeJson(res, 201, { topics })
          } else if (Array.isArray(body.titles) && body.titles.every(t => typeof t === 'string')) {
            writeJson(res, 201, { topics: store.addTopics(body.titles as string[]) })
          } else {
            writeJson(res, 400, { error: 'body 需含 title 字符串或 titles 字符串数组' })
          }
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'topic 查询参数必填' }); return }
          store.retireTopic(id)
          writeJson(res, 200, { ok: true })
        } else if (method === 'DELETE') {
          writeJson(res, 405, { error: '选题不支持删除，请用 PATCH 标记弃用' })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 黑名单
    route(XHS_API.negatives, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { negatives: store.listNegatives() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'negative')
      try {
        if (method === 'POST') {
          writeJson(res, 201, { negative: store.addNegative(body as unknown as NegativePayload) })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'negative 查询参数必填' }); return }
          store.deleteNegative(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 草稿
    route(XHS_API.drafts, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { drafts: store.listDrafts() }); return }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      try {
        const draft = store.saveDraft(body as unknown as DraftPayload)
        store.markTopicUsed(draft.topicId, draft.id)
        writeJson(res, 201, { draft })
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------- 草稿状态回填
    route(XHS_API.drafts + '/status', async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const draftId = typeof body.draftId === 'string' ? body.draftId : ''
      const status = body.status as DraftStatus | undefined
      const metrics = body.metrics as DraftMetrics | undefined
      if (draftId === '' || (status !== 'generated' && status !== 'published' && status !== 'dropped')) {
        writeJson(res, 400, { error: 'draftId 与合法 status 必填' })
        return
      }
      try {
        const draft = store.setDraftStatus(draftId, status, metrics)
        writeJson(res, 200, { draft })
      } catch (error) {
        fail(res, error)
      }
    }),
  ]
}
```

> 注：`xhs/feedback` 事件的发射放在工具 `xhs_draft_status`（Task 6）中，路由回填只落存储。

- [ ] **Step 5: 写实现（index.ts，Host 入口）**

```ts
/** dsh-xhs-matrix — Host 半。装配存储、/api/dsh-xhs-matrix 路由族、agent 工具与系统提示词。 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import z from 'schemastery'
import { makeRoutes } from './routes.ts'
import { MatrixStore } from './store.ts'

/** 稳定插件名。 */
export const name = 'xhs-matrix'

/** 需要的服务。 */
export const inject = ['webServer', 'tools', 'systemPrompt']

/** 设置命名空间。 */
export const XHS_SETTINGS_NAMESPACE = settingsNamespace('dsh-xhs-matrix')

/** 插件配置。 */
export interface Config {
  selectionStrategy?: 'fifo' | 'random'
  locale?: string
  announceToAgent?: boolean
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  selectionStrategy: z.enum(['fifo', 'random']).default('fifo'),
  locale: z.string().default('zh-CN'),
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

const DEFAULT_SELECTION = 'fifo'

/** 模型可见公告。 */
export const XHS_GUIDANCE = '本机已安装 dsh-xhs-matrix 插件（小红书矩阵内容管理）：侧边栏「矩阵」入口管理账号、人设、选题、黑名单与草稿。能力：xhs_today 按账号人设生成创作简报（选题 + 黑名单约束）供你撰写文案；xhs_draft_save 持久化草稿（同账号当日同选题去重）；xhs_topic_add / xhs_negative_add 管理选题池与黑名单；xhs_accounts 查询账号与人设；xhs_draft_status 回填发布状态与阅读量指标（触发 xhs/feedback 事件）。用户提到「今天要发什么 / 小红书 / 矩阵 / 选题」时即指本插件。'

/**
 * 挂载存储、路由、工具与公告。
 * @param ctx - host 上下文（webServer/tools/systemPrompt）。
 * @param config - 插件配置。
 */
export function apply(ctx: Context, config?: Config): void {
  let current: () => Config = () => config ?? {}
  const resolve = (): Config => ({
    selectionStrategy: current().selectionStrategy ?? DEFAULT_SELECTION,
    locale: current().locale ?? 'zh-CN',
    announceToAgent: current().announceToAgent ?? true,
    enabled: current().enabled ?? true,
  })

  const store = new MatrixStore()
  store.load()

  let disposeRoutes: (() => void) | undefined
  let disposeTools: (() => void) | undefined
  let disposeSection: (() => void) | undefined

  const sync = (): void => {
    if (disposeSection !== undefined) { disposeSection(); disposeSection = undefined }
    if (disposeRoutes !== undefined) { disposeRoutes(); disposeRoutes = undefined }
    if (disposeTools !== undefined) { disposeTools(); disposeTools = undefined }
    const value = resolve()
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-xhs-matrix',
        order: 150,
        text: XHS_GUIDANCE,
      })
    }
    disposeRoutes = ctx.effect(
      () => {
        const disposers = makeRoutes({ store }).map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-xhs-matrix: routes',
    )
    // 工具在 Task 6 补入：disposeTools = ctx.effect(... ctx.tools.register(...) ...)
  }

  installSettingsSection(ctx, XHS_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => { current = source; sync() },
    onChange: sync,
  })

  sync()
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm vitest run tests/routes.test.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/loopback.ts packages/dsh-xhs-matrix/src/routes.ts packages/dsh-xhs-matrix/src/index.ts packages/dsh-xhs-matrix/tests/routes.test.ts
git commit -m "feat: Host 装配、loopback 围栏与 /api/dsh-xhs-matrix 路由族"
```

---

### Task 6: 工具族（7 个模型工具）

**Files:**
- Create: `packages/dsh-xhs-matrix/src/tools.ts`
- Modify: `packages/dsh-xhs-matrix/src/index.ts`（在 sync() 中挂载工具）
- Test: `packages/dsh-xhs-matrix/tests/tools.test.ts`

**Interfaces:**
- Consumes: `MatrixStore`（Task 3）、`filterTopics`/`selectTopic`/`matchesNegative`（Task 2）、`composeBrief`（Task 2）、`emitFeedback`（Task 4）、`defineTool`（`@deepseek-ai/dsh-tools`）、`ContentBlock`（`@deepseek-ai/dsh-llm`）。
- Produces: `makeTools(deps: { store: MatrixStore; ctx: Context }): ToolLike[]`（7 个 defineTool 产物：`xhs_today`、`xhs_draft_save`、`xhs_topics`、`xhs_topic_add`、`xhs_negative_add`、`xhs_accounts`、`xhs_draft_status`）。每个工具返回 `{ ok: boolean; message: string; ...data }`；错误场景 message 给出中文诊断。

- [ ] **Step 1: 写失败的测试**

```ts
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeTools } from '../src/tools.ts'
import { MatrixStore } from '../src/store.ts'

function newStore(): MatrixStore {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-tools-'))
  return new MatrixStore(join(dir, 'xhs.json'))
}

interface ExecStub { ctx: unknown }
const execStub: ExecStub = { ctx: undefined }

async function call(tool: ReturnType<ReturnType<typeof makeTools>[number]['execute'] extends never ? never : number> extends never ? never : any, args: unknown): Promise<any> {
  return tool.execute(args, execStub)
}

describe('xhs 工具族', () => {
  it('xhs_today：无账号时给出中文诊断', async () => {
    const store = newStore()
    const [today] = makeTools({ store, ctx: {} as any })
    const result = await today.execute({}, execStub)
    expect(result.ok).toBe(false)
    expect(result.message).toContain('账号')
  })

  it('xhs_today：生成创作简报', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业、数据支撑' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    store.addTopics(['通勤穿搭'])
    store.addNegative({ keyword: '美妆', reason: '上次没流量' })
    const [today] = makeTools({ store, ctx: {} as any })
    const result = await today.execute({}, execStub)
    expect(result.ok).toBe(true)
    expect(result.briefs[0]).toContain('账号A')
    expect(result.briefs[0]).toContain('干货风')
    expect(result.briefs[0]).toContain('通勤穿搭')
    expect(result.briefs[0]).toContain('美妆')
  })

  it('xhs_today：今日已发则跳过该账号', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const draft = store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: new Date().toISOString().slice(0, 10), copy: 'c', coverPrompt: 'p' })
    const [today] = makeTools({ store, ctx: {} as any })
    const result = await today.execute({}, execStub)
    expect(result.message).toContain('已发')
  })

  it('xhs_draft_save：同账号当日同选题去重', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const [saveTool] = makeTools({ store, ctx: {} as any }).slice(1, 2)
    const first = await saveTool.execute({ topicId: topic.id, accountId: 'acc-a', copy: 'c1', coverPrompt: 'p1' }, execStub)
    expect(first.ok).toBe(true)
    const second = await saveTool.execute({ topicId: topic.id, accountId: 'acc-a', copy: 'c2', coverPrompt: 'p2' }, execStub)
    expect(second.ok).toBe(false)
    expect(second.message).toContain('已存在')
    const forced = await saveTool.execute({ topicId: topic.id, accountId: 'acc-a', copy: 'c3', coverPrompt: 'p3', force: true }, execStub)
    expect(forced.ok).toBe(true)
  })

  it('xhs_topic_add：批量导入', async () => {
    const store = newStore()
    const tools = makeTools({ store, ctx: {} as any })
    const addTool = tools.find(t => t.name === 'xhs_topic_add')!
    const result = await addTool.execute({ titles: ['通勤穿搭', '秋季护肤'] }, execStub)
    expect(result.ok).toBe(true)
    expect(store.listTopics()).toHaveLength(2)
  })

  it('xhs_negative_add：账号级与全局', async () => {
    const store = newStore()
    const tools = makeTools({ store, ctx: {} as any })
    const addTool = tools.find(t => t.name === 'xhs_negative_add')!
    const global = await addTool.execute({ keyword: '美妆', reason: '没流量' }, execStub)
    expect(global.ok).toBe(true)
    const scoped = await addTool.execute({ keyword: '测评', reason: '不涨粉', accountId: 'acc-a' }, execStub)
    expect(scoped.ok).toBe(true)
    expect(store.listNegatives()).toHaveLength(2)
  })

  it('xhs_draft_status：published + metrics 触发反馈事件', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const draft = store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    const received: unknown[] = []
    const ctx = { on: (_name: string, fn: (e: unknown) => void) => { received.push(fn) } } as any
    const tools = makeTools({ store, ctx })
    const statusTool = tools.find(t => t.name === 'xhs_draft_status')!
    const result = await statusTool.execute({ draftId: draft.id, status: 'published', metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' } }, execStub)
    expect(result.ok).toBe(true)
    expect(received).toHaveLength(1)
  })

  it('xhs_accounts：列出账号与人设', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const tools = makeTools({ store, ctx: {} as any })
    const accountsTool = tools.find(t => t.name === 'xhs_accounts')!
    const result = await accountsTool.execute({}, execStub)
    expect(result.ok).toBe(true)
    expect(result.accounts[0].name).toBe('账号A')
    expect(result.personas[0].name).toBe('干货风')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/tools.test.ts`
Expected: FAIL（`../src/tools.ts` 不存在）。

- [ ] **Step 3: 写实现（tools.ts）**

```ts
/** Agent 工具族：xhs_today 决策流 + 草稿/选题/黑名单/账号操作。所有工具返回 { ok, message, ...data }。 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { composeBrief } from './composer.ts'
import { filterTopics, selectTopic } from './decision.ts'
import { emitFeedback } from './events.ts'
import { MatrixStore } from './store.ts'
import type { DraftMetrics, DraftStatus } from './types.ts'

function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** 工具依赖。 */
export interface ToolsDeps {
  store: MatrixStore
  ctx: Context
}

/** 渲染一条工具结果。 */
function render(result: { ok: boolean; message: string; [key: string]: unknown }): ContentBlock[] {
  const lines = [result.ok ? '✅ ' : '⚠️ ' + result.message]
  if (result.ok && result.message !== '') lines[0] = result.message
  return text(lines.join('\n'))
}

/**
 * 构建 7 个模型工具。
 * @param deps - 存储与上下文。
 * @returns 工具定义数组。
 */
export function makeTools(deps: ToolsDeps) {
  const { store, ctx } = deps

  /** 今日日期（YYYY-MM-DD，本地时区）。 */
  const today = (): string => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  const accountsOf = (): { id: string; name: string; personaId: string; enabled: boolean }[] => {
    return store.listAccounts().filter(a => a.enabled)
  }

  const personaOf = (personaId: string) => store.listPersonas().find(p => p.id === personaId)

  const toolToday = defineTool({
    name: 'xhs_today',
    description: '今日决策：为每个（或指定）未发账号生成创作简报（人设 + 选题 + 黑名单约束）。' +
      '简报返回后，直接按简报撰写小红书文案（标题 + 正文 + 话题标签）与封面提示词，再用 xhs_draft_save 保存。' +
      '触发词：今天要发什么、选题、小红书矩阵。',
    parameters: {
      account: { type: 'string', description: '账号 id（省略则处理全部启用账号）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          briefs: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => render(value),
    },
    isConcurrencySafe: () => true,
    async execute(args: { account?: string }, _exec: unknown) {
      const accounts = args.account !== undefined
        ? accountsOf().filter(a => a.id === args.account)
        : accountsOf()
      if (accounts.length === 0) {
        return { ok: false, message: '未配置启用账号：请先在「矩阵」面板创建账号并分配人设。', briefs: [] }
      }
      const todayDrafts = store.listDrafts().filter(d => d.date === today())
      const negatives = store.listNegatives()
      const briefs: string[] = []
      const skipped: string[] = []
      for (const account of accounts) {
        const persona = personaOf(account.personaId)
        if (persona === undefined) {
          skipped.push(`${account.name}（未分配人设）`)
          continue
        }
        const candidates = filterTopics(store.listTopics(), negatives, account.id, todayDrafts)
        const topic = selectTopic(candidates, 'fifo')
        if (topic === undefined) {
          skipped.push(`${account.name}（选题池为空或全部被黑名单/已用排除）`)
          continue
        }
        briefs.push(composeBrief(account, persona, topic, negatives))
      }
      if (briefs.length === 0) {
        const detail = skipped.length > 0 ? `：${skipped.join('，')}` : ''
        return { ok: false, message: `今日无可生成内容${detail}。请补充选题或检查黑名单。`, briefs: [] }
      }
      const message = skipped.length > 0
        ? `已生成 ${briefs.length} 份创作简报（跳过：${skipped.join('；')}）`
        : `已生成 ${briefs.length} 份创作简报`
      return { ok: true, message, briefs }
    },
  })

  const toolDraftSave = defineTool({
    name: 'xhs_draft_save',
    description: '保存草稿：按 xhs_today 简报撰写的文案与封面提示词落库，并把选题标记为已用。' +
      '同账号 + 当日 + 同选题已存在时拒绝（除非 force: true 覆盖）。',
    parameters: {
      accountId: { type: 'string', required: true, description: '账号 id' },
      topicId: { type: 'string', required: true, description: '选题 id' },
      copy: { type: 'string', required: true, description: '完整文案（标题 + 正文 + 话题标签）' },
      coverPrompt: { type: 'string', required: true, description: '封面提示词' },
      force: { type: 'boolean', description: '同账号当日同选题已存在时强制覆盖' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          draftId: { type: 'string', required: true },
        },
      },
      render: (_args, value) => render(value),
    },
    async execute(args: { accountId: string; topicId: string; copy: string; coverPrompt: string; force?: boolean }, _exec: unknown) {
      const date = today()
      const existing = store.findDraft(args.accountId, date, args.topicId)
      if (existing !== undefined && args.force !== true) {
        return { ok: false, message: `该账号当日已存在同选题草稿（${existing.id}），如确需覆盖请传 force: true。`, draftId: existing.id }
      }
      const draft = store.saveDraft({ accountId: args.accountId, topicId: args.topicId, date, copy: args.copy, coverPrompt: args.coverPrompt })
      store.markTopicUsed(args.topicId, draft.id)
      return { ok: true, message: `草稿已保存：${draft.id}（${date}）`, draftId: draft.id }
    },
  })

  const toolTopics = defineTool({
    name: 'xhs_topics',
    description: '查询选题池（按状态过滤：open/used/retired）。',
    parameters: {
      status: { type: 'string', description: '选题状态过滤' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          topics: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => render(value),
    },
    isConcurrencySafe: () => true,
    async execute(args: { status?: string }, _exec: unknown) {
      const topics = store.listTopics().filter(t => args.status === undefined || t.status === args.status)
      const lines = topics.length === 0
        ? ['选题池为空']
        : topics.map(t => `${t.id}\t${t.status}\t${t.title}`)
      return { ok: true, message: lines.join('\n'), topics: lines }
    },
  })

  const toolTopicAdd = defineTool({
    name: 'xhs_topic_add',
    description: '向选题池添加选题（单个 title 或批量 titles）。手动选题是感知层的模拟入口。',
    parameters: {
      title: { type: 'string', description: '单个选题标题' },
      titles: { type: 'array', items: { type: 'string' }, description: '批量选题标题' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          topics: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => render(value),
    },
    async execute(args: { title?: string; titles?: string[] }, _exec: unknown) {
      const titles = args.titles !== undefined ? args.titles : (args.title !== undefined ? [args.title] : [])
      if (titles.length === 0) return { ok: false, message: '请提供 title 或 titles。', topics: [] }
      const created = store.addTopics(titles)
      return { ok: true, message: `已添加 ${created.length} 个选题`, topics: created.map(t => `${t.id}\t${t.title}`) }
    },
  })

  const toolNegativeAdd = defineTool({
    name: 'xhs_negative_add',
    description: '添加黑名单条目（accountId 省略为全局；命中关键词的选题将不会出现在创作简报中）。',
    parameters: {
      keyword: { type: 'string', required: true, description: '黑名单关键词' },
      reason: { type: 'string', required: true, description: '原因，如「上次没流量」' },
      accountId: { type: 'string', description: '账号 id（省略 = 全局）' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          negativeId: { type: 'string', required: true },
        },
      },
      render: (_args, value) => render(value),
    },
    async execute(args: { keyword: string; reason: string; accountId?: string }, _exec: unknown) {
      const negative = store.addNegative({ keyword: args.keyword, reason: args.reason, accountId: args.accountId })
      const scope = args.accountId === undefined ? '全局' : args.accountId
      return { ok: true, message: `已添加${scope}黑名单「${args.keyword}」（${args.reason}）`, negativeId: negative.id }
    },
  })

  const toolAccounts = defineTool({
    name: 'xhs_accounts',
    description: '查询账号与人设清单（只读；账号/人设的增删改请在「矩阵」面板进行）。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          accounts: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' }, personaId: { type: 'string' }, enabled: { type: 'boolean' } } } },
          personas: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' } } } },
        },
      },
      render: (_args, value) => render(value),
    },
    isConcurrencySafe: () => true,
    async execute(_args: unknown, _exec: unknown) {
      const accounts = store.listAccounts().map(a => ({ id: a.id, name: a.name, personaId: a.personaId, enabled: a.enabled }))
      const personas = store.listPersonas().map(p => ({ id: p.id, name: p.name }))
      const message = accounts.length === 0 ? '未配置账号' : accounts.map(a => `${a.id}\t${a.name}\t人设:${a.personaId}\t${a.enabled ? '启用' : '停用'}`).join('\n')
      return { ok: true, message, accounts, personas }
    },
  })

  const toolDraftStatus = defineTool({
    name: 'xhs_draft_status',
    description: '回填草稿发布状态与流量指标：标记 published（可带阅读量/点赞/评论）或 dropped。' +
      'published + metrics 会触发 xhs/feedback 事件（进化闭环数据源）。',
    parameters: {
      draftId: { type: 'string', required: true, description: '草稿 id' },
      status: { type: 'string', required: true, enum: ['published', 'dropped'], description: '发布 / 弃用' },
      metrics: {
        type: 'object',
        description: '流量指标（published 时建议提供）',
        properties: {
          reads: { type: 'number', required: true },
          likes: { type: 'number', required: true },
          comments: { type: 'number', required: true },
          collected: { type: 'string', required: true, description: '采集时间 ISO' },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          draftId: { type: 'string', required: true },
        },
      },
      render: (_args, value) => render(value),
    },
    async execute(args: { draftId: string; status: 'published' | 'dropped'; metrics?: DraftMetrics }, _exec: unknown) {
      const draft = store.setDraftStatus(args.draftId, args.status as DraftStatus, args.metrics)
      if (args.status === 'published' && args.metrics !== undefined) {
        emitFeedback(ctx, { draftId: draft.id, accountId: draft.accountId, metrics: args.metrics })
      }
      return { ok: true, message: `草稿 ${draft.id} 已标记为 ${args.status === 'published' ? '已发布' : '已弃用'}` + (args.metrics !== undefined ? `（阅读 ${args.metrics.reads}）` : ''), draftId: draft.id }
    },
  })

  return [toolToday, toolDraftSave, toolTopics, toolTopicAdd, toolNegativeAdd, toolAccounts, toolDraftStatus]
}
```

- [ ] **Step 4: 在 index.ts 挂载工具**

将 `src/index.ts` 的 `sync()` 中注释行替换为：

```ts
    disposeTools = ctx.effect(
      () => {
        const disposers = makeTools({ store, ctx }).map(tool => ctx.tools.register(tool))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-xhs-matrix: tools',
    )
```

并在文件顶部 import 处补：`import { makeTools } from './tools.ts'`。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run tests/tools.test.ts && pnpm typecheck`
Expected: PASS + 类型检查通过。

- [ ] **Step 6: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/tools.ts packages/dsh-xhs-matrix/src/index.ts packages/dsh-xhs-matrix/tests/tools.test.ts
git commit -m "feat: 7 个模型工具（今日决策流 + 草稿/选题/黑名单/账号 + 反馈事件）"
```

---

### Task 7: Client 数据通道与控制器

**Files:**
- Create: `packages/dsh-xhs-matrix/src/client/api.ts`
- Create: `packages/dsh-xhs-matrix/src/client/controller.ts`
- Test: `packages/dsh-xhs-matrix/tests/client-api.test.ts`

**Interfaces:**
- Consumes: `XHS_API`（Task 4）；`types.ts` 实体。
- Produces:
  - `api.ts`：`export class XhsApi`（`listAccounts/createAccount/updateAccount/deleteAccount/listPersonas/createPersona/updatePersona/deletePersona/listTopics/addTopic/importTopics/retireTopic/listNegatives/addNegative/deleteNegative/listDrafts/setDraftStatus`）、`export class XhsApiError extends Error`。
  - `controller.ts`：`export class PanelController`（`panelOpen` 状态、`getSnapshot(): { panelOpen: boolean }`、`toggle()/close()/open()`、`subscribe(fn): () => void`）+ 跨插件激活：`ACTIVATE_EVENT = 'dsh-panel-activate'`、`PANEL_NAME = 'xhsmatrix'`、`OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active']`、`ACTIVE_ATTR = 'data-dsh-xhsmatrix-active'`。

- [ ] **Step 1: 写失败的测试（api 客户端，mock fetch）**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { XhsApi, XhsApiError } from '../src/client/api.ts'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => { fetchMock.mockReset() })

describe('XhsApi', () => {
  it('listAccounts 调用正确路径', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accounts: [{ id: 'a1', name: '账号A' }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const api = new XhsApi()
    const accounts = await api.listAccounts()
    expect(accounts[0].name).toBe('账号A')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/dsh-xhs-matrix/accounts')
  })

  it('createAccount 发送 JSON body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ account: { id: 'a1' } }), { status: 201 }))
    const api = new XhsApi()
    await api.createAccount({ name: '账号A', personaId: 'p1', enabled: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string).name).toBe('账号A')
  })

  it('业务错误抛出 XhsApiError 并带中文消息', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: '账号名必填' }), { status: 400 }))
    const api = new XhsApi()
    await expect(api.createAccount({ name: '', personaId: 'p1', enabled: true })).rejects.toThrow(XhsApiError)
    await expect(api.createAccount({ name: '', personaId: 'p1', enabled: true })).rejects.toThrow('账号名必填')
  })

  it('setDraftStatus 透传 metrics', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ draft: { id: 'd1' } }), { status: 200 }))
    const api = new XhsApi()
    await api.setDraftStatus('d1', 'published', { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.status).toBe('published')
    expect(body.metrics.reads).toBe(50)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run tests/client-api.test.ts`
Expected: FAIL（`../src/client/api.ts` 不存在）。

- [ ] **Step 3: 写实现（api.ts + controller.ts）**

`src/client/api.ts`：

```ts
/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */

import { XHS_API } from '../protocol.ts'
import type { DraftMetrics, DraftStatus } from '../types.ts'
import type { AccountPayload, NegativePayload, PersonaPayload } from '../store.ts'

/** 携带路由 JSON 错误消息的客户端错误。 */
export class XhsApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XhsApiError'
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new XhsApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${response.status}`
    throw new XhsApiError(message)
  }
  return body as T
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : '?' + text
}

/** 面板数据入口。 */
export class XhsApi {
  // ------------------------------------------------------------ 账号
  async listAccounts(): Promise<Array<{ id: string; name: string; personaId: string; enabled: boolean; createdAt: string }>> {
    const body = await readJson<{ accounts: Array<{ id: string; name: string; personaId: string; enabled: boolean; createdAt: string }> }>(await fetch(XHS_API.accounts))
    return body.accounts
  }
  async createAccount(payload: AccountPayload): Promise<{ id: string }> {
    const body = await readJson<{ account: { id: string } }>(await fetch(XHS_API.accounts, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return body.account
  }
  async updateAccount(id: string, payload: AccountPayload): Promise<{ id: string }> {
    const body = await readJson<{ account: { id: string } }>(await fetch(XHS_API.accounts + query({ account: id }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return body.account
  }
  async deleteAccount(id: string): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.accounts + query({ account: id }), { method: 'DELETE' }))
  }

  // ------------------------------------------------------------ 人设
  async listPersonas(): Promise<Array<{ id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string }>> {
    const body = await readJson<{ personas: Array<{ id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string }> }>(await fetch(XHS_API.personas))
    return body.personas
  }
  async createPersona(payload: PersonaPayload): Promise<{ id: string }> {
    const body = await readJson<{ persona: { id: string } }>(await fetch(XHS_API.personas, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return body.persona
  }
  async updatePersona(id: string, payload: PersonaPayload): Promise<{ id: string }> {
    const body = await readJson<{ persona: { id: string } }>(await fetch(XHS_API.personas + query({ persona: id }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return body.persona
  }
  async deletePersona(id: string): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.personas + query({ persona: id }), { method: 'DELETE' }))
  }

  // ------------------------------------------------------------ 选题
  async listTopics(): Promise<Array<{ id: string; title: string; status: string; createdAt: string }>> {
    const body = await readJson<{ topics: Array<{ id: string; title: string; status: string; createdAt: string }> }>(await fetch(XHS_API.topics))
    return body.topics
  }
  async addTopic(title: string): Promise<void> {
    await readJson<{ topics: unknown[] }>(await fetch(XHS_API.topics, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) }))
  }
  async importTopics(titles: string[]): Promise<number> {
    const body = await readJson<{ topics: unknown[] }>(await fetch(XHS_API.topics, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titles }) }))
    return body.topics.length
  }
  async retireTopic(id: string): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.topics + query({ topic: id }), { method: 'PATCH' }))
  }

  // ------------------------------------------------------------ 黑名单
  async listNegatives(): Promise<Array<{ id: string; accountId?: string; keyword: string; reason: string }>> {
    const body = await readJson<{ negatives: Array<{ id: string; accountId?: string; keyword: string; reason: string }> }>(await fetch(XHS_API.negatives))
    return body.negatives
  }
  async addNegative(payload: NegativePayload): Promise<void> {
    await readJson<{ negative: unknown }>(await fetch(XHS_API.negatives, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
  }
  async deleteNegative(id: string): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.negatives + query({ negative: id }), { method: 'DELETE' }))
  }

  // ------------------------------------------------------------ 草稿
  async listDrafts(): Promise<Array<{ id: string; accountId: string; topicId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }>> {
    const body = await readJson<{ drafts: Array<{ id: string; accountId: string; topicId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }> }>(await fetch(XHS_API.drafts))
    return body.drafts
  }
  async setDraftStatus(draftId: string, status: 'published' | 'dropped', metrics?: DraftMetrics): Promise<void> {
    await readJson<{ draft: unknown }>(await fetch(XHS_API.drafts + '/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId, status, metrics }) }))
  }
}
```

`src/client/controller.ts`：

```ts
/** 面板开合状态 + 跨插件中栏互斥（与 dsh-task-board / dsh-ssh 共享激活协议）。 */

/** 跨插件激活事件名。 */
export const ACTIVATE_EVENT = 'dsh-panel-activate'
/** 本面板名。 */
export const PANEL_NAME = 'xhsmatrix'
/** 本面板激活属性。 */
export const ACTIVE_ATTR = 'data-dsh-xhsmatrix-active'
/** 需驱逐的兄弟面板激活属性。 */
export const OTHER_ACTIVE_ATTRS = ['data-dsh-taskboard-active', 'data-dsh-ssh-active']

/** 面板状态快照。 */
export interface PanelSnapshot {
  panelOpen: boolean
}

/** 面板控制器。 */
export class PanelController {
  private open = false
  private readonly listeners = new Set<() => void>()

  getSnapshot(): PanelSnapshot {
    return { panelOpen: this.open }
  }

  toggle(): void {
    if (this.open) this.close()
    else this.openPanel()
  }

  openPanel(): void {
    if (this.open) return
    this.open = true
    this.notify()
  }

  close(): void {
    if (!this.open) return
    this.open = false
    this.notify()
  }

  /** 订阅状态变化；返回退订函数。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run tests/client-api.test.ts`
Expected: PASS（注：`store.ts` 的 payload 类型 `AccountPayload` 等为类型导入，测试仅编译 api.ts，无需真实 fetch 服务）。

- [ ] **Step 5: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/client/api.ts packages/dsh-xhs-matrix/src/client/controller.ts packages/dsh-xhs-matrix/tests/client-api.test.ts
git commit -m "feat: Client 数据通道（fetch API 客户端）与面板控制器"
```

---

### Task 8: Client DOM 挂载（侧边栏入口 + 中栏面板）

**Files:**
- Create: `packages/dsh-xhs-matrix/src/client/locales.ts`
- Create: `packages/dsh-xhs-matrix/src/client/sidebar-entry.ts`
- Create: `packages/dsh-xhs-matrix/src/client/mount.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/css-modules.d.ts`
- Create: `packages/dsh-xhs-matrix/src/client/index.ts`
- Create: `packages/dsh-xhs-matrix/src/client/panel/panel.module.css`

**Interfaces:**
- Consumes: `PanelController`、`ACTIVATE_EVENT`/`PANEL_NAME`/`ACTIVE_ATTR`/`OTHER_ACTIVE_ATTRS`（Task 7）；`XhsApi`（Task 7）。
- Produces:
  - `locales.ts`：`export const NS = 'dsh-xhs-matrix'`、`export const zh = { entry: { label: '矩阵', tooltip: '小红书矩阵管理' }, ... }`、`export const en`（键与 zh 对齐）。
  - `sidebar-entry.ts`：`mountSidebarEntry(controller): () => void`（入口注入 New Session 之后、family 块末尾；self-heal MutationObserver）。
  - `mount.tsx`：`mountPanel(controller, api): () => void`（中栏接管 + 跨插件激活）。
  - `index.ts`：Client 插件入口（`inject: ['slots', 'locale']`、locale 注册、挂载两个 DOM 面）。

- [ ] **Step 1: 写 locales.ts**

```ts
/** 界面文案：中文为主，英文键对齐（locale.register 需要 zh/en 两本词典）。 */

export const NS = 'dsh-xhs-matrix'

/** 中文字典。 */
export const zh = {
  'entry.label': '矩阵',
  'entry.tooltip': '小红书矩阵管理',
  'panel.title': '小红书矩阵',
  'tab.accounts': '账号',
  'tab.personas': '人设',
  'tab.topics': '选题',
  'tab.negatives': '黑名单',
  'tab.drafts': '草稿',
} as const

/** 英文字典（键对齐）。 */
export const en: Record<keyof typeof zh, string> = {
  'entry.label': 'Matrix',
  'entry.tooltip': 'Xiaohongshu matrix',
  'panel.title': 'XHS Matrix',
  'tab.accounts': 'Accounts',
  'tab.personas': 'Personas',
  'tab.topics': 'Topics',
  'tab.negatives': 'Negatives',
  'tab.drafts': 'Drafts',
}

export type XhsKey = keyof typeof zh
```

- [ ] **Step 2: 写 sidebar-entry.ts（复制模板模式，替换选择器与图标）**

```ts
/** 侧边栏入口注入：DOM 级扩展（shell 无可注册槽位），self-heal 于 React 重渲染。 */

import type { PanelController } from './controller.ts'

/** 入口行标识。 */
export const ENTRY_SELECTOR = '[data-dsh-xhsmatrix-entry]'

/** 行内图标（16px nav-icon 风格）。 */
const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M5 6.5l2 2-2 2"/><path d="M9 10.5h2"/></svg>'

function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>('[data-pane="sidebar"], [class*="sidebarCol"]')
  if (column === null) return undefined
  const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
  return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
}

function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child.tagName === 'BUTTON') return child as HTMLButtonElement
  }
  return undefined
}

function createEntry(controller: PanelController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshXhsmatrixEntry = ''
  entry.setAttribute('aria-label', '矩阵')
  entry.setAttribute('title', '小红书矩阵管理')
  entry.innerHTML = '<span>' + ICON + '</span><span>矩阵</span>'
  entry.addEventListener('click', () => { controller.toggle() })
  return entry
}

function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement !== root) {
    const row = button.closest('[class*="logoRow"]')
    const base = (row !== null && row.parentElement === root) ? row : button
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches('[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-xhsmatrix-entry]'),
    )
    const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling
    root.insertBefore(entry, anchor)
  }
  return true
}

/**
 * 挂载侧边栏入口，等待 shell 渲染并自愈。
 * @param controller - 面板控制器。
 * @returns disposer。
 */
export function mountSidebarEntry(controller: PanelController): () => void {
  const entry = createEntry(controller)
  let root: HTMLElement | undefined
  let placed = false

  const tryPlace = (): void => {
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    placed = placeEntry(root, entry)
    if (placed) rootObserver.observe(root, { childList: true, subtree: true })
  }

  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) placed = placeEntry(root, entry)
  })

  const syncActive = (): void => {
    if (controller.getSnapshot().panelOpen) entry.dataset.active = 'true'
    else delete entry.dataset.active
  }
  const unsubscribe = controller.subscribe(syncActive)
  syncActive()

  tryPlace()

  return () => {
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribe()
    entry.remove()
  }
}
```

- [ ] **Step 3: 写 mount.tsx（中栏面板接管 + 跨插件互斥）**

```tsx
/** 面板视图挂载：中栏接管为独立 React root，data 属性控制显隐。 */

import { createRoot, type Root } from 'react-dom/client'
import type { XhsApi } from './api.ts'
import { ACTIVATE_EVENT, ACTIVE_ATTR, OTHER_ACTIVE_ATTRS, PANEL_NAME, type PanelController } from './controller.ts'
import { XhsPanel } from './panel/XhsPanel.tsx'
import css from './panel/panel.module.css'

const PANEL_VIEW_SELECTOR = '[data-dsh-xhsmatrix-view]'
const CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]'

function conversationColumn(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(CONVERSATION_COLUMN_SELECTOR) ?? undefined
}

/**
 * 挂载面板 React 树到中栏并绑定显隐。
 * @param controller - 面板控制器。
 * @param api - 数据通道。
 * @returns disposer。
 */
export function mountPanel(controller: PanelController, api: XhsApi): () => void {
  let root: Root | undefined
  let container: HTMLDivElement | undefined

  const ensure = (): void => {
    if (container !== undefined) {
      if (container.isConnected) return
      root?.unmount()
      root = undefined
      container.remove()
      container = undefined
    }
    const column = conversationColumn()
    if (column === undefined) return
    container = document.createElement('div')
    container.dataset.dshXhsmatrixView = ''
    container.className = css.view
    column.appendChild(container)
    root = createRoot(container)
    root.render(<XhsPanel controller={controller} api={api} />)
  }

  const waitObserver = new MutationObserver(() => { ensure() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  const applyActive = (): void => {
    if (controller.getSnapshot().panelOpen) {
      for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr)
      document.documentElement.setAttribute(ACTIVE_ATTR, '')
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }))
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR)
    }
  }

  const onOtherActivate = (event: Event): void => {
    const detail = (event as CustomEvent).detail
    if (detail !== PANEL_NAME && controller.getSnapshot().panelOpen) controller.close()
  }

  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]'
  const onClickSidebarRow = (event: MouseEvent): void => {
    if (!controller.getSnapshot().panelOpen) return
    const target = event.target as HTMLElement | null
    if (target === null) return
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close()
  }

  document.addEventListener('click', onClickSidebarRow, true)
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate)
  const unsubscribe = controller.subscribe(applyActive)
  applyActive()
  ensure()

  return () => {
    document.removeEventListener('click', onClickSidebarRow, true)
    document.removeEventListener(ACTIVATE_EVENT, onOtherActivate)
    waitObserver.disconnect()
    unsubscribe()
    document.documentElement.removeAttribute(ACTIVE_ATTR)
    root?.unmount()
    root = undefined
    container?.remove()
    container = undefined
  }
}
```

- [ ] **Step 4: 写 client/index.ts 与辅助文件**

`src/client/css-modules.d.ts`：

```ts
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
```

`src/client/index.ts`：

```ts
/** Browser-half 入口：注册词典并挂载侧边栏入口与中栏面板。DOM 问题只记录不抛出。 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { XhsApi } from './api.ts'
import { PanelController } from './controller.ts'
import { en, NS, zh, type XhsKey } from './locales.ts'
import { mountPanel } from './mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-xhs-matrix': XhsKey
  }
}

/** 需要的服务。 */
export const inject = ['slots', 'locale']

/**
 * 挂载矩阵面板。
 * @param ctx - client 根上下文。
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-xhs-matrix: dictionaries')

  const controller = new PanelController()
  const api = new XhsApi()
  const disposers: Array<() => void> = []
  try {
    disposers.push(mountSidebarEntry(controller))
    disposers.push(mountPanel(controller, api))
  } catch (error) {
    console.warn('[dsh-xhs-matrix] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-xhs-matrix: ui mounts')
}
```

`src/client/panel/panel.module.css`（精简样式，视觉对齐 dsh-ssh 面板惯例，可参照 `/home/administrator/.dsh/profiles/web/node_modules/@linxin666/dsh-ssh/src/client/panel/panel.module.css`）：

```css
.view { position: absolute; inset: 0; overflow: auto; padding: 16px; background: var(--dsh-bg, #fff); }
.hidden { display: none; }
.header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid rgba(128,128,128,0.3); margin-bottom: 12px; }
.tab { padding: 6px 12px; border: none; background: none; cursor: pointer; border-bottom: 2px solid transparent; }
.tabActive { composes: tab; border-bottom-color: currentColor; font-weight: 600; }
.row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid rgba(128,128,128,0.15); }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.input { padding: 6px 8px; border: 1px solid rgba(128,128,128,0.4); border-radius: 4px; background: transparent; color: inherit; }
.textarea { composes: input; min-height: 80px; resize: vertical; }
.button { padding: 6px 12px; border: 1px solid rgba(128,128,128,0.4); border-radius: 4px; background: transparent; cursor: pointer; }
.danger { color: #d33; }
.muted { opacity: 0.6; font-size: 12px; }
```

- [ ] **Step 5: 写 jsdom 冒烟测试（侧边栏入口插入）**

`tests/client-mount.test.ts`：

```ts
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'
import { PanelController } from '../src/client/controller.ts'
import { mountSidebarEntry } from '../src/client/sidebar-entry.ts'

describe('mountSidebarEntry', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('在 New Session 按钮后插入入口行', () => {
    const dom = new JSDOM('<!doctype html><html><body><div data-pane="sidebar"><div><div class="logoRow"><button class="newSession">New Session</button></div></div></div></body></html>')
    globalThis.document = dom.window.document as unknown as Document
    globalThis.MutationObserver = dom.window.MutationObserver as unknown as typeof MutationObserver

    const controller = new PanelController()
    const dispose = mountSidebarEntry(controller)
    const entry = document.querySelector('[data-dsh-xhsmatrix-entry]')
    expect(entry).not.toBeNull()
    expect(entry?.textContent).toContain('矩阵')
    dispose()
    expect(document.querySelector('[data-dsh-xhsmatrix-entry]')).toBeNull()
  })
})
```

Run: `pnpm vitest run tests/client-mount.test.ts`
Expected: PASS（注：如 jsdom 全局与 vitest 冲突，将该测试 environment 置为 `jsdom` 并在文件头注释说明）。

- [ ] **Step 6: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/client
git commit -m "feat: Client DOM 挂载（侧边栏入口 + 中栏面板 + 词典）"
```

---

### Task 9: 五 Tab 配置面板

**Files:**
- Create: `packages/dsh-xhs-matrix/src/client/panel/XhsPanel.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/AccountsTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/PersonasTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/TopicsTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/NegativesTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/DraftsTab.tsx`
- Create: `packages/dsh-xhs-matrix/src/client/panel/helpers.ts`

**Interfaces:**
- Consumes: `XhsApi`（Task 7）、`PanelController`（Task 7）、`zh` 词典（Task 8）、`panel.module.css`（Task 8）。
- Produces: `XhsPanel({ controller, api })`（五 Tab 容器）。

- [ ] **Step 1: 写 helpers.ts 与 XhsPanel.tsx**

`src/client/panel/helpers.ts`：

```ts
/** 面板共享小工具。 */

/** 从词典取文案（当前固定中文）。 */
export function tt(key: string): string {
  return key
}
```

`src/client/panel/XhsPanel.tsx`：

```tsx
import { useState } from 'react'
import type { XhsApi } from '../api.ts'
import type { PanelController } from '../controller.ts'
import { AccountsTab } from './AccountsTab.tsx'
import { DraftsTab } from './DraftsTab.tsx'
import { NegativesTab } from './NegativesTab.tsx'
import { PersonasTab } from './PersonasTab.tsx'
import { TopicsTab } from './TopicsTab.tsx'
import css from './panel.module.css'

export type TabId = 'accounts' | 'personas' | 'topics' | 'negatives' | 'drafts'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'accounts', label: '账号' },
  { id: 'personas', label: '人设' },
  { id: 'topics', label: '选题' },
  { id: 'negatives', label: '黑名单' },
  { id: 'drafts', label: '草稿' },
]

export interface XhsPanelProps {
  controller: PanelController
  api: XhsApi
}

/** 五 Tab 配置面板容器。 */
export function XhsPanel(props: XhsPanelProps) {
  const { api } = props
  const [tab, setTab] = useState<TabId>('accounts')
  return (
    <div className={css.view}>
      <div className={css.header}><h2>小红书矩阵</h2></div>
      <div className={css.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={tab === t.id ? css.tabActive : css.tab} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab === 'accounts' && <AccountsTab api={api} />}
      {tab === 'personas' && <PersonasTab api={api} />}
      {tab === 'topics' && <TopicsTab api={api} />}
      {tab === 'negatives' && <NegativesTab api={api} />}
      {tab === 'drafts' && <DraftsTab api={api} />}
    </div>
  )
}
```

- [ ] **Step 2: 写 AccountsTab.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface AccountRow { id: string; name: string; personaId: string; enabled: boolean }

/** 账号 Tab：增删改 + 分配人设 + 启用/停用。 */
export function AccountsTab({ api }: { api: XhsApi }) {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([])
  const [name, setName] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [accs, pers] = await Promise.all([api.listAccounts(), api.listPersonas()])
      setAccounts(accs)
      setPersonas(pers)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const create = async (): Promise<void> => {
    try {
      await api.createAccount({ name, personaId, enabled: true })
      setName('')
      setPersonaId('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggle = async (account: AccountRow): Promise<void> => {
    await api.updateAccount(account.id, { name: account.name, personaId: account.personaId, enabled: !account.enabled })
    await refresh()
  }

  const remove = async (id: string): Promise<void> => {
    await api.deleteAccount(id)
    await refresh()
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      <div className={css.field}>
        <label>账号名</label>
        <input className={css.input} value={name} onChange={e => setName(e.target.value)} placeholder="账号A" />
      </div>
      <div className={css.field}>
        <label>人设</label>
        <select className={css.input} value={personaId} onChange={e => setPersonaId(e.target.value)}>
          <option value="">（未分配）</option>
          {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <button className={css.button} onClick={() => void create()}>添加账号</button>
      {accounts.map(account => (
        <div key={account.id} className={css.row}>
          <span>{account.name}</span>
          <span className={css.muted}>{personas.find(p => p.id === account.personaId)?.name ?? '未分配'}</span>
          <span className={css.muted}>{account.enabled ? '启用' : '停用'}</span>
          <button className={css.button} onClick={() => void toggle(account)}>{account.enabled ? '停用' : '启用'}</button>
          <button className={`${css.button} ${css.danger}`} onClick={() => void remove(account.id)}>删除</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 写 PersonasTab.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface PersonaRow { id: string; name: string; prompt: string; toneTags?: string[] }

/** 人设 Tab：增删改（名称 + prompt 文本域 + 口癖标签）。 */
export function PersonasTab({ api }: { api: XhsApi }) {
  const [personas, setPersonas] = useState<PersonaRow[]>([])
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [toneTags, setToneTags] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setPersonas(await api.listPersonas())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const create = async (): Promise<void> => {
    try {
      const tags = toneTags.split(/[,，]/).map(t => t.trim()).filter(t => t !== '')
      await api.createPersona({ name, prompt, toneTags: tags.length > 0 ? tags : undefined })
      setName('')
      setPrompt('')
      setToneTags('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = async (id: string): Promise<void> => {
    await api.deletePersona(id)
    await refresh()
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      <div className={css.field}><label>人设名</label><input className={css.input} value={name} onChange={e => setName(e.target.value)} placeholder="干货风" /></div>
      <div className={css.field}><label>人设提示词</label><textarea className={css.textarea} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="专业、数据支撑、不废话" /></div>
      <div className={css.field}><label>口癖标签（逗号分隔）</label><input className={css.input} value={toneTags} onChange={e => setToneTags(e.target.value)} placeholder="口语化, 结尾提问" /></div>
      <button className={css.button} onClick={() => void create()}>添加人设</button>
      {personas.map(persona => (
        <div key={persona.id} className={css.row}>
          <span>{persona.name}</span>
          <span className={css.muted}>{persona.prompt}</span>
          <span className={css.muted}>{(persona.toneTags ?? []).join('、')}</span>
          <button className={`${css.button} ${css.danger}`} onClick={() => void remove(persona.id)}>删除</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 写 TopicsTab.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface TopicRow { id: string; title: string; status: string; createdAt: string }

/** 选题 Tab：状态过滤、手动添加、批量导入、标记弃用。 */
export function TopicsTab({ api }: { api: XhsApi }) {
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [filter, setFilter] = useState('')
  const [title, setTitle] = useState('')
  const [bulk, setBulk] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setTopics(await api.listTopics())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const add = async (): Promise<void> => {
    if (title.trim() === '') return
    await api.addTopic(title)
    setTitle('')
    await refresh()
  }

  const doImport = async (): Promise<void> => {
    const titles = bulk.split('\n').map(t => t.trim()).filter(t => t !== '')
    if (titles.length === 0) return
    await api.importTopics(titles)
    setBulk('')
    await refresh()
  }

  const retire = async (id: string): Promise<void> => {
    await api.retireTopic(id)
    await refresh()
  }

  const visible = filter === '' ? topics : topics.filter(t => t.status === filter)

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      <div className={css.field}><label>单个选题</label><input className={css.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="通勤穿搭" /></div>
      <button className={css.button} onClick={() => void add()}>添加选题</button>
      <div className={css.field}><label>批量导入（每行一个）</label><textarea className={css.textarea} value={bulk} onChange={e => setBulk(e.target.value)} placeholder={'通勤穿搭\n秋季护肤'} /></div>
      <button className={css.button} onClick={() => void doImport()}>批量导入</button>
      <div className={css.field}>
        <label>状态过滤</label>
        <select className={css.input} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">全部</option>
          <option value="open">open（可用）</option>
          <option value="used">used（已用）</option>
          <option value="retired">retired（弃用）</option>
        </select>
      </div>
      {visible.map(topic => (
        <div key={topic.id} className={css.row}>
          <span>{topic.title}</span>
          <span className={css.muted}>{topic.status}</span>
          {topic.status === 'open' && <button className={css.button} onClick={() => void retire(topic.id)}>弃用</button>}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 写 NegativesTab.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface NegativeRow { id: string; accountId?: string; keyword: string; reason: string }

/** 黑名单 Tab：账号级/全局条目增删。 */
export function NegativesTab({ api }: { api: XhsApi }) {
  const [negatives, setNegatives] = useState<NegativeRow[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([])
  const [keyword, setKeyword] = useState('')
  const [reason, setReason] = useState('')
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [negs, accs] = await Promise.all([api.listNegatives(), api.listAccounts()])
      setNegatives(negs)
      setAccounts(accs)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const add = async (): Promise<void> => {
    await api.addNegative({ keyword, reason, accountId: accountId === '' ? undefined : accountId })
    setKeyword('')
    setReason('')
    setAccountId('')
    await refresh()
  }

  const remove = async (id: string): Promise<void> => {
    await api.deleteNegative(id)
    await refresh()
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      <div className={css.field}><label>关键词</label><input className={css.input} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="美妆技巧" /></div>
      <div className={css.field}><label>原因</label><input className={css.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="上次没流量" /></div>
      <div className={css.field}>
        <label>作用范围</label>
        <select className={css.input} value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">全局</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <button className={css.button} onClick={() => void add()}>添加黑名单</button>
      {negatives.map(negative => (
        <div key={negative.id} className={css.row}>
          <span>{negative.keyword}</span>
          <span className={css.muted}>{negative.accountId === undefined ? '全局' : accounts.find(a => a.id === negative.accountId)?.name ?? negative.accountId}</span>
          <span className={css.muted}>{negative.reason}</span>
          <button className={`${css.button} ${css.danger}`} onClick={() => void remove(negative.id)}>删除</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: 写 DraftsTab.tsx**

```tsx
import { useCallback, useEffect, useState } from 'react'
import type { XhsApi } from '../api.ts'
import css from './panel.module.css'

interface DraftRow {
  id: string; accountId: string; topicId: string; date: string
  copy: string; coverPrompt: string; status: string
  metrics?: { reads: number; likes: number; comments: number; collected: string }
}

/** 草稿 Tab：查看、标记 published/dropped、录入指标。 */
export function DraftsTab({ api }: { api: XhsApi }) {
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setDrafts(await api.listDrafts())
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  const publish = async (draft: DraftRow): Promise<void> => {
    const reads = window.prompt(`录入「${draft.date}」草稿的阅读量（留空跳过指标）`, '')
    if (reads === null) return
    const metrics = reads.trim() === ''
      ? undefined
      : { reads: Number(reads) || 0, likes: 0, comments: 0, collected: new Date().toISOString() }
    await api.setDraftStatus(draft.id, 'published', metrics)
    await refresh()
  }

  const drop = async (draft: DraftRow): Promise<void> => {
    await api.setDraftStatus(draft.id, 'dropped')
    await refresh()
  }

  return (
    <div>
      {error !== '' && <div className={css.danger}>{error}</div>}
      {drafts.length === 0 && <div className={css.muted}>暂无草稿。在对话中问「今天要发什么」生成。 </div>}
      {drafts.map(draft => (
        <div key={draft.id} className={css.row} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
          <div>
            <span>{draft.date}</span>
            <span className={css.muted}> 账号 {draft.accountId} / 选题 {draft.topicId}</span>
            <span className={css.muted}> {draft.status}{draft.metrics !== undefined ? ` · 阅读 ${draft.metrics.reads}` : ''}</span>
          </div>
          <div className={css.muted}>{draft.copy.slice(0, 80)}{draft.copy.length > 80 ? '…' : ''}</div>
          <div>
            {draft.status === 'generated' && (
              <>
                <button className={css.button} onClick={() => void publish(draft)}>标记已发布</button>
                <button className={`${css.button} ${css.danger}`} onClick={() => void drop(draft)}>标记弃用</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: 构建与类型检查**

Run: `pnpm typecheck && pnpm build`
Expected: 类型检查通过；tsdown 产出 `lib/client.js`。

> 若 tsc 对 `window.prompt` 或 JSX 类型报错，按报错补齐 `@types/react` 引用或将该文件纳入 `tsconfig.build.json` 的 include。

- [ ] **Step 8: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/client/panel
git commit -m "feat: 五 Tab 配置面板（账号/人设/选题/黑名单/草稿）"
```

---

### Task 10: 收尾（invariant、README、端到端验收）

**Files:**
- Create: `packages/dsh-xhs-matrix/src/invariant.ts`
- Modify: `README.md`（补全使用说明）
- Modify: `cordis.patch.yml`（如需要）

**Interfaces:**
- Consumes: 全部先前任务。
- Produces: 满足 spec §12 验收脚本的可安装插件。

- [ ] **Step 1: 写 invariant.ts（最小数据关系断言）**

```ts
/** 最小 invariant：存储文件必须携带格式版本（防旧格式静默读坏）。 */

import { MATRIX_STORE_VERSION } from './store.ts'

/** 检查存储文件版本契约；返回诊断或 undefined。 */
export function checkMatrixStoreInvariant(version: number): string | undefined {
  if (version !== MATRIX_STORE_VERSION) {
    return `存储版本不匹配：期望 ${MATRIX_STORE_VERSION}，实际 ${version}`
  }
  return undefined
}
```

`tests/invariant.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { checkMatrixStoreInvariant } from '../src/invariant.ts'
import { MATRIX_STORE_VERSION } from '../src/store.ts'

describe('invariant', () => {
  it('版本一致通过', () => {
    expect(checkMatrixStoreInvariant(MATRIX_STORE_VERSION)).toBeUndefined()
  })
  it('版本不一致给出诊断', () => {
    expect(checkMatrixStoreInvariant(MATRIX_STORE_VERSION + 1)).toMatch(/版本不匹配/)
  })
})
```

Run: `pnpm vitest run tests/invariant.test.ts`
Expected: PASS。

- [ ] **Step 2: 安装到运行中的 web profile 并验收（spec §12）**

安装（本地链接开发）：
```bash
cd /home/administrator/tmp/dsh-xhs-matrix/packages/dsh-xhs-matrix && pnpm build
dsh plugin --profile web add link:/home/administrator/tmp/dsh-xhs-matrix/packages/dsh-xhs-matrix
```
（或：发布 npm 后 `dsh plugin --profile web add dsh-xhs-matrix`；也可在 GUI 的插件清单界面安装。）

> 注意：编辑 `~/.dsh/profiles/web/cordis.patch.yml` 与 `~/.dsh` 目录属于会话工作区之外，执行时需要文件沙箱升级（danger-full-access）并获用户批准。

刷新 Web GUI 后按 spec §12 逐条验收：
1. 侧边栏出现「矩阵」入口，点击后中栏显示五 Tab 面板。
2. 配置人设「干货风」→ 添加账号 A 并分配 → 添加 3 个选题 → 添加 1 条全局黑名单。
3. 对话问「今天要发什么」→ agent 调 `xhs_today` → 输出账号 A 创作简报 → 撰写文案 + 封面提示词 → `xhs_draft_save` → chat 呈现卡片。
4. 再问一次 → 同账号当日不重复（跳过或换选题）。
5. 把剩余选题加入黑名单 → `xhs_today` 排除；选题池耗尽给出明确诊断。
6. 草稿标记 published + 录入阅读量 → `xhs/feedback` 事件出现在日志。

每步与预期不符即修复（回到对应 Task 的代码），修复后重新 build + 安装。

- [ ] **Step 3: 完善 README.md**

补全：安装、能力清单、7 个工具表、数据文件位置（`~/.dsh/dsh-xhs-matrix.json`）、隐私说明（数据为本地文件，不含凭证）、Roadmap（阶段 2-5）。语言：中文。

- [ ] **Step 4: 最终全量验证**

Run: `cd packages/dsh-xhs-matrix && pnpm typecheck && pnpm test && pnpm build`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
cd /home/administrator/tmp/dsh-xhs-matrix
git add packages/dsh-xhs-matrix/src/invariant.ts packages/dsh-xhs-matrix/tests/invariant.test.ts README.md
git commit -m "feat: invariant、README 与端到端验收"
```

---

## Self-Review（计划自检）

- **Spec 覆盖**：§4 数据模型 → Task 2（types.ts）；§5 持久化 → Task 3（私有 JSON 文件，已标注对 spec §5 的修订）；§6 决策逻辑 → Task 2；§7 工具面（7 工具）→ Task 6；§8 事件 → Task 4 + Task 6（published+metrics 发射）；§9 Config → Task 5（schemastery Config + settings 集成）；§10 Web 界面五 Tab → Task 8/9；§11 测试策略 → 各 Task 测试（纯函数单测 Task 2、存储契约 Task 3、路由真实组合 Task 5、事件 Task 4、Client Task 7/8）；§12 验收脚本 → Task 10。
- **占位符扫描**：无 TBD/TODO；唯一"注释行替换"出现在 Task 6 Step 4，给出了精确的替换代码。
- **类型一致性**：`MatrixStore` 方法名在 Task 3 定义，Task 5/6 使用的 `upsertAccount/addTopics/addNegative/saveDraft/markTopicUsed/setDraftStatus/findDraft/list*` 均一致；`composeBrief(account, persona, topic, negatives)` 签名 Task 2 → Task 6 一致；`filterTopics(topics, negatives, accountId, todayDrafts)` 一致；`XHS_API` 路径 Task 4 → Task 5/7 一致；`PanelController`/`ACTIVE_ATTR` 等 Task 7 → Task 8 一致。
