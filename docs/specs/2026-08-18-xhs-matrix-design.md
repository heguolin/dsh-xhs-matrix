# dsh-xhs-matrix 设计文档

- 日期：2026-08-18
- 状态：已批准（设计评审通过，待用户最终审阅）
- 文档语言：中文（本插件所有文档默认中文）

## 1. 背景与目标

在 deepseek-harness 的插件化架构之上，构建一个小红书矩阵内容管理系统。系统具备四个能力：**感知**（选题输入）、**决策**（矩阵管理）、**执行**（文案生成）、**进化**（反馈闭环）。

本设计文档覆盖 **MVP（矩阵核心 + 今日决策流）**，即子项目 1 与 2 的完整设计。感知采集、图片生成、定时调度、自动淘汰分别留待后续阶段（见 §14 Roadmap）。

### 产品目标

- 管理多个小红书账号的「人设模板」与「选题池」
- 回答「今天要发什么」：按账号人设从选题池中筛选选题，生成可直接发布的草稿（文案 + 封面提示词）
- 为进化闭环预留数据挂点：草稿指标、黑名单、`xhs/feedback` 事件

## 2. 设计决策记录

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 发布边界 | **草稿模式**：产出文案 + 封面提示词，人工发布 | 合规风险最低、MVP 最快；回填数据靠手动录入或创作中心导出 |
| D2 | 部署形态 | **独立第三方插件**，单独 GitHub 仓库，npx 安装 | 与核心仓库解耦，只提交插件本身 |
| D3 | MVP 范围 | **矩阵核心 + 今日决策流** | 最快看到核心价值；感知层用手动选题模拟 |
| D4 | 触发方式 | **仅按需**：用户问「今天要发什么」即生成，无定时器 | MVP 最简；定时留待后续阶段 |
| D5 | 实现方案 | **方案 A：双半插件**（Host 服务/工具/事件 + Client Web 配置界面） | 吃满 harness 扩展面，进化闭环有事件挂点 |
| D6 | 文档语言 | **中文**（spec、README 等全部文档） | 用户要求 |

## 3. 总体架构

### 3.1 插件拓扑

`dsh-xhs-matrix` 为双半插件（Host + Client），部署为独立仓库：

```
packages/dsh-xhs-matrix/
  src/
    index.ts        # Host 插件入口：装配服务/工具/事件/存储
    types.ts        # 领域类型（只放类型，不放运行时代码）
    decision.ts     # 纯函数决策：选题过滤 + 选择（可单测）
    composer.ts     # 创作简报拼接：人设 + 选题 − 黑名单（纯函数）
    store.ts        # ctx.storage KV 单元封装（CRUD）
    tools.ts        # 模型工具注册（xhs_* 工具族）
    events.ts       # xhs/feedback 事件发射 + 阈值逻辑占位
  src/client/
    index.ts        # Client 插件：侧边栏「矩阵」入口注册
    Panel.tsx       # 配置界面（账号/人设/选题/黑名单/草稿 Tab）
  package.json
```

- **Host 半**负责：持久化、决策、工具、事件——全部业务逻辑
- **Client 半**负责：Web 配置界面（侧边栏 Slot 注册；具体洞位实现时用 `cordis_inspect_list` 核实；注册返回 disposer，保证 HMR/卸载安全）
- 双半之间**不共享业务数据**，Client 只通过 Package-private JSON RPC 调用 Host（只传叶子字段，不序列化活对象）

### 3.2 数据流（今日决策流）

```
用户："今天要发什么"
  → agent 调用 xhs_today 工具
  → store 读取：账号清单 / 选题池 / 黑名单 / 今日已生成草稿
  → decision.ts（纯函数）：
      按账号人设过滤选题（排除黑名单命中 + 已用选题 + 今日已发）
      从剩余选题中按策略选择（MVP：fifo / random）
  → composer.ts（纯函数）：拼出「创作简报」
      = 人设 prompt + 选中选题 + 黑名单警示（"不要写类似 XX"）
  → 工具返回简报，agent（即 LLM）按简报撰写文案 —— 不嵌套调 LLM，
     复用 agent-loop 本身作为生成引擎
  → xhs_draft_save 持久化草稿（去重闸门）→ chat 输出 markdown 卡片
```

