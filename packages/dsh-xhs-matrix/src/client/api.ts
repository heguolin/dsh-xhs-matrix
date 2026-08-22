/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */

import { XHS_API } from '../protocol.ts'
import type { StudioSseEvent } from '../studio.ts'
import type {
  DraftEvidence, DraftMetrics, DraftQualityReport, DraftStatus, NoteWeight, PendingOwnership,
  PublishedNote, ViralBatch, ViralItem, ViralStatus,
} from '../types.ts'
import type { AccountPayload, PersonaPayload } from '../store.ts'

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

/**
 * 人设作用域：公开资产方法以 personaId（string）为主参数；兼容期使用显式
 * `{ accountId }` 对象，避免把裸字符串静默当作账号或人设猜测。
 */
type AssetScope = string | { accountId: string }

/** 解析一条 SSE data 载荷为结构化事件；未知类型返回 undefined（跳过）。 */
function parseSseEvent(data: string): StudioSseEvent | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const type = (raw as { type?: unknown }).type
  switch (type) {
    case 'phase': {
      const phase = (raw as { phase?: unknown }).phase
      if (phase !== 'planning' && phase !== 'drafting' && phase !== 'polishing' && phase !== 'checking') return undefined
      return { type: 'phase', phase }
    }
    case 'evidence':
      return raw as StudioSseEvent
    case 'plan_delta': {
      const delta = (raw as { delta?: unknown }).delta
      if (typeof delta !== 'string') return undefined
      return { type: 'plan_delta', delta }
    }
    case 'content_delta': {
      const delta = (raw as { delta?: unknown }).delta
      if (typeof delta !== 'string') return undefined
      return { type: 'content_delta', delta }
    }
    case 'quality':
      return raw as StudioSseEvent
    case 'done':
      return raw as StudioSseEvent
    case 'error': {
      const stage = (raw as { stage?: unknown }).stage
      const retryable = (raw as { retryable?: unknown }).retryable
      const message = (raw as { message?: unknown }).message
      return {
        type: 'error',
        stage: typeof stage === 'string' ? stage : 'stream',
        retryable: retryable === true,
        message: typeof message === 'string' ? message : String(raw),
      }
    }
    default:
      return undefined
  }
}

