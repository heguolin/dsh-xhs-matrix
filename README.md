# dsh-xhs-matrix — 小红书矩阵内容管理系统

小红书矩阵内容管理系统（dsh 双半插件）：账号人设、选题池、黑名单、草稿与「今天要发什么」决策流。

- Host 半（`exports "."`）在宿主进程运行：存储、`/api/dsh-xhs-matrix` 路由、agent 工具。
- 浏览器半（`exports "./client"`）经 `package.json` 的 `dsh.client` 声明在 Web GUI 加载。
- 全部基于官方 NPM SDK 实现，不修改 DSH 源码。

## 能力

| 能力 | 说明 |
| --- | --- |
| 账号人设 | 管理矩阵账号的人设设定（领域/语气/禁忌等） |
| 选题池 | 维护待发选题及其状态 |
| 黑名单 | 管理拉黑账号与内容 |
| 草稿 | 保存待发布内容草稿 |
| 决策流 | 「今天要发什么」：按规则从选题池/草稿中推荐今日发布内容 |

> 骨架阶段：本仓库当前只包含构建/测试/组合清单（Task 1 脚手架），上述能力由后续任务实现。

## 安装

### 本地开发（link 模式）

```sh
dsh plugin --profile web add link:/home/administrator/tmp/dsh-xhs-matrix/packages/dsh-xhs-matrix
```

### 发布后（npm 安装）

```sh
dsh plugin --profile web add dsh-xhs-matrix
```

或经 Web GUI 的插件清单安装。

安装后重启 `dsh web`：插件行 `xhs-matrix` 插入 web profile，Host 半在宿主进程运行，浏览器半在 Web GUI 加载。

## 使用

（由后续任务补齐：GUI 面板入口与 agent 工具说明。）

## 开发

```sh
pnpm install        # 安装依赖
pnpm build          # tsc 类型 + tsdown 双半区产物（lib/）
pnpm test           # vitest 单测
pnpm typecheck      # tsc --noEmit 类型检查
```

## 已知限制

（由后续任务补齐。）
