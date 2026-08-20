/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */

import { XHS_API } from '../protocol.ts'
import type { DraftMetrics, DraftStatus } from '../types.ts'
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
  async updateAccount(id: string, payload: AccountPayload): Promise<{ id: string }> {
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

  // ------------------------------------------------------------ 已发布笔记
  async listNotes(accountId?: string): Promise<Array<{ id: string; accountId: string; title: string; copy: string; topic?: string; contentType?: string; sourceUrl?: string; publishedAt: string; source: string; weight: number; createdAt: string; updatedAt: string }>> {
    const body = await readJson<{ notes: Array<{ id: string; accountId: string; title: string; copy: string; topic?: string; contentType?: string; sourceUrl?: string; publishedAt: string; source: string; weight: number; createdAt: string; updatedAt: string }> }>(await fetch(XHS_API.notes + query({ account: accountId })))
    return body.notes
  }
  async setNoteWeight(accountId: string, noteId: string, weight: number): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.notes + query({ account: accountId, note: noteId }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ weight }) }))
  }

  // ------------------------------------------------------------ 趋势
  async listTrends(accountId: string): Promise<Array<{ id: string; title: string; summary?: string; sourceUrl?: string; likes?: number; favorites?: number; comments?: number; collectedAt: string }>> {
    const body = await readJson<{ trends: Array<{ id: string; title: string; summary?: string; sourceUrl?: string; likes?: number; favorites?: number; comments?: number; collectedAt: string }> }>(await fetch(XHS_API.trends + query({ account: accountId })))
    return body.trends
  }
  async collectTrends(accountId: string, searchQuery?: string, maxItems?: number): Promise<Array<{ title: string; score: number; reasons: string[] }>> {
    const body = await readJson<{ trends: Array<{ title: string; score: number; reasons: string[] }> }>(await fetch(XHS_API.trends + query({ account: accountId }), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: searchQuery, maxItems }) }))
    return body.trends
  }

  // ------------------------------------------------------------ 指标
  async listMetrics(accountId: string, noteId?: string): Promise<Array<{ id: string; noteId: string; reads: number; likes: number; favorites: number; comments: number; collectedAt: string; source: string; status: string }>> {
    const body = await readJson<{ metrics: Array<{ id: string; noteId: string; reads: number; likes: number; favorites: number; comments: number; collectedAt: string; source: string; status: string }> }>(await fetch(XHS_API.metrics + query({ account: accountId, note: noteId })))
    return body.metrics
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
  async studioSaveDraft(accountId: string, topicId: string, copy: string, coverPrompt: string): Promise<{ id: string }> {
    const body = await readJson<{ draft: { id: string } }>(await fetch(XHS_API.studio + '/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId, topicId, copy, coverPrompt }) }))
    return body.draft
  }

  // ------------------------------------------------------------ 草稿
  async listDrafts(): Promise<Array<{ id: string; accountId: string; topicId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }>> {
    const body = await readJson<{ drafts: Array<{ id: string; accountId: string; topicId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }> }>(await fetch(XHS_API.drafts))
    return body.drafts
  }
  async setDraftStatus(draftId: string, status: 'published' | 'dropped', metrics?: DraftMetrics): Promise<void> {
    await readJson<{ draft: unknown }>(await fetch(XHS_API.drafts + '/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId, status, metrics }) }))
  }
  async updateDraft(draftId: string, payload: { copy?: string; coverPrompt?: string; tags?: string }): Promise<void> {
    await readJson<{ draft: unknown }>(await fetch(XHS_API.drafts + query({ draft: draftId }), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
  }
}