/** 面板数据入口。 */
export class XhsApi {
  // ------------------------------------------------------------ 账号
  async listAccounts(): Promise<Array<{
    id: string; name: string; personaId: string; enabled: boolean; createdAt: string
    connection?: { profileUrl?: string; externalId?: string; status: string; source?: string; lastError?: string; lastSuccessAt?: string }
    collection?: { enabled: boolean; intervalMinutes: number; maxItems: number }
    collectionStatus?: { running: boolean; lastStatus: string; lastSuccessAt?: string; lastError?: string }
  }>> {
    const body = await readJson<{ accounts: Array<{
      id: string; name: string; personaId: string; enabled: boolean; createdAt: string
      connection?: { profileUrl?: string; externalId?: string; status: string; source?: string; lastError?: string; lastSuccessAt?: string }
      collection?: { enabled: boolean; intervalMinutes: number; maxItems: number }
      collectionStatus?: { running: boolean; lastStatus: string; lastSuccessAt?: string; lastError?: string }
    }> }>(await fetch(XHS_API.accounts))
    return body.accounts
  }
  async createAccount(payload: AccountPayload): Promise<{ id: string }> {
    const body = await readJson<{ account: { id: string } }>(await fetch(XHS_API.accounts, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return body.account
  }
  async updateAccount(id: string, payload: AccountPayload & {
    connection?: { profileUrl?: string; externalId?: string; status?: string; source?: string }
  }): Promise<{ id: string }> {
    const body = await readJson<{ account: { id: string } }>(await fetch(XHS_API.accounts + query({ account: id }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return body.account
  }
  async deleteAccount(id: string): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.accounts + query({ account: id }), { method: 'DELETE' }))
  }
  async importPublishedNotes(accountId: string, format: 'csv' | 'json', content: string, personaId?: string): Promise<number> {
    const body = await readJson<{ imported: number }>(await fetch(XHS_API.accountImport, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, format, content, personaId }),
    }))
    return body.imported
  }

  // ------------------------------------------------------------ 人设
  async listPersonas(): Promise<Array<{
    id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string
    positioning?: string; audience?: string; expertise?: string; contentDirections?: string
    hookStyles?: string[]; bodyStructure?: string; endingStyle?: string
    forbiddenExpressions?: string; topicCriteria?: string; defaultHashtags?: string[]
    writingStyles?: string[]; endingHookConstraints?: string; endingHookExamples?: string[]; forbiddenWords?: string[]
  }>> {
    const body = await readJson<{ personas: Array<{
      id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string
      positioning?: string; audience?: string; expertise?: string; contentDirections?: string
      hookStyles?: string[]; bodyStructure?: string; endingStyle?: string
      forbiddenExpressions?: string; topicCriteria?: string; defaultHashtags?: string[]
      writingStyles?: string[]; endingHookConstraints?: string; endingHookExamples?: string[]; forbiddenWords?: string[]
    }> }>(await fetch(XHS_API.personas))
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

  // ------------------------------------------------------------ 私用：人设作用域查询参数
  private scopeParams(scope: AssetScope): Record<string, string> {
    return typeof scope === 'string' ? { persona: scope } : { account: scope.accountId }
  }

  // ------------------------------------------------------------ 爆款池
  /** 按人设与审核状态列出爆款池条目（所有批次拍平）。 */
  async listViralItems(scope: AssetScope, status?: ViralStatus): Promise<ViralItem[]> {
    const batches = await this.listViralBatches(scope, status)
    return batches.flatMap(batch => batch.items)
  }
  /** 按采集批次列出爆款池（每批含条目）；status 过滤条目。personaId 为主参数，兼容显式 { accountId }。 */
  async listViralBatches(scope: AssetScope, status?: ViralStatus): Promise<Array<ViralBatch & { items: ViralItem[] }>> {
    const body = await readJson<{ batches: Array<ViralBatch & { items: ViralItem[] }> }>(await fetch(XHS_API.viral + query({ ...this.scopeParams(scope), status })))
    return body.batches
  }
  /** 删除整个采集批次（该批全部条目）。 */
  async deleteViralBatch(scope: AssetScope, batchId: string): Promise<number> {
    const body = await readJson<{ deleted: number }>(await fetch(XHS_API.viral + query({ ...this.scopeParams(scope), batch: batchId }), { method: 'DELETE' }))
    return body.deleted
  }
  /** 采集爆款入库（query/maxItems 缺省时由后端按人设方向降级生成搜索词与条数）。 */
  async collectViral(accountId: string, query?: string, maxItems?: number): Promise<ViralItem[]> {
    const body = await readJson<{ items: ViralItem[] }>(await fetch(XHS_API.viral, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, query, maxItems }),
    }))
    return body.items
  }
  /** 审核爆款条目为 accepted / ignored。 */
  async reviewViralItem(scope: AssetScope, itemId: string, status: 'accepted' | 'ignored'): Promise<ViralItem> {
    const body = await readJson<{ item: ViralItem }>(await fetch(XHS_API.viral + query({ ...this.scopeParams(scope), item: itemId }), {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }))
    return body.item
  }
  /** 调整爆款人工权重（0-5），以 personaId 为主参数。 */
  async setViralWeight(personaId: string, itemId: string, weight: NoteWeight): Promise<ViralItem> {
    const body = await readJson<{ item: ViralItem }>(await fetch(XHS_API.viral + query({ persona: personaId, item: itemId }), {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weight }),
    }))
    return body.item
  }
  /** 手动新增爆款（personaId 为主参数）。 */
  async addManualViral(personaId: string, payload: { title: string; body: string; sourceUrl?: string; publishedAt?: string; reasons?: string[] }): Promise<ViralItem> {
    const body = await readJson<{ item: ViralItem }>(await fetch(XHS_API.viralManual, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId, ...payload }),
    }))
    return body.item
  }
  /** 显式转移爆款到目标人设。 */
  async transferVirals(personaId: string, targetPersonaId: string, itemIds: string[]): Promise<ViralItem[]> {
    const body = await readJson<{ items: ViralItem[] }>(await fetch(XHS_API.viralTransfer, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId, targetPersonaId, itemIds }),
    }))
    return body.items
  }

  // ------------------------------------------------------------ 已发布笔记
  async listNotes(scope: AssetScope): Promise<PublishedNote[]> {
    const body = await readJson<{ notes: PublishedNote[] }>(await fetch(XHS_API.notes + query(this.scopeParams(scope))))
    return body.notes
  }
  async setNoteWeight(scope: AssetScope, noteId: string, weight: NoteWeight): Promise<void> {
    await readJson<{ note: PublishedNote }>(await fetch(XHS_API.notes + query({ ...this.scopeParams(scope), note: noteId }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ weight }) }))
  }
  /** 显式转移已发布笔记到目标人设。 */
  async transferNotes(personaId: string, targetPersonaId: string, noteIds: string[]): Promise<PublishedNote[]> {
    const body = await readJson<{ notes: PublishedNote[] }>(await fetch(XHS_API.notesTransfer, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ personaId, targetPersonaId, noteIds }),
    }))
    return body.notes
  }

  // ------------------------------------------------------------ 待归属数据
  async listPending(): Promise<PendingOwnership[]> {
    const body = await readJson<{ pending: PendingOwnership[] }>(await fetch(XHS_API.pendingOwnership))
    return body.pending
  }
  async assignPending(id: string, targetPersonaId: string): Promise<PublishedNote | ViralItem> {
    const body = await readJson<{ asset: PublishedNote | ViralItem }>(await fetch(XHS_API.pendingOwnership, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, targetPersonaId }),
    }))
    return body.asset
  }

  // ------------------------------------------------------------ 指标
  async listMetrics(accountId: string, noteId?: string): Promise<Array<{ id: string; noteId: string; accountId: string; reads: number; likes: number; favorites: number; comments: number; collectedAt: string; source: string; status: string }>> {
    const body = await readJson<{ metrics: Array<{ id: string; noteId: string; accountId: string; reads: number; likes: number; favorites: number; comments: number; collectedAt: string; source: string; status: string }> }>(await fetch(XHS_API.metrics + query({ account: accountId, note: noteId })))
    return body.metrics
  }
  /** 手动录入一条指标快照（运维用，来源 manual）。 */
  async saveMetricSnapshot(accountId: string, noteId: string, reads: number): Promise<void> {
    await readJson<{ metric: unknown }>(await fetch(XHS_API.metrics, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, noteId, reads, likes: 0, favorites: 0, comments: 0, source: 'manual', collectedAt: new Date().toISOString() }),
    }))
  }

  // ------------------------------------------------------------ Apify 配置
  async getApifyConfig(): Promise<{ actorId: string; apiToken: string; maxItems: number; requestTimeoutMs: number; maxPolls: number }> {
    const body = await readJson<{ settings: { actorId: string; apiToken: string; maxItems: number; requestTimeoutMs: number; maxPolls: number } }>(await fetch(XHS_API.settingsApify))
    return body.settings
  }
  async updateApifyConfig(payload: { actorId?: string; apiToken?: string; maxItems?: number; requestTimeoutMs?: number; maxPolls?: number }): Promise<{ actorId: string; apiToken: string; maxItems: number; requestTimeoutMs: number; maxPolls: number }> {
    const body = await readJson<{ settings: { actorId: string; apiToken: string; maxItems: number; requestTimeoutMs: number; maxPolls: number } }>(await fetch(XHS_API.settingsApify, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
    return body.settings
  }

  // ------------------------------------------------------------ 创作台
  async listStudioMessages(accountId: string): Promise<Array<{ id: string; role: string; content: string; receivedAt: string }>> {
    const body = await readJson<{ messages: Array<{ id: string; role: string; content: string; receivedAt: string }> }>(await fetch(XHS_API.studioMessages + query({ account: accountId })))
    return body.messages
  }
  async studioSend(accountId: string, input: string, mode: 'full' | 'creative'): Promise<{ message: { id: string; content: string }; evidence: DraftEvidence; warning?: string }> {
    const body = await readJson<{ message: { id: string; content: string }; evidence: DraftEvidence; warning?: string }>(await fetch(XHS_API.studioMessages + query({ account: accountId }), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input, mode }) }))
    return body
  }
  /**
   * 流式发送创作指令（结构化 SSE）：按完整空白行分隔解析类型化事件，
   * 跨 chunk 保留缓冲区；onEvent 按顺序收到 type/phase/evidence/plan_delta/
   * content_delta/quality/done/error。错误事件抛 XhsApiError；done 提供
   * messageId/coverPrompt/personaId。requestId 透传到请求体用于幂等去重。
   */
  async studioSendStream(
    accountId: string, input: string, mode: 'full' | 'creative',
    onEvent: (event: StudioSseEvent) => void,
    requestId?: string,
  ): Promise<{ messageId: string; coverPrompt: string; evidence?: DraftEvidence; personaId?: string; quality?: DraftQualityReport; warning?: string }> {
    const response = await fetch(XHS_API.studioMessages + query({ account: accountId }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input, mode, stream: true, requestId }),
    })
    if (!response.ok) {
      const body = await response.json().catch(() => undefined)
      const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `HTTP ${response.status}`
      throw new XhsApiError(message)
    }
    if (response.body === null) throw new XhsApiError('流式响应无 body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let summary: { messageId: string; coverPrompt: string; evidence?: DraftEvidence; personaId?: string; quality?: DraftQualityReport } | undefined
    let failed: string | undefined
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // 只在出现完整空白行分隔后解析事件（缓冲区可能跨网络 chunk 收齐）。
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const eventText = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const rawLine of eventText.split('\n')) {
          const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
          if (!line.startsWith('data: ')) continue
          const event = parseSseEvent(line.slice(6))
          if (event === undefined) continue
          onEvent(event)
          if (event.type === 'error') failed = event.message
          if (event.type === 'done') {
            summary = {
              messageId: event.messageId,
              coverPrompt: event.coverPrompt ?? '',
              evidence: event.evidence,
              personaId: event.personaId,
              quality: event.quality,
            }
          }
        }
      }
    }
    if (failed !== undefined) throw new XhsApiError(failed)
    if (summary === undefined) throw new XhsApiError('流式响应未正常结束')
    return summary
  }
  /** 保存创作台草稿（v3 草稿独立，不含 topicId）。 */
  async studioSaveDraft(accountId: string, copy: string, coverPrompt: string, evidence?: DraftEvidence): Promise<{ id: string }> {
    const body = await readJson<{ draft: { id: string } }>(await fetch(XHS_API.studio + '/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId, copy, coverPrompt, evidence }) }))
    return body.draft
  }

  // ------------------------------------------------------------ 草稿
  async listDrafts(): Promise<Array<{ id: string; accountId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }>> {
    const body = await readJson<{ drafts: Array<{ id: string; accountId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }> }>(await fetch(XHS_API.drafts))
    return body.drafts
  }
  async setDraftStatus(draftId: string, status: 'published' | 'dropped', metrics?: DraftMetrics): Promise<void> {
    await readJson<{ draft: unknown }>(await fetch(XHS_API.drafts + '/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId, status, metrics }) }))
  }
  async updateDraft(draftId: string, payload: { copy?: string; coverPrompt?: string; tags?: string }): Promise<void> {
    await readJson<{ draft: unknown }>(await fetch(XHS_API.drafts + query({ draft: draftId }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
  }
}
