/** 矩阵专属创作会话：账号级上下文组装、两阶段模型调用、结构化 SSE 与消息/草稿保存。 */

import type { ContentQualityService } from './content-quality.ts'
import { MatrixStore } from './store.ts'
import type { Account, Draft, DraftEvidence, DraftQualityReport, Persona, StudioMessage } from './types.ts'

/** 一次模型补全请求（矩阵会话内，只含文本消息）。 */
export interface StudioCompleteRequest {
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}

/** 模型客户端抽象：注入实现，避免 studio 直接依赖 Host 服务。 */
export interface StudioLlmClient {
  complete(request: StudioCompleteRequest): Promise<{ text: string }>
  /** 流式补全：onDelta 收到文本增量，返回完整文本。 */
  stream(request: StudioCompleteRequest, onDelta: (delta: string) => void): Promise<string>
}

/** 从模型输出中拆分正文与封面提示词；无标记时整段视为正文。 */
export function parseCoverPrompt(text: string): { copy: string; coverPrompt: string } {
  const marker = '【封面提示词】'
  const index = text.indexOf(marker)
  if (index < 0) return { copy: text.trim(), coverPrompt: '' }
  const copy = text.slice(0, index).trim()
  const coverPrompt = text.slice(index + marker.length).trim()
  return { copy, coverPrompt }
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
  const notes = store.listPublishedNotes(account.personaId)
  const snapshots = store.listMetricSnapshots(accountId)
  // v4 创作参考：该人设已采纳的爆款池条目（pending/ignored 不进入上下文）。
  const viralItems = store.listViralItems(account.personaId, 'accepted')

  // v4 人设字段（写作风格/结尾钩子约束与案例/违禁词）；旧 hookStyles/endingStyle/forbiddenExpressions 仅作读取回退。
  const writingStyles = persona.writingStyles ?? persona.hookStyles
  const endingHookConstraints = persona.endingHookConstraints ?? persona.endingStyle
  const endingHookExamples = persona.endingHookExamples ?? []
  const forbiddenWords = persona.forbiddenWords ?? (persona.forbiddenExpressions !== undefined ? persona.forbiddenExpressions.split(/[、,，\s]+/).filter(word => word !== '') : undefined)

  const personaLines = [
    `【人设名称】${persona.name}`,
    persona.positioning !== undefined ? `【账号定位】${persona.positioning}` : '',
    persona.audience !== undefined ? `【目标受众】${persona.audience}` : '',
    persona.expertise !== undefined ? `【擅长领域】${persona.expertise}` : '',
    persona.contentDirections !== undefined ? `【内容方向】${persona.contentDirections}` : '',
    writingStyles !== undefined && writingStyles.length > 0 ? `【写作风格】${writingStyles.join('、')}` : '',
    persona.bodyStructure !== undefined ? `【正文结构】${persona.bodyStructure}` : '',
    endingHookConstraints !== undefined ? `【结尾互动钩子约束】${endingHookConstraints}` : '',
    endingHookExamples.length > 0 ? `【结尾钩子最佳案例】${endingHookExamples.join('；')}` : '',
    forbiddenWords !== undefined && forbiddenWords.length > 0 ? `【违禁词】${forbiddenWords.join('、')}` : '',
    persona.topicCriteria !== undefined ? `【选题标准】${persona.topicCriteria}` : '',
    persona.defaultHashtags !== undefined && persona.defaultHashtags.length > 0 ? `【默认话题】${persona.defaultHashtags.join(' ')}` : '',
    `【系统提示词】${persona.prompt}`,
  ].filter(line => line !== '').join('\n')

  const noteLines = notes.map(note => {
    const metric = snapshots.filter(snapshot => snapshot.noteId === note.id).at(-1)
    const metricText = metric === undefined ? '暂无指标' : `阅读 ${metric.reads} / 点赞 ${metric.likes} / 收藏 ${metric.favorites} / 评论 ${metric.comments}`
    return `- 权重 ${note.weight} | ${note.title} | ${metricText}${note.sourceUrl !== undefined ? ` | ${note.sourceUrl}` : ''}\n  ${note.copy.slice(0, 200)}`
  })
  const viralLines = viralItems.slice(0, 20).map(item => `- ${item.title}（${item.reasons.join('、')}）`)
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
    '## 已采纳爆款参考',
    viralLines.join('\n') || '（暂无已采纳爆款参考）',
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

/** 结构化 SSE 事件类型（权威定义，见 task-6-brief）。 */
export type StudioSseEvent =
  | { type: 'phase'; phase: 'planning' | 'drafting' | 'polishing' | 'checking' }
  | { type: 'evidence'; evidence: DraftEvidence }
  | { type: 'plan_delta'; delta: string }
  | { type: 'content_delta'; delta: string }
  | { type: 'quality'; report: DraftQualityReport; allowed: boolean }
  | { type: 'done'; messageId: string; coverPrompt: string; quality: DraftQualityReport; evidence: DraftEvidence; personaId: string; deduplicated?: boolean }
  | { type: 'error'; stage: string; retryable: boolean; message: string }

/** 流式发送可选参数。 */
export interface StudioStreamOptions {
  /** 请求幂等 id：完成后重试返回 deduplicated，进行中重复抛「请求进行中」。 */
  requestId?: string
  maxInputChars?: number
}

/** 流式发送结果：质量通过/重放时含 done；违禁词命中时 done 为 undefined。 */
export interface StudioStreamResult {
  done?: Extract<StudioSseEvent, { type: 'done' }>
}

/** 同一请求 id 正在进行中（并发去重）。 */
export class StudioBusyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudioBusyError'
  }
}

