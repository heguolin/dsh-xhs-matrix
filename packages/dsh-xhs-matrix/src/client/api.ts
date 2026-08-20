/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */

import { XHS_API } from '../protocol.ts'
import type { DraftMetrics, DraftStatus, ViralItem, ViralStatus } from '../types.ts'
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
  async importPublishedNotes(accountId: string, format: 'csv' | 'json', content: string): Promise<number> {
    const body = await readJson<{ imported: number }>(await fetch(XHS_API.accountImport, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, format, content }),
    }))
    return body.imported
  }

  // ------------------------------------------------------------ 人设
  async listPersonas(): Promise<Array<{
    id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string
    positioning?: string; audience?: string; expertise?: string; contentDirections?: string
    hookStyles?: string[]; bodyStructure?: string; endingStyle?: string
    forbiddenExpressions?: string; topicCriteria?: string; defaultHashtags?: string[]
  }>> {
    const body = await readJson<{ personas: Array<{
      id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string
      positioning?: string; audience?: string; expertise?: string; contentDirections?: string
      hookStyles?: string[]; bodyStructure?: string; endingStyle?: string
      forbiddenExpressions?: string; topicCriteria?: string; defaultHashtags?: string[]
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

  // ------------------------------------------------------------ 爆款池
  /** 按账号与审核状态列出爆款池条目（所有批次拍平）。 */
  async listViralItems(accountId: string, status?: ViralStatus): Promise<ViralItem[]> {
    const batches = await this.listViralBatches(accountId, status)
    return batches.flatMap(batch => batch.items)
  }
  /** 按采集批次列出爆款池（每批含条目）；status 过滤条目。 */
  async listViralBatches(accountId: string, status?: ViralStatus): Promise<Array<{ id: string; accountId: string; collectedAt: string; itemCount: number; items: ViralItem[] }>> {
    const body = await readJson<{ batches: Array<{ id: string; accountId: string; collectedAt: string; itemCount: number; items: ViralItem[] }> }>(await fetch(XHS_API.viral + query({ account: accountId, status })))
    return body.batches
  }
  /** 删除整个采集批次（该批全部条目）。 */
  async deleteViralBatch(accountId: string, batchId: string): Promise<number> {
    const body = await readJson<{ deleted: number }>(await fetch(XHS_API.viral + query({ account: accountId, batch: batchId }), { method: 'DELETE' }))
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
  async reviewViralItem(accountId: string, itemId: string, status: 'accepted' | 'ignored'): Promise<ViralItem> {
    const body = await readJson<{ item: ViralItem }>(await fetch(XHS_API.viral + query({ account: accountId, item: itemId }), {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }))
    return body.item
  }

  // ------------------------------------------------------------ 已发布笔记
  async listNotes(accountId?: string): Promise<Array<{ id: string; accountId: string; title: string; copy: string; topic?: string; contentType?: string; sourceUrl?: string; publishedAt: string; source: string; weight: number; createdAt: string; updatedAt: string }>> {
    const body = await readJson<{ notes: Array<{ id: string; accountId: string; title: string; copy: string; topic?: string; contentType?: string; sourceUrl?: string; publishedAt: string; source: string; weight: number; createdAt: string; updatedAt: string }> }>(await fetch(XHS_API.notes + query({ account: accountId })))
    return body.notes
  }
  async setNoteWeight(accountId: string, noteId: string, weight: number): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.notes + query({ account: accountId, note: noteId }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ weight }) }))
  }

  // ------------------------------------------------------------ 指标
  async listMetrics(accountId: string, noteId?: string): Promise<Array<{ id: string; noteId: string; reads: number; likes: number; favorites: number; comments: number; collectedAt: string; source: string; status: string }>> {
    const body = await readJson<{ metrics: Array<{ id: string; noteId: string; reads: number; likes: number; favorites: number; comments: number; collectedAt: string; source: string; status: string }> }>(await fetch(XHS_API.metrics + query({ account: accountId, note: noteId })))
    return body.metrics
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
  async studioSend(accountId: string, input: string, mode: 'full' | 'creative'): Promise<{ message: { id: string; content: string }; evidence: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }; warning?: string }> {
    const body = await readJson<{ message: { id: string; content: string }; evidence: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }; warning?: string }>(await fetch(XHS_API.studioMessages + query({ account: accountId }), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input, mode }) }))
    return body
  }
  /**
   * 流式发送创作指令（SSE）：onDelta 收到文本增量；完成后 resolve 含
   * messageId/coverPrompt/evidence 的摘要。
   */
  async studioSendStream(
    accountId: string, input: string, mode: 'full' | 'creative',
    onDelta: (delta: string) => void,
  ): Promise<{ messageId: string; coverPrompt: string; evidence: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }; warning?: string }> {
    const response = await fetch(XHS_API.studioMessages + query({ account: accountId }), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input, mode, stream: true }),
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
    let summary: { messageId: string; coverPrompt: string; evidence: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }; warning?: string } | undefined
    let failed: string | undefined
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // 按 \n\n 切分 SSE 事件
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload: { delta?: string; done?: boolean; error?: string } = JSON.parse(line.slice(6))
          if (typeof payload.delta === 'string') onDelta(payload.delta)
          if (payload.error !== undefined) failed = payload.error
          if (payload.done === true) summary = payload as never
        }
      }
    }
    if (failed !== undefined) throw new XhsApiError(failed)
    if (summary === undefined) throw new XhsApiError('流式响应未正常结束')
    return summary
  }
  /** 保存创作台草稿（v3 草稿独立，不含 topicId）。 */
  async studioSaveDraft(accountId: string, copy: string, coverPrompt: string, evidence?: { persona?: string; noteIds: string[]; trendIds: string[]; reasons: string[] }): Promise<{ id: string }> {
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
