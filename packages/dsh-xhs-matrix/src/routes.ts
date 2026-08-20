/** /api/dsh-xhs-matrix 路由族：账号/人设/选题/草稿 CRUD。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback.ts'
import { XHS_API } from './protocol.ts'
import { MatrixStore, type AccountPayload, type DraftPayload, type PersonaPayload } from './store.ts'
import { rankTrends, type NormalizedTrend, type TrendProvider } from './trends.ts'
import { validateMetricSnapshot, type MetricSnapshotInput, type CollectionScheduler } from './metrics.ts'
import { StudioService } from './studio.ts'
import type { DraftMetrics, DraftStatus, NoteWeight } from './types.ts'

/** JSON 请求体上限。 */
const MAX_JSON_BODY_BYTES = 256 * 1024

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  // 无请求体（如 DELETE）视为空对象：交给各方法分支校验，而不是误报 invalid JSON body。
  if (text === '') return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function queryParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)
  return value === null ? undefined : value
}

/** 围栏 + 方法检查。 */
function guard(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (!isLoopbackRequest(req)) {
    writeJson(res, 403, { error: 'forbidden: loopback-only' })
    return false
  }
  if (req.method !== method) {
    writeJson(res, 405, { error: `method not allowed: ${req.method}` })
    return false
  }
  return true
}

/** 路由族依赖。 */
export interface RoutesDeps {
  store: MatrixStore
  trendProvider?: TrendProvider
  scheduler?: CollectionScheduler
  studio?: StudioService
}

/**
 * 构建全部 /api/dsh-xhs-matrix 路由。
 * @param deps - 存储。
 * @returns 路由数组。
 */
