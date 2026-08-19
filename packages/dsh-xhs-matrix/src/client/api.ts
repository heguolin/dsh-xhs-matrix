/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */

import { XHS_API } from '../protocol.ts'
import type { DraftMetrics, DraftStatus } from '../types.ts'
import type { AccountPayload, NegativePayload, PersonaPayload } from '../store.ts'

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
  async listAccounts(): Promise<Array<{ id: string; name: string; personaId: string; enabled: boolean; createdAt: string }>> {
    const body = await readJson<{ accounts: Array<{ id: string; name: string; personaId: string; enabled: boolean; createdAt: string }> }>(await fetch(XHS_API.accounts))
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

  // ------------------------------------------------------------ 人设
  async listPersonas(): Promise<Array<{ id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string }>> {
    const body = await readJson<{ personas: Array<{ id: string; name: string; prompt: string; toneTags?: string[]; createdAt: string }> }>(await fetch(XHS_API.personas))
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

  // ------------------------------------------------------------ 黑名单
  async listNegatives(): Promise<Array<{ id: string; accountId?: string; keyword: string; reason: string }>> {
    const body = await readJson<{ negatives: Array<{ id: string; accountId?: string; keyword: string; reason: string }> }>(await fetch(XHS_API.negatives))
    return body.negatives
  }
  async addNegative(payload: NegativePayload): Promise<void> {
    await readJson<{ negative: unknown }>(await fetch(XHS_API.negatives, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
  }
  async deleteNegative(id: string): Promise<void> {
    await readJson<{ ok: boolean }>(await fetch(XHS_API.negatives + query({ negative: id }), { method: 'DELETE' }))
  }

  // ------------------------------------------------------------ 草稿
  async listDrafts(): Promise<Array<{ id: string; accountId: string; topicId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }>> {
    const body = await readJson<{ drafts: Array<{ id: string; accountId: string; topicId: string; date: string; copy: string; coverPrompt: string; status: DraftStatus; metrics?: DraftMetrics }> }>(await fetch(XHS_API.drafts))
    return body.drafts
  }
  async setDraftStatus(draftId: string, status: 'published' | 'dropped', metrics?: DraftMetrics): Promise<void> {
    await readJson<{ draft: unknown }>(await fetch(XHS_API.drafts + '/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId, status, metrics }) }))
  }
}
