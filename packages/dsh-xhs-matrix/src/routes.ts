/** /api/dsh-xhs-matrix 路由族：账号/人设/选题/黑名单/草稿 CRUD。 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback.ts'
import { XHS_API } from './protocol.ts'
import { MatrixStore, type AccountPayload, type DraftPayload, type NegativePayload, type PersonaPayload } from './store.ts'
import type { DraftMetrics, DraftStatus } from './types.ts'

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
}

/**
 * 构建全部 /api/dsh-xhs-matrix 路由。
 * @param deps - 存储。
 * @returns 路由数组。
 */
export function makeRoutes(deps: RoutesDeps): WebRoute[] {
  const { store } = deps

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
          const account = store.upsertAccount(body as unknown as AccountPayload, id)
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
    // ------------------------------------------------------------ 黑名单
    route(XHS_API.negatives, async (req, res) => {
      const method = req.method ?? 'GET'
      if (!isLoopbackRequest(req)) { writeJson(res, 403, { error: 'forbidden: loopback-only' }); return }
      if (method === 'GET') { writeJson(res, 200, { negatives: store.listNegatives() }); return }
      const body = await readJsonBody(req)
      if (body === undefined) { writeJson(res, 400, { error: 'invalid JSON body' }); return }
      const id = queryParam(new URL(req.url ?? '/', 'http://localhost'), 'negative')
      try {
        if (method === 'POST') {
          writeJson(res, 201, { negative: store.addNegative(body as unknown as NegativePayload) })
        } else if (method === 'DELETE') {
          if (id === undefined) { writeJson(res, 400, { error: 'negative 查询参数必填' }); return }
          store.deleteNegative(id)
          writeJson(res, 200, { ok: true })
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
      try {
        const draft = store.saveDraft(body as unknown as DraftPayload)
        store.markTopicUsed(draft.topicId, draft.id)
        writeJson(res, 201, { draft })
      } catch (error) {
        fail(res, error)
      }
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
      try {
        const draft = store.setDraftStatus(draftId, status, metrics)
        writeJson(res, 200, { draft })
      } catch (error) {
        fail(res, error)
      }
    }),
  ]
}
