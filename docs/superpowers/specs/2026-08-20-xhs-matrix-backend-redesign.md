# dsh-xhs-matrix 后端重新设计

日期：2026-08-20
状态：已与用户逐段确认（领域模型 / 采集层与服务职责 / 创作台模型与迁移测试）

## 1. 背景与目标

当前后端在功能与结构上存在多处问题，用户反馈「后端功能很多不对」，核心诉求：

- 趋势候选应该采集**爆款的标题和正文**，且必须**符合该账号人设**
- 去掉**选题池**模块
- 采集的文章存储在**爆款池**里，**每个账号独立、互不干扰**，附带原文链接供**人工审核**
- 创作台报 `no adapter registered for provider "deepseek"`——硬编码了不存在的 provider，应**复用 Harness 当前配置的模型**
- 知识库导入只需要**标题和正文**
- 草稿独立，不再关联选题

本次重构采用**方案 B：按领域拆分模块**，store 接口化（预留 SQLite 迁移口），单 JSON 文件持久化在当前量级下继续使用。

## 2. 领域模型

### 2.1 删除

- `Topic` 类型与选题池（`topics` 数组）
- `xhs_topics`、`xhs_topic_add` 工具
- `Draft.topicId` 字段（草稿独立）
- 旧 `TrendSample`（被爆款池取代）

### 2.2 新增：爆款池 `ViralItem`

账号级隔离，替代选题池与趋势样本：

```ts
interface ViralItem {
  id: string
  accountId: string        // 归属账号；账号间互不干扰
  title: string            // 爆款标题
  body: string             // 爆款正文（完整文章）
  sourceUrl?: string       // 原文链接 → 人工审核点开核对
  source: 'apify' | 'manual' | 'import'
  status: 'pending' | 'accepted' | 'ignored'   // 待审核 / 已采纳 / 忽略
  score: number            // 人设相关性推荐分
  reasons: string[]        // 匹配理由（人设方向 / 高权重相似 / 互动 / 时效）
  publishedAt?: string
  collectedAt: string
}
```

流程：Apify 采集 → 存 `pending` 进该账号爆款池 → 用户点链接人工审核 → 标记 `accepted`（成为该账号创作参考，进入创作台上下文）或 `ignored`（隐藏）。

### 2.3 知识库简化

导入只需 `title` + `copy`（标题与正文）必填；发布时间、链接、来源、权重保持可选。

### 2.4 草稿独立

草稿仅含日期、文案、封面提示词、标签、状态，不再关联选题或爆款。

## 3. 采集层与服务职责

### 3.1 采集层（`src/collector/`）

```
collector/
  provider.ts   # TrendProvider 接口：search(request) → 标准化爆款条目
  apify.ts      # Apify 适配器（自 src/apify.ts 迁入并增强）
  rank.ts       # 人设相关性排序（自 src/trends.ts 迁入并增强）
```

**Apify 适配器增强**：
- 正文提取：标准化时提取完整正文（`body`/`content`/`desc`/`text` 字段）
- 链接保留：提取 `url`/`noteUrl` 为 `sourceUrl`
- 输入兼容：保留多键搜索词（`query`/`keyword`/`searchKeyword`/`search` + `operation: 'note search'`）

**排序增强（rank）**：
- 人设相关性词表：人设名 + 定位 + 领域 + 内容方向 + 选题标准 + 钩子风格
- 高权重历史相似：与账号权重 ≥4 笔记相近 +30
- 互动信号 + 时效性保留
- 结果进该账号爆款池（`pending`），附推荐分与理由

### 3.2 数据层（store 领域分区，单文件持久化保留）

`store.ts` 重构为领域分区，方法按领域归组，接口即领域入口：

```
账号区     listAccounts / upsertAccount / deleteAccount / 连接与采集状态
人设区     listPersonas / upsertPersona / deletePersona
知识库区   listNotes / importNotes / setNoteWeight / metricSnapshots
爆款池区   listViralItems / saveViralItem / reviewViralItem(采纳/忽略)
草稿区     listDrafts / saveDraft / updateDraft / setDraftStatus
创作区     studioMessages / settings(apify 配置)
```

