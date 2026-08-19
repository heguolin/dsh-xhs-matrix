# dsh-xhs-matrix — 小红书矩阵内容管理系统

小红书矩阵内容管理系统（dsh 双半插件）：账号人设、选题池、黑名单、草稿与「今天要发什么」决策流。

- Host 半（`exports "."`）在宿主进程运行：存储、`/api/dsh-xhs-matrix` 路由、7 个 agent 工具。
- 浏览器半（`exports "./client"`）经 `package.json` 的 `dsh.client` 声明在 Web GUI 加载：侧边栏「矩阵」入口。
- 独立工具入口（`exports "./invariant"`）：`checkMatrixStoreInvariant` 存储版本契约断言。
- 全部基于官方 NPM SDK 实现，不修改 DSH 源码。

## 能力

| 能力 | 说明 |
| --- | --- |
| 账号人设 | 管理矩阵账号与账号的人设设定（领域/语气/禁忌等），人设增删改走 Web 界面 |
| 选题池 | 维护待发选题及其状态（open/used/retired），支持手动/批量导入 |
| 黑名单 | 账号级或全局关键词黑名单，命中选题不进入创作简报 |
| 草稿 | 保存文案与封面提示词的草稿，支持回填发布状态与流量指标 |
| 决策流 | 「今天要发什么」：按人设、选题池、黑名单与去重规则生成创作简报 |

## 安装

### 本地开发（link 模式）

```sh
dsh plugin --profile web add link:/home/administrator/tmp/deepseek-harness/dsh-xhs-matrix/packages/dsh-xhs-matrix
```

### 发布后（npm 安装）

```sh
dsh plugin --profile web add dsh-xhs-matrix
```

或经 Web GUI 的插件清单安装。

安装后重启 `dsh web`：插件行 `xhs-matrix` 插入 web profile，Host 半在宿主进程运行，浏览器半在 Web GUI 加载。

## 使用

### Web 界面（Client 半）

侧边栏出现「矩阵」入口，点击后中栏显示五 Tab 配置面板：

| Tab | 功能 |
| --- | --- |
| 账号 | 增删改账号、分配人设、启用/停用 |
| 人设 | 增删改人设模板（名称 + 提示词 + 口癖标签） |
| 选题 | 选题池表格（状态过滤）、手动添加、批量导入、标记弃用 |
| 黑名单 | 账号级/全局条目、添加（含原因）、删除 |
| 草稿 | 查看已生成草稿、标记 published/dropped、录入 metrics |

设计原则：**配置走 UI（人设/账号），内容流走对话（选题/黑名单）**——两者都能写，只是入口不同。

### Agent 工具（7 个模型工具）

| 工具 | 方向 | 用途 |
| --- | --- | --- |
| `xhs_today` | 读 | 今日决策：为每个（或指定 `account`）未发账号生成创作简报（人设 + 选题 + 黑名单约束），供 agent 撰写文案与封面提示词 |
| `xhs_draft_save` | 写 | 持久化草稿、标记选题已用；同账号 + 当日 + 同选题去重（`force: true` 可覆盖） |
| `xhs_topics` | 读 | 选题池查询（`status` 过滤） |
| `xhs_topic_add` | 写 | 手动/批量导入选题（`title` 或 `titles`，感知层的模拟入口） |
| `xhs_negative_add` | 写 | 添加黑名单条目（`accountId` 省略 = 全局；`keyword` + `reason`） |
| `xhs_accounts` | 读 | 账号与人设清单（只读；增删改在「矩阵」面板进行） |
| `xhs_draft_status` | 写 | 回填草稿状态（published/dropped）；published 且带 metrics 时触发 `xhs/feedback` 事件 |

典型对话流：问「今天要发什么」→ agent 调 `xhs_today` 拿到创作简报 → 按人设撰写文案 + 封面提示词 → `xhs_draft_save` 落库；发布后 `xhs_draft_status` 回填阅读量等指标，触发 `xhs/feedback` 事件（进化闭环数据源）。

### 数据与隐私

- 数据文件：`~/.dsh/dsh-xhs-matrix.json`（单文件 JSON，原子写 + 格式版本）。
- 存储内容：账号、人设、选题、黑名单、草稿及流量指标。**数据仅保存在本地文件，不含任何凭证**（不保存 API 密钥、Cookie 或登录态），不上传任何网络服务。
- 版本契约：存储文件必须携带格式版本，旧格式或损坏介质会明确报错而非静默读坏；`dsh-xhs-matrix/invariant` 导出 `checkMatrixStoreInvariant(version)` 供外部校验。

### 配置

插件 Config（经 settings 面板或 cordis.yml 修改）：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `selectionStrategy` | `fifo` | 选题选择策略（fifo 最旧未用优先 / random） |
| `locale` | `zh-CN` | 日期格式等 |
| `announceToAgent` | `true` | 是否向模型注入插件公告 |
| `enabled` | `true` | 插件总开关 |

## 开发

```sh
pnpm install        # 安装依赖
pnpm build          # tsc 声明 + tsdown 双半区产物（lib/）
pnpm test           # vitest 单测
pnpm typecheck      # tsc --noEmit 类型检查
```

## Roadmap（后续阶段）

| 阶段 | 目标 | 关键动作 |
| --- | --- | --- |
| 阶段 2：任务调度 | 定时生成 | 浏览器端 5 段 cron（复用 dsh-task-board 模式），到点自动为未发账号生成草稿 |
| 阶段 3：感知输入流 | 选题采集 | 对接热榜/第三方选题源；评估反爬与合规，必要时保留手动导入 |
| 阶段 4：多模态集成 | 封面图生成 | 对接 Flux/SD（fal / replicate 类 API），`coverPrompt` → 图片 URL/文件 |
| 阶段 5：进化闭环 | 自动剔除 | 数据回填接口完善；基于流量阈值的黑名单过滤逻辑（监听 `xhs/feedback`） |

## 已知限制

- 定时调度属阶段 2，MVP 仅按需生成。
- 封面图为提示词而非真实图片（阶段 4）。
- 无自动淘汰逻辑（阶段 5），MVP 黑名单需手动维护。
