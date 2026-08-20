/** Agent 工具族：xhs_today 决策流 + 草稿/选题/账号操作。所有工具返回 { ok, message, ...data }。 */

import type { Context } from '@deepseek-ai/cordis'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { composeBrief } from './composer.ts'
import { filterTopics, selectTopic } from './decision.ts'
import { emitFeedback } from './events.ts'
import { MatrixStore } from './store.ts'
import type { Account, DraftMetrics, DraftStatus } from './types.ts'

function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** 工具依赖。 */
export interface ToolsDeps {
  store: MatrixStore
  ctx: Context
  /** 选题选择策略（与插件 Config.selectionStrategy 同源）。 */
  selectionStrategy: 'fifo' | 'random'
}

/** 渲染一条工具结果。 */
function render(result: { ok: boolean; message: string; [key: string]: unknown }): ContentBlock[] {
  const lines = [result.ok ? '✅ ' : '⚠️ ' + result.message]
  if (result.ok && result.message !== '') lines[0] = result.message
  return text(lines.join('\n'))
}

/**
 * 构建 8 个模型工具。
 * @param deps - 存储与上下文。
 * @returns 工具定义数组。
 */
export function makeTools(deps: ToolsDeps) {
  const { store, ctx, selectionStrategy } = deps

  /** 今日日期（YYYY-MM-DD，本地时区）。 */
  const today = (): string => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  const accountsOf = (): Account[] => {
    return store.listAccounts().filter(a => a.enabled)
  }

  const personaOf = (personaId: string) => store.listPersonas().find(p => p.id === personaId)

  const toolToday = defineTool({
    name: 'xhs_today',
    description: '今日决策：为每个（或指定）未发账号生成创作简报（人设 + 选题约束）。' +
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
      const briefs: string[] = []
      const skipped: string[] = []
      for (const account of accounts) {
        const persona = personaOf(account.personaId)
        if (persona === undefined) {
          skipped.push(`${account.name}（未分配人设）`)
          continue
        }
        const candidates = filterTopics(store.listTopics(), account.id, todayDrafts)
        const topic = selectTopic(candidates, selectionStrategy)
        if (topic === undefined) {
          skipped.push(`${account.name}（选题池为空或全部被已用/今日已发排除）`)
          continue
        }
        briefs.push(composeBrief(account, persona, topic))
      }
      if (briefs.length === 0) {
        const detail = skipped.length > 0 ? `：${skipped.join('，')}` : ''
        return { ok: false, message: `今日无可生成内容${detail}。请补充选题或检查账号选题标准。`, briefs: [] }
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
      // 落库前校验：缺失字段或引用不存在的选题/账号都拒绝，避免垃圾草稿持久化（与 routes 侧一致）。
      const requiredFields = ['accountId', 'topicId', 'copy', 'coverPrompt'] as const
      for (const field of requiredFields) {
        const value = args[field]
        if (typeof value !== 'string' || value.trim() === '') {
          return { ok: false, message: `参数 ${field} 必填`, draftId: '' }
        }
      }
      if (!store.listTopics().some(t => t.id === args.topicId)) {
        return { ok: false, message: `选题不存在：${args.topicId}`, draftId: '' }
      }
      if (!store.listAccounts().some(a => a.id === args.accountId)) {
        return { ok: false, message: `账号不存在：${args.accountId}`, draftId: '' }
      }
      const date = today()
      const existing = store.findDraft(args.accountId, date, args.topicId)
      if (existing !== undefined && args.force !== true) {
        return { ok: false, message: `该账号当日已存在同选题草稿（${existing.id}），如确需覆盖请传 force: true。`, draftId: existing.id }
      }
      // force 为真覆盖：先删旧草稿，再落新草稿，保证同账号当日同选题仅存一份。
      if (existing !== undefined) store.deleteDraft(existing.id)
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
        additionalProperties: false,
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

  const toolNotes = defineTool({
    name: 'xhs_notes',
    description: '查询指定账号的已发布笔记知识库（含标题、权重、最近指标摘要）。',
    parameters: {
      accountId: { type: 'string', required: true, description: '账号 id' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          notes: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => render(value),
    },
    isConcurrencySafe: () => true,
    async execute(args: { accountId: string }, _exec: unknown) {
      if (!store.listAccounts().some(account => account.id === args.accountId)) {
        return { ok: false, message: `账号不存在：${args.accountId}`, notes: [] }
      }
      const notes = store.listPublishedNotes(args.accountId)
      const lines = notes.length === 0
        ? ['该账号还没有已发布笔记']
        : notes.map(note => {
            const metric = store.listMetricSnapshots(args.accountId, note.id).at(-1)
            return `${note.id}\t权重 ${note.weight}\t${note.title}${metric !== undefined ? `\t阅读 ${metric.reads}` : ''}`
          })
      return { ok: true, message: lines.join('\n'), notes: lines }
    },
  })

  const toolTrends = defineTool({
    name: 'xhs_trends',
    description: '查询指定账号已保存的外部趋势样本（Apify 采集，公开数据）。',
    parameters: {
      accountId: { type: 'string', required: true, description: '账号 id' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          trends: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => render(value),
    },
    isConcurrencySafe: () => true,
    async execute(args: { accountId: string }, _exec: unknown) {
      if (!store.listAccounts().some(account => account.id === args.accountId)) {
        return { ok: false, message: `账号不存在：${args.accountId}`, trends: [] }
      }
      const trends = store.listTrendSamples(args.accountId)
      const lines = trends.length === 0
        ? ['暂无趋势样本，请在「矩阵」面板触发采集']
        : trends.slice(0, 20).map(trend => `${trend.id}\t${trend.title}${trend.likes !== undefined ? `\t点赞 ${trend.likes}` : ''}`)
      return { ok: true, message: lines.join('\n'), trends: lines }
    },
  })

  const toolCollectionStatus = defineTool({
    name: 'xhs_collection_status',
    description: '查询指定账号的指标采集状态（running/success/failed、最近成功时间、错误）。',
    parameters: {
      accountId: { type: 'string', required: true, description: '账号 id' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
          status: { type: 'string', required: true },
        },
      },
      render: (_args, value) => render(value),
    },
    isConcurrencySafe: () => true,
    async execute(args: { accountId: string }, _exec: unknown) {
      const account = store.listAccounts().find(item => item.id === args.accountId)
      if (account === undefined) {
        return { ok: false, message: `账号不存在：${args.accountId}`, status: 'unknown' }
      }
      const status = account.collectionStatus ?? { running: false, lastStatus: 'idle' as const }
      const parts = [`状态：${status.running ? '采集中' : status.lastStatus}`]
      if (status.lastSuccessAt !== undefined) parts.push(`最近成功：${status.lastSuccessAt}`)
      if (status.lastError !== undefined) parts.push(`错误：${status.lastError}`)
      return { ok: true, message: parts.join('；'), status: status.lastStatus }
    },
  })

  return [toolToday, toolDraftSave, toolTopics, toolTopicAdd, toolAccounts, toolDraftStatus, toolNotes, toolTrends, toolCollectionStatus]
}