/** 命中人设违禁词，禁止保存草稿。 */
export class QualityBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QualityBlockedError'
  }
}

/** 创作会话服务：两阶段生成、结构化流式事件与消息/草稿保存。 */
export class StudioService {
  /** 进程内仅供进行中请求的去重 key；完成后从集合删除，禁止无界保存历史 requestId。 */
  private readonly inFlight = new Set<string>()

  constructor(
    private readonly store: MatrixStore,
    private readonly llm: StudioLlmClient,
    private readonly quality: ContentQualityService,
    private readonly modelLabel = '当前 Harness 模型',
  ) {}

  /** 指定请求 id 是否正在生成中（供路由在 SSE 建流前返回 409）。 */
  isInFlight(requestId: string): boolean {
    return this.inFlight.has(requestId)
  }

  private requireAccount(accountId: string): Account {
    const account = this.store.listAccounts().find(item => item.id === accountId)
    if (account === undefined) throw new Error(`账号不存在：${accountId}`)
    return account
  }

  /** 取账号当前（唯一）人设；未分配或已删除时阻止创作。 */
  private requirePersona(personaId: string): Persona {
    const persona = this.store.listPersonas().find(item => item.id === personaId)
    if (persona === undefined) throw new Error('该账号尚未分配人设')
    return persona
  }

  private buildSystemPrompt(context: string): string {
    return [
      context,
      '',
      '你是矩阵专属创作助手。只处理当前账号的小红书人设、已发布内容、爆款池参考、内容创作、文案创作与草稿编辑。',
      '不要读取或操作 DeepSeek Harness 主工作区的文件、会话或工具，也不要回答与矩阵创作无关的问题。',
      '参考爆款池中已采纳的爆款时只借鉴选题角度、结构和用户需求，不得复制原文、图片、独特经历，也不得仅替换词语改写。',
      '生成结果不会自动发布；草稿必须由用户明确保存后才会落库。',
      '【输出格式】生成完整文案后，在末尾另起一行输出封面提示词，以【封面提示词】开头：',
      '【封面提示词】<封面画面描述，100 字内，含主体/场景/风格/配色/文案字>',
    ].join('\n')
  }