**关键决策**：文案生成不嵌套调用 LLM。工具只产出结构化简报，由当前 agent 直接续写。这保证「模型可见 ⟺ 可日志重建」，且省一次嵌套模型调用。

## 4. 数据模型（5 个实体）

```ts
interface Account {
  id: string
  name: string             // 账号名，如「账号A」
  personaId: string        // 引用 Persona
  enabled: boolean
  createdAt: string
}

interface Persona {
  id: string
  name: string             // 人设名，如「干货风」
  prompt: string           // 人设提示词模板（自由文本）
  toneTags?: string[]      // 口癖、语气标签（可选）
  createdAt: string
}

interface Topic {
  id: string
  title: string            // 选题标题
  source: 'manual' | 'import'   // MVP：manual
  status: 'open' | 'used' | 'retired'
  usedByDraftId?: string
  createdAt: string
}

interface NegativeTopic {
  id: string
  accountId?: string       // null = 全局黑名单
  keyword: string
  reason: string           // 如「上次没流量」
  createdAt: string
}

interface Draft {
  id: string
  accountId: string
  topicId: string
  date: string             // YYYY-MM-DD
  copy: string
  coverPrompt: string      // 封面提示词（图片生成留待阶段 4）
  status: 'generated' | 'published' | 'dropped'
  metrics?: { reads: number; likes: number; comments: number; collected: string }
  createdAt: string
}
```

要点：

- 黑名单支持**账号级 + 全局**两级（`accountId` 为空即全局）
- Draft 预埋 `metrics` 字段与 `published/dropped` 状态，为进化闭环留挂点
- 类型文件 `types.ts` 只放类型，不放运行时代码

## 5. 持久化

- 在 harness 存储中枢上挂自己的 KV 单元：`xhs_matrix`，带 format version（防旧格式静默读坏）
- 单文件 JSON 后端即可满足 MVP；SQLite 后端可无缝切换（同一 KV 接口）
- 所有写操作走统一 store 封装（`store.ts`），CRUD 方法为工具与 Client RPC 共用
- 写操作统一处理：介质损坏 / version 不匹配 → 明确报错，不静默降级

## 6. 决策逻辑（`decision.ts`，纯函数）

三步纯函数流水线，输入领域状态，输出创作简报，不碰 I/O：

```
filterTopics(topics, negatives, accountId, todayDrafts)
  → 剔除：已用选题(status=used) / 标题命中黑名单(账号级+全局) / 今日已为该账号生成过
selectTopic(candidates, strategy)
  → MVP 策略：fifo（最旧未用优先）/ random，由 Config.selectionStrategy 配置
composeBrief(persona, topic, negatives)
  → 创作简报 markdown：
     【账号】账号A（干货风）
     【选题】<选题标题>
     【约束】不要写类似于「美妆技巧」的内容，因为上次没流量
     【任务】按人设撰写小红书文案（标题+正文+话题标签），并给出封面提示词
```

## 7. 工具面（MVP 共 7 个模型工具）

| 工具 | 方向 | 用途 | 呈现 |
|---|---|---|---|
| `xhs_today` | 读 | 今日决策：列出未发账号 + 创作简报（`account?` 指定 / `count?` 批量） | terminal |
| `xhs_draft_save` | 写 | 持久化草稿、标记选题已用、去重闸门 | generic |
| `xhs_topics` | 读 | 选题池查询（`status?` 过滤） | terminal |
| `xhs_topic_add` | 写 | 手动/批量导入选题（感知层模拟入口） | generic |
| `xhs_negative_add` | 写 | 添加黑名单（`accountId?` 省略 = 全局） | generic |
| `xhs_accounts` | 读 | 账号 + 人设清单（agent 自我查询） | terminal |
| `xhs_draft_status` | 写 | 标记 published/dropped；带 metrics 时发射 `xhs/feedback` 事件 | generic |

规则：

- 账号/人设的**增删改走 Web UI**，agent 只读；选题与黑名单 agent 可写（贴合「选题输入流」场景）
- 每个工具带 schemastry schema + prompt 引导 + 结构化错误
- 结构化错误场景：未配置账号 / 选题池为空 / 全部选题被黑名单命中 / 今日已发 → 明确诊断，不静默跳过

### 去重闸门

`xhs_draft_save`：同账号 + 今日 + 同选题已存在则拒绝（除非 `force: true`）。

## 8. 事件与进化占位