export function makeRoutes(deps: RoutesDeps): WebRoute[] {
  const { store, trendProvider, scheduler, studio } = deps

  const route = (path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): WebRoute => ({
    kind: 'exact',
    path,
    handler,
  })

  const fail = (res: ServerResponse, error: unknown): void => {
    writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
  }

  return [
    // ------------------------------------------------------------ 账号
    route(XHS_API.accounts, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { accounts: store.listAccounts() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'account')
      try {
        if (method === 'POST') {
          const account = store.upsertAccount(body as unknown as AccountPayload)
          writeJson(res, 201, { account })
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
          let account = store.upsertAccount(body as unknown as AccountPayload, id)
          if (body.connection !== undefined) account = store.updateAccountConnection(id, body.connection as never)
          if (body.collection !== undefined) account = store.updateCollectionConfig(id, body.collection as never)
          writeJson(res, 200, { account })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
          store.deleteAccount(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 账号导入
    route(XHS_API.accountImport, async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined || typeof body.accountId !== 'string' || (body.format !== 'csv' && body.format !== 'json') || typeof body.content !== 'string') {
        writeJson(res, 400, { error: 'accountId、format 和 content 必填' }); return
      }
      try {
        const { applyPublishedNoteImport, parsePublishedNoteImport } = await import('./importer.ts')
        const records = parsePublishedNoteImport(body.content, body.format)
        applyPublishedNoteImport(store, body.accountId, records)
        writeJson(res, 201, { imported: records.length })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------------------ 人设
    route(XHS_API.personas, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { personas: store.listPersonas() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'persona')
      try {
        if (method === 'POST') {
          const persona = store.upsertPersona(body as unknown as PersonaPayload)
          writeJson(res, 201, { persona })
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'persona 查询参数必填' }); return }
          writeJson(res, 200, { persona: store.upsertPersona(body as unknown as PersonaPayload, id) })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'persona 查询参数必填' }); return }
          store.deletePersona(id)
          writeJson(res, 200, { ok: true })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 已发布笔记
    route(XHS_API.notes, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const accountId = queryParam(url, 'account')
      const noteId = queryParam(url, 'note')
      if (method === 'GET') {
        if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
        writeJson(res, 200, { notes: store.listPublishedNotes(accountId) })
        return
      }
      if (method !== 'PATCH') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (accountId === undefined || noteId === undefined) { writeJson(res, 400, { error: 'account 与 note 查询参数必填' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const weight = body.weight
      if (typeof weight !== 'number' || !Number.isInteger(weight) || weight < 0 || weight > 5) {
        writeJson(res, 400, { error: 'weight 必须是 0-5 的整数' }); return
      }
      try {
        const note = store.setNoteWeight(accountId, noteId, weight as NoteWeight)
        writeJson(res, 200, { note })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------------------ 选题
    route(XHS_API.topics, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { topics: store.listTopics() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'topic')
      try {
        if (method === 'POST') {
          if (typeof body.title === 'string') {
            const topics = store.addTopics([body.title])
            writeJson(res, 201, { topics })
          } else if (Array.isArray(body.titles) && body.titles.every(t => typeof t === 'string')) {
            writeJson(res, 201, { topics: store.addTopics(body.titles as string[]) })
          } else {
            writeJson(res, 400, { error: 'body 需含 title 字符串或 titles 字符串数组' })
          }
        } else if (method === 'PATCH') {
          if (id === undefined) { writeJson(res, 400, { error: 'topic 查询参数必填' }); return }
          store.retireTopic(id)
          writeJson(res, 200, { ok: true })
        } else if (method === 'DELETE') {
          writeJson(res, 405, { error: '选题不支持删除，请用 PATCH 标记弃用' })
        } else {
          writeJson(res, 405, { error: `method not allowed: ${method}` })
        }
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 草稿
    route(XHS_API.drafts, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { drafts: store.listDrafts() }); return }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      // 落库前校验载荷与选题存在性：缺失字段或引用不存在的选题都拒绝，避免垃圾草稿持久化后再抛错。
      const requiredDraftFields = ['accountId', 'topicId', 'date', 'copy', 'coverPrompt'] as const
      for (const field of requiredDraftFields) {
        const value = body[field]
        if (typeof value !== 'string' || value.trim() === '') {
          writeJson(res, 400, { error: `草稿字段 ${field} 必填` })
          return
        }
      }
      const topicId = body.topicId as string
      if (!store.listTopics().some(topic => topic.id === topicId)) {
        writeJson(res, 400, { error: '选题不存在' })
        return
      }
      try {
        const draft = store.saveDraft(body as unknown as DraftPayload)
        store.markTopicUsed(draft.topicId, draft.id)
        writeJson(res, 201, { draft })
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------- 草稿编辑
    route(XHS_API.drafts, async (req, res) => {
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if ((req.method ?? 'GET') !== 'PATCH') { writeJson(res, 405, { error: `method not allowed: ${req.method}` }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'draft')
      if (id === undefined) { writeJson(res, 400, { error: 'draft 查询参数必填' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const payload: { copy?: string; coverPrompt?: string; tags?: string } = {}
      if (body.copy !== undefined) { if (typeof body.copy !== 'string') { writeJson(res, 400, { error: 'copy 必须是字符串' }); return }; payload.copy = body.copy }
      if (body.coverPrompt !== undefined) { if (typeof body.coverPrompt !== 'string') { writeJson(res, 400, { error: 'coverPrompt 必须是字符串' }); return }; payload.coverPrompt = body.coverPrompt }
      if (body.tags !== undefined) { if (typeof body.tags !== 'string') { writeJson(res, 400, { error: 'tags 必须是字符串' }); return }; payload.tags = body.tags }
      try {
        const draft = store.updateDraft(id, payload)
        writeJson(res, 200, { draft })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------- 草稿状态回填
    route(XHS_API.drafts + '/status', async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const draftId = typeof body.draftId === 'string' ? body.draftId : ''
      const status = body.status as DraftStatus | undefined
      const metrics = body.metrics as DraftMetrics | undefined
      if (draftId === '' || (status !== 'generated' && status !== 'published' && status !== 'dropped')) {
        writeJson(res, 400, { error: 'draftId 与合法 status 必填' })
        return
      }
      if (body.metrics !== undefined) {
        const m = body.metrics as Record<string, unknown> | null
        if (typeof m !== 'object' || m === null
          || typeof m.reads !== 'number' || typeof m.likes !== 'number'
          || typeof m.comments !== 'number' || typeof m.collected !== 'string') {
          writeJson(res, 400, { error: 'metrics 需含数值 reads/likes/comments 与字符串 collected' })
          return
        }
      }
      try {
        const draft = store.setDraftStatus(draftId, status, metrics)
        writeJson(res, 200, { draft })
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 趋势
    route(XHS_API.trends, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const accountId = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'account')
      if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
      if (method === 'GET') {
        writeJson(res, 200, { trends: store.listTrendSamples(accountId) })
        return
      }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (trendProvider === undefined) { writeJson(res, 400, { error: '未配置趋势数据源' }); return }
      const account = store.listAccounts().find(item => item.id === accountId)
      if (account === undefined) { writeJson(res, 400, { error: `账号不存在：${accountId}` }); return }
      const persona = store.listPersonas().find(item => item.id === account.personaId)
      if (persona === undefined) { writeJson(res, 400, { error: '该账号尚未分配人设' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const query = typeof body.query === 'string' && body.query.trim() !== '' ? body.query.trim() : (persona.topicCriteria ?? persona.expertise ?? persona.contentDirections ?? persona.name)
      const maxItems = typeof body.maxItems === 'number' && body.maxItems > 0 ? body.maxItems : 10
      try {
        const result = await trendProvider.search({ accountId, query, maxItems })
        if (result.status === 'failed') { writeJson(res, 502, { error: result.error ?? '趋势采集失败' }); return }
        const notes = store.listPublishedNotes(accountId)
        const ranked = rankTrends(account, persona, notes, result.samples)
        for (const item of ranked) {
          store.saveTrendSample({ accountId, title: item.title, summary: item.summary, sourceUrl: item.sourceUrl, source: item.source, actorId: item.actorId, publishedAt: item.publishedAt, reads: item.reads, likes: item.likes, favorites: item.favorites, comments: item.comments, keywords: item.keywords, contentType: item.contentType, status: 'success' })
        }
        writeJson(res, 201, { trends: ranked })
      } catch (error) {
        fail(res, error)
      }
    }),
    // ------------------------------------------------------------ 指标
    route(XHS_API.metrics, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const accountId = queryParam(url, 'account')
      const noteId = queryParam(url, 'note')
      if (method === 'GET') {
        if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
        writeJson(res, 200, { metrics: store.listMetricSnapshots(accountId, noteId) })
        return
      }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      try {
        const snapshot = validateMetricSnapshot({
          accountId: body.accountId, noteId: body.noteId,
          reads: body.reads, likes: body.likes, favorites: body.favorites, comments: body.comments,
          shares: body.shares, source: body.source, collectedAt: body.collectedAt,
        } as MetricSnapshotInput)
        const saved = store.saveMetricSnapshot(snapshot)
        writeJson(res, 201, { metric: saved })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------------------ 指标采集
    route(XHS_API.metrics + '/collect', async (req, res) => {
      if (!guard(req, res, 'POST')) return
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const accountId = typeof body.accountId === 'string' && body.accountId !== '' ? body.accountId : ''
      if (accountId === '') { writeJson(res, 400, { error: 'accountId 必填' }); return }
      if (scheduler === undefined) { writeJson(res, 400, { error: '未配置采集调度器' }); return }
      try {
        await scheduler.runAccount(accountId)
        const account = store.listAccounts().find(item => item.id === accountId)
        writeJson(res, 200, { status: account?.collectionStatus })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------------------ 创作台
    route(XHS_API.studioMessages, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      const accountId = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'account')
      if (accountId === undefined) { writeJson(res, 400, { error: 'account 查询参数必填' }); return }
      if (method === 'GET') {
        writeJson(res, 200, { messages: store.listStudioMessages(accountId) })
        return
      }
      if (method !== 'POST') { writeJson(res, 405, { error: `method not allowed: ${method}` }); return }
      if (studio === undefined) { writeJson(res, 400, { error: '创作台未就绪' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const input = typeof body.input === 'string' && body.input.trim() !== '' ? body.input.trim() : ''
      const mode = body.mode === 'full' ? 'full' : 'creative'
      if (input === '') { writeJson(res, 400, { error: 'input 必填' }); return }
      try {
        const result = await studio.send(accountId, input, mode)
        writeJson(res, 201, { message: result.message, evidence: result.evidence, warning: result.warning })
      } catch (error) { fail(res, error) }
    }),
    // ------------------------------------------------------------ 草稿保存（创作台）
    route(XHS_API.studio + '/draft', async (req, res) => {
      if (!guard(req, res, 'POST')) return
      if (studio === undefined) { writeJson(res, 400, { error: '创作台未就绪' }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const accountId = typeof body.accountId === 'string' ? body.accountId : ''
      const topicId = typeof body.topicId === 'string' ? body.topicId : ''
      const copy = typeof body.copy === 'string' && body.copy.trim() !== '' ? body.copy : ''
      const coverPrompt = typeof body.coverPrompt === 'string' ? body.coverPrompt : ''
      if (accountId === '' || topicId === '' || copy === '') { writeJson(res, 400, { error: 'accountId、topicId、copy 必填' }); return }
      try {
        const draft = studio.saveDraft(accountId, { topicId, copy, coverPrompt, evidence: body.evidence as never })
        writeJson(res, 201, { draft })
      } catch (error) { fail(res, error) }
    }),
  ]
}