  private buildMessages(history: StudioMessage[], input: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [
      ...history.map(message => ({ role: message.role as 'user' | 'assistant', content: message.content })),
      { role: 'user' as const, content: input },
    ]
  }

  private buildEvidence(accountId: string, persona: Persona): DraftEvidence {
    const notes = this.store.listPublishedNotes(persona.id)
    const viralItems = this.store.listViralItems(persona.id, 'accepted')
    return {
      persona: persona.name,
      noteIds: notes.filter(note => note.weight >= 3).map(note => note.id),
      trendIds: viralItems.slice(0, 20).map(item => item.id),
      reasons: [`基于账号人设、高权重历史内容与已采纳爆款参考生成；使用模型：${this.modelLabel}`],
    }
  }

  /** 追加用户消息，组装上下文（只读当前人设快照），两阶段生成，质量通过后保存助手消息。 */
  async send(accountId: string, input: string, mode: 'full' | 'creative', maxInputChars?: number): Promise<{ message: StudioMessage; evidence: DraftEvidence; warning?: string }> {
    const account = this.requireAccount(accountId)
    const persona = this.requirePersona(account.personaId)
    const built = buildStudioContext(this.store, accountId, mode, maxInputChars)
    if (built.truncated) throw new Error(built.warning ?? '上下文超出限制')
    const history = this.store.listStudioMessages(accountId, persona.id)
    const messages = this.buildMessages(history, input)
    const system = this.buildSystemPrompt(built.context)
    const rawDraft = (await this.llm.complete({ system, messages, maxTokens: 4000 })).text
    const finalCopy = await this.quality.naturalizeStream(rawDraft, persona, () => {})
    const { report, allowed } = this.quality.check(finalCopy, persona)
    if (!allowed) {
      const words = report.forbiddenWordHits.map(hit => hit.word).join('、')
      throw new QualityBlockedError(`命中人设违禁词，禁止保存：${words}`)
    }
    const { copy } = parseCoverPrompt(finalCopy)
    this.store.saveStudioMessage({ accountId, role: 'user', content: input, personaIdSnapshot: persona.id })
    const message = this.store.saveStudioMessage({ accountId, role: 'assistant', content: copy, personaIdSnapshot: persona.id })
    const evidence = this.buildEvidence(accountId, persona)
    return { message, evidence }
  }

