/** 矩阵专属创作会话：账号级上下文组装、模型调用、消息与草稿保存。 */

import { MatrixStore } from './store.ts'
import type { Draft, DraftEvidence, StudioMessage } from './types.ts'

/** 一次模型补全请求（矩阵会话内，只含文本消息）。 */
export interface StudioCompleteRequest {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}

/** 模型客户端抽象：注入实现，避免 studio 直接依赖 Host 服务。 */
export interface StudioLlmClient {
  complete(request: StudioCompleteRequest): Promise<{ text: string }>
}

/** 创作上下文组装结果。 */
export interface StudioContext {
  context: string
  truncated: boolean
  warning?: string
}

/** 上下文估算的每字符 token 上界（用于可见的限制提示）。 */
const CHARS_PER_TOKEN = 3

/** 只读取当前账号矩阵数据并组装为上下文；绝不复用主工作区内容。 */
export function buildStudioContext(
  store: MatrixStore,
  accountId: string,
  mode: 'full' | 'creative',
  maxInputChars?: number,
): StudioContext {
  const account = store.listAccounts().find(item => item.id === accountId)
  if (account === undefined) throw new Error(`账号不存在：${accountId}`)
  const persona = store.listPersonas().find(item => item.id === account.personaId)
  if (persona === undefined) throw new Error('该账号尚未分配人设')
  const notes = store.listPublishedNotes(accountId)
  const snapshots = store.listMetricSnapshots(accountId)
  const trends = store.listTrendSamples(accountId)

  const personaLines = [
    `【人设名称】${persona.name}`,
    persona.positioning !== undefined ? `【账号定位】${persona.positioning}` : '',
    persona.audience !== undefined ? `【目标受众】${persona.audience}` : '',
    persona.expertise !== undefined ? `【擅长领域】${persona.expertise}` : '',
    persona.contentDirections !== undefined ? `【内容方向】${persona.contentDirections}` : '',
    persona.hookStyles !== undefined && persona.hookStyles.length > 0 ? `【钩子风格】${persona.hookStyles.join('、')}` : '',
    persona.bodyStructure !== undefined ? `【正文结构】${persona.bodyStructure}` : '',
    persona.endingStyle !== undefined ? `【结尾互动】${persona.endingStyle}` : '',
    persona.forbiddenExpressions !== undefined ? `【禁用表达】${persona.forbiddenExpressions}` : '',
    persona.topicCriteria !== undefined ? `【选题标准】${persona.topicCriteria}` : '',
    persona.defaultHashtags !== undefined && persona.defaultHashtags.length > 0 ? `【默认话题】${persona.defaultHashtags.join(' ')}` : '',
    `【系统提示词】${persona.prompt}`,
  ].filter(line => line !== '').join('\n')

  const noteLines = notes.map(note => {
    const metric = snapshots.filter(snapshot => snapshot.noteId === note.id).at(-1)
    const metricText = metric === undefined ? '暂无指标' : `阅读 ${metric.reads} / 点赞 ${metric.likes} / 收藏 ${metric.favorites} / 评论 ${metric.comments}`
    return `- 权重 ${note.weight} | ${note.title} | ${metricText}${note.sourceUrl !== undefined ? ` | ${note.sourceUrl}` : ''}\n  ${note.copy.slice(0, 200)}`
  })
  const trendLines = trends.slice(0, 20).map(trend => `- ${trend.title}（${trend.summary ?? ''}）`)
  const positiveNotes = notes.filter(note => note.weight >= 3)
  const negativeNotes = notes.filter(note => note.weight === 0)

  const context = [
    `# 矩阵创作上下文（仅账号：${account.name}）`,
    '',
    '## 账号人设',
    personaLines,
    '',
    mode === 'full' ? '## 已发布笔记知识库（完整）' : `## 已发布笔记知识库（${notes.length} 篇，优先高权重）`,
    noteLines.join('\n'),
    '',
    '## 外部趋势样本',
    trendLines.join('\n') || '（暂无外部趋势样本）',
    '',
    negativeNotes.length > 0
      ? `## 负向经验（权重 0，应尽量避免同类型方向）\n${negativeNotes.map(note => `- ${note.title}`).join('\n')}`
      : '',
    positiveNotes.length > 0
      ? `## 高权重参考（权重 ≥3，优先借鉴其成功规律）\n${positiveNotes.map(note => `- ${note.title}`).join('\n')}`
      : '',
  ].filter(line => line !== '').join('\n')

  if (maxInputChars !== undefined && context.length > maxInputChars) {
    return { context: '', truncated: true, warning: `上下文超出当前模型上限（约 ${Math.ceil(context.length / CHARS_PER_TOKEN)} token），请切换创作模式或减少知识库内容。` }
  }
  return { context, truncated: false }
}