- 类型化事件 `xhs/feedback`：`{ draftId, accountId, metrics }`
- `xhs_draft_status` 带 metrics 标记 published 时发射该事件
- **MVP 不做阈值淘汰**（阶段 5），但事件契约先钉死；黑名单表结构已支持「淘汰原因」字段

## 9. 插件 Config

无硬编码调参，全部为可配置字段：

```ts
Config = {
  selectionStrategy: 'fifo' | 'random',  // 默认 fifo
  locale: 'zh-CN',                       // 日期格式等
}
```

## 10. Web 配置界面（Client 半）

侧边栏「矩阵」入口 → 全屏配置面板，五个 Tab，全部经 Package-private JSON RPC 回 Host：

| Tab | 功能 |
|---|---|
| 账号 | 增删改账号、分配人设、启用/停用 |
| 人设 | 增删改人设模板（名称 + prompt 文本域 + 口癖标签） |
| 选题 | 选题池表格（状态过滤）、手动添加、批量导入、标记弃用 |
| 黑名单 | 账号级/全局条目、添加（含原因）、删除 |
| 草稿 | 查看已生成草稿、标记 published/dropped、录入 metrics |

设计原则：**配置走 UI（人设/账号），内容流走对话（选题/黑名单）**——两者都能写，只是入口不同。

## 11. 测试策略

| 层 | 覆盖 | 方式 |
|---|---|---|
| 纯函数单测 | `decision.ts`（过滤/选择/黑名单命中/去重）、`composer.ts`（简报拼接） | vitest；覆盖：空选题池、全部被黑名单命中、今日已发、账号级 vs 全局黑名单 |
| 工具集成测试 | 真实组合启动（Loader 引导 cordis.yml + 真实存储后端），断言 `xhs_today`/`xhs_draft_save` 的模型可见输出与去重闸门 | 遵循核心仓库 REAL-composition 测试政策 |
| 存储契约 | KV 单元 version 不匹配 / 损坏介质 → 明确报错 | store 封装测试 |
| 事件 | 标记 published + metrics → `xhs/feedback` 发射 | events 测试 |
| Client | HMR 安全（dispose 后槽位移除）+ 手动验收 | 可选组件测试 |

## 12. 验收标准（MVP 演示脚本）

1. npx 安装插件 → 侧边栏出现「矩阵」
2. UI 配置：人设「干货风」→ 账号 A 分配 → 添加 3 个选题 → 添加 1 条全局黑名单
3. 问「今天要发什么」→ agent 调 `xhs_today` → 输出账号 A 的创作简报 → 按人设写出文案 + 封面提示词 → 保存草稿 → chat 呈现卡片
4. 再问一次 → 同账号今日已发则跳过（或换选题），不重复
5. 把剩余选题加入黑名单 → `xhs_today` 排除它；选题池耗尽时给出明确诊断
6. 草稿标记 published + 录入阅读量 → `xhs/feedback` 事件出现在日志

## 13. 非目标（MVP 明确不做）

- 图片生成（封面图）—— 阶段 4
- 热榜/选题采集 —— 阶段 3（MVP 用 `xhs_topic_add` 手动模拟）
- 定时调度 —— 后续阶段（MVP 仅按需）
- 自动淘汰（阈值黑名单）—— 阶段 5

## 14. Roadmap（后续阶段）

| 阶段 | 目标 | 关键动作 |
|---|---|---|
| 阶段 2：任务调度 | 定时生成 | 浏览器端 5 段 cron（复用 dsh-task-board 模式），到点自动为未发账号生成草稿 |
| 阶段 3：感知输入流 | 选题采集 | 对接热榜/第三方选题源；评估反爬与合规，必要时保留手动导入 |
| 阶段 4：多模态集成 | 封面图生成 | 对接 Flux/SD（fal / replicate 类 API），`coverPrompt` → 图片 URL/文件 |
| 阶段 5：进化闭环 | 自动剔除 | 数据回填接口完善；基于流量阈值的黑名单过滤逻辑（监听 `xhs/feedback`） |

## 15. 落地位置与仓库布局

- 独立工作区：`/home/administrator/tmp/deepseek-harness/dsh-xhs-matrix`（与核心仓库开发副本平级，位于开发隔离区）
- 单包结构，后续单独提交 GitHub、npm 发布、npx 安装
- 文档语言：中文（README、spec 等）