  /**
   * 流式发送（两阶段）：捕获账号与人设快照 → 构建证据 → 流式计划并缓冲原始初稿 →
   * naturalizeStream 输出最终稿增量 → 确定性违禁词扫描 → 质量通过后一次性落库 user/assistant 与 requestId → done。
   * 历史只读取相同 accountId 且 personaIdSnapshot 等于当前人设的消息。
   */
  async sendStream(
    accountId: string,
    input: string,
    mode: 'full' | 'creative',
    onEvent: (event: StudioSseEvent) => void,
    options?: StudioStreamOptions,
  ): Promise<StudioStreamResult> {
    const requestId = options?.requestId
    const maxInputChars = options?.maxInputChars

    // 进行中去重：只追踪在执行中的 key。
    if (requestId !== undefined && this.inFlight.has(requestId)) {
      throw new StudioBusyError(`REQUEST_IN_PROGRESS: 同请求 id 正在生成中：${requestId}`)
    }
    // 持久完成态幂等：同 account + 同 requestId 已落库了 user+assistant，直接重放 done，不调用模型、不重复落库。
    if (requestId !== undefined) {
      const persisted = this.store.listStudioMessagesByRequestId(accountId, requestId)
      if (persisted.length >= 2) {
        const done = this.buildDeduplicatedDone(accountId, persisted)
        onEvent(done)
        return { done }
      }
    }

    if (requestId !== undefined) this.inFlight.add(requestId)
    try {
      const account = this.requireAccount(accountId)
      const persona = this.requirePersona(account.personaId)
      const built = buildStudioContext(this.store, accountId, mode, maxInputChars)
      if (built.truncated) throw new Error(built.warning ?? '上下文超出限制')

      onEvent({ type: 'phase', phase: 'planning' })
      const evidence = this.buildEvidence(accountId, persona)
      onEvent({ type: 'evidence', evidence })

      const history = this.store.listStudioMessages(accountId, persona.id)
      const messages = this.buildMessages(history, input)
      const system = this.buildSystemPrompt(built.context)

      // 阶段一：流式计划，并在服务端缓冲原始初稿（原始初稿不写入会话）。
      onEvent({ type: 'phase', phase: 'drafting' })
      const rawDraft = await this.llm.stream({ system, messages, maxTokens: 4000 }, delta => {
        onEvent({ type: 'plan_delta', delta })
      })

      // 阶段二：去 AI 味审校，输出最终稿增量。
      onEvent({ type: 'phase', phase: 'polishing' })
      const finalCopy = await this.quality.naturalizeStream(rawDraft, persona, delta => {
        onEvent({ type: 'content_delta', delta })
      })

      // 确定性违禁词扫描（质量门）。
      onEvent({ type: 'phase', phase: 'checking' })
      const { report, allowed } = this.quality.check(finalCopy, persona)
      onEvent({ type: 'quality', report, allowed })
      if (!allowed) {
        // 不落消息（原子事务回滚），不产出 done，只标记未通过。
        return { done: undefined }
      }

      // 原子持久化：user + assistant 两条消息 + requestId + personaIdSnapshot。
      const { copy, coverPrompt } = parseCoverPrompt(finalCopy)
      this.store.saveStudioMessage({ accountId, role: 'user', content: input, requestId, personaIdSnapshot: persona.id })
      const assistant = this.store.saveStudioMessage({ accountId, role: 'assistant', content: copy, requestId, personaIdSnapshot: persona.id })
      const done = { type: 'done' as const, messageId: assistant.id, coverPrompt, quality: report, evidence, personaId: persona.id }
      onEvent(done)
      return { done }
    } finally {
      if (requestId !== undefined) this.inFlight.delete(requestId)
    }
  }

  /** 完成态重放：不重新生成，返回 deduplicated 的 done（封面/质检信息不落库，从现有消息重建）。 */
  private buildDeduplicatedDone(accountId: string, persisted: StudioMessage[]): Extract<StudioSseEvent, { type: 'done' }> {
    const account = this.requireAccount(accountId)
    const persona = this.requirePersona(account.personaId)
    const assistant = persisted.find(message => message.role === 'assistant')
    const evidence = this.buildEvidence(accountId, persona)
    return {
      type: 'done',
      messageId: assistant?.id ?? '',
      coverPrompt: '',
      quality: { reviewStatus: 'unchecked', forbiddenWordHits: [], checkedAt: new Date().toISOString(), personaSnapshot: persona.name },
      evidence,
      personaId: persona.id,
      deduplicated: true,
    }
  }

  /** 保存一条草稿（含人设快照与轻量质检报告）；命中违禁词抛 QualityBlockedError，不落库。 */
  saveDraft(accountId: string, payload: { copy: string; coverPrompt: string; evidence?: DraftEvidence }): Draft {
    const account = this.requireAccount(accountId)
    const persona = this.requirePersona(account.personaId)
    const { report, allowed } = this.quality.check(payload.copy, persona)
    if (!allowed) {
      const words = report.forbiddenWordHits.map(hit => hit.word).join('、')
      throw new QualityBlockedError(`命中人设违禁词，禁止保存草稿：${words}`)
    }
    const date = new Date().toISOString().slice(0, 10)
    const draft = this.store.saveDraft({
      accountId,
      date,
      copy: payload.copy,
      coverPrompt: payload.coverPrompt,
      personaIdSnapshot: persona.id,
      qualityReport: report,
    })
    draft.evidence = payload.evidence
    return draft
  }
}