落盘实现（JSON 文件，tmp + rename 原子写）与接口解耦，后续可换 SQLite 实现而不动其他层。

### 3.3 路由按领域拆文件（`src/routes/`）

```
routes/
  index.ts      # 装配全部路由
  accounts.ts   # 账号 CRUD + 连接 + 导入
  personas.ts   # 人设 CRUD
  knowledge.ts  # 笔记 + 权重 + 指标
  viral.ts      # 爆款池：GET 列表 / POST 采集 / PATCH 审核
  drafts.ts     # 草稿 CRUD + 状态回填
  studio.ts     # 创作会话 + 保存草稿
  settings.ts   # Apify 配置
```

loopback 围栏与字段校验保持统一。

### 3.4 工具同步（agent tools）

- 删除：`xhs_topics`、`xhs_topic_add`
- 调整：`xhs_today` 简报基于爆款池而非选题池
- 新增：`xhs_virals`（查询某账号爆款池条目与审核状态）

## 4. 创作台模型与配置统一

### 4.1 创作台模型

- 不再硬编码 `deepseek` / `deepseek-chat`
- 启动时读取 Harness 用户设置 `agent-default-model`（当前为 `provider: deepseek-official` / `model: deepseek-v4-flash`）
- 兜底：读取失败时用 `ctx.llm.listProviders()` 探测第一个已注册 provider；两者皆不可用时给出明确错误
- 每次调用前读取最新配置，会话内模型变更自动跟随

### 4.2 配置统一

- Apify 配置唯一来源 = `store.settings`（面板可配置，持久化在数据文件）
- 插件 Config 中的 `apifyActorId/apifyApiToken/apifyMaxItems/...` 字段删除；设置面板 Apify 字段移除
- 面板保存 → store → 触发采集层重建

## 5. 数据迁移（v2 → v3）

数据文件版本升到 v3：

1. `trendSamples` → `viralItems`：每条转 `ViralItem`（status `pending`，`body` 从 summary/desc 尽力填充，链接保留），挂回原账号
2. `topics` 数组删除
3. `drafts` 移除 `topicId`
4. 旧 v1/v2 文件依次迁移到 v3

## 6. 前端同步改动

后端重构牵动前端，随本次一并调整：

- **删除「趋势选题」页中的选题池管理**（单个选题/批量导入/状态过滤），保留爆款采集入口
- **新增「爆款池」页面/区块**：当前账号的爆款列表（标题+正文摘要+来源链接），每条可「采纳/忽略」，已采纳标注并进入创作参考；未采纳的 `pending` 待审核
- **总览账号卡片**：趋势样本数改为爆款池 pending/accepted 计数
- **知识库导入**：表单简化为标题+正文（其他字段可选）
- **创作台**：右侧上下文栏改为展示「已采纳爆款参考」；保存草稿不再要求选题标题（草稿独立）
- **左侧导航**：移除「趋势选题」下选题池相关入口（如保留页面则只保留爆款采集/审核）

## 7. 测试策略

- store 领域测试：爆款池 CRUD + 审核状态流转
- 排序测试：人设相关性打分（匹配/不匹配得分差异）
- 采集适配测试：Apify item 标准化（正文提取、链接保留）
- 迁移测试：v1/v2 → v3 正确转换
- 路由测试：爆款池 GET/POST/PATCH，删除选题池断言
- 创作台模型测试：provider 解析
- 前端组件测试：爆款池审核交互、导入简化表单、创作台保存草稿不再依赖选题

## 8. 范围外

- 数据库迁移（当前量级 JSON 足够；store 接口化预留迁移口，不在此次实施）
- 定时采集调度（维持现状：手动触发为主，调度器保留但不在本次重构范围）