/** 创作会话服务。 */
export class StudioService {
  constructor(
    private readonly store: MatrixStore,
    private readonly llm: StudioLlmClient,
    private readonly modelLabel = '当前 Harness 模型',
  ) {}

  /** 追加用户消息，组装上下文，调用模型，保存助手消息。 */
  async send(accountId: string, input: string, mode: 'full' | 'creative', maxInputChars?: number): Promise<{ message: StudioMessage; evidence: DraftEvidence; warning?: string }> {
    this.store.listAccounts().find(item => item.id === accountId) ?? (() => { throw new Error(`账号不存在：${accountId}`) })()
    const built = buildStudioContext(this.store, accountId, mode, maxInputChars)
    if (built.truncated) throw new Error(built.warning ?? '上下文超出限制')
    const history = this.store.listStudioMessages(accountId)
    const messages = [
      ...history.map(message => ({ role: message.role as 'user' | 'assistant', content: message.content })),
      { role: 'user' as const, content: input },
    ]
    const system = [
      built.context,
      '',
      '你是矩阵专属创作助手。只处理当前账号的小红书人设、已发布内容、外部趋势、选题分析、文案创作与草稿编辑。',
      '不要读取或操作 DeepSeek Harness 主工作区的文件、会话或工具，也不要回答与矩阵创作无关的问题。',
      '参考外部趋势时只借鉴选题角度、结构和用户需求，不得复制原文、图片、独特经历，也不得仅替换词语改写。',
      '生成结果不会自动发布；草稿必须由用户明确保存后才会落库。',
    ].join('\n')
    const response = await this.llm.complete({ system, messages, maxTokens: 4000 })
    this.store.saveStudioMessage({ accountId, role: 'user', content: input })
    const message = this.store.saveStudioMessage({ accountId, role: 'assistant', content: response.text })
    const evidence: DraftEvidence = {
      persona: `${this.store.listPersonas().find(p => p.id === this.store.listAccounts().find(a => a.id === accountId)?.personaId)?.name ?? ''}`,
      noteIds: this.store.listPublishedNotes(accountId).filter(note => note.weight >= 3).map(note => note.id),
      trendIds: this.store.listTrendSamples(accountId).slice(0, 20).map(trend => trend.id),
      reasons: [`基于账号人设、高权重历史内容与外部趋势生成；使用模型：${this.modelLabel}`],
    }
    return { message, evidence }
  }

  /** 保存一条草稿（可带生成依据），不发布。 */
  saveDraft(accountId: string, payload: { topicId: string; copy: string; coverPrompt: string; evidence?: DraftEvidence }): Draft {
    this.store.listAccounts().find(item => item.id === accountId) ?? (() => { throw new Error(`账号不存在：${accountId}`) })()
    const topic = this.store.listTopics().find(item => item.id === payload.topicId)
    if (topic === undefined) throw new Error('选题不存在')
    const date = new Date().toISOString().slice(0, 10)
    const draft = this.store.saveDraft({ accountId, topicId: payload.topicId, date, copy: payload.copy, coverPrompt: payload.coverPrompt })
    draft.evidence = payload.evidence
    return draft
  }
}
