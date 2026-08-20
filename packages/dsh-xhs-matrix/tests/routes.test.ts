import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeRoutes } from '../src/routes.ts'
import { MatrixStore } from '../src/store.ts'

let server: Server
let base: string
let store: MatrixStore

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-routes-'))
  store = new MatrixStore(join(dir, 'xhs.json'))
  const routes = makeRoutes({ store })
  server = createServer((req, res) => {
    const route = routes.find(r => r.kind === 'exact' && r.path === (new URL(req.url ?? '/', 'http://localhost').pathname))
    if (route === undefined) { res.writeHead(404); res.end('not found'); return }
    route.handler(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port
})

afterEach(() => { server.close() })

async function json(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(base + path, init)
  const body = await response.json().catch(() => undefined)
  return { status: response.status, body }
}

describe('/api/dsh-xhs-matrix 路由', () => {
  it('账号 CRUD', async () => {
    const created = await json('/api/dsh-xhs-matrix/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '账号A', personaId: 'p1', enabled: true }),
    })
    expect(created.status).toBe(201)
    const id = (created.body as { account: { id: string } }).account.id
    const listed = await json('/api/dsh-xhs-matrix/accounts')
    expect((listed.body as { accounts: unknown[] }).accounts).toHaveLength(1)
    const updated = await json('/api/dsh-xhs-matrix/accounts?account=' + id, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '账号B', personaId: 'p1', enabled: false }),
    })
    expect(updated.status).toBe(200)
    const deleted = await json('/api/dsh-xhs-matrix/accounts?account=' + id, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
  })

  it('校验失败返回 400 + 中文诊断', async () => {
    const res = await json('/api/dsh-xhs-matrix/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '', personaId: 'p1', enabled: true }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('账号名')
  })

  it('批量导入选题', async () => {
    const res = await json('/api/dsh-xhs-matrix/topics', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles: ['通勤穿搭', '秋季护肤'] }),
    })
    expect(res.status).toBe(201)
    expect((res.body as { topics: unknown[] }).topics).toHaveLength(2)
  })

  it('草稿状态回填后存储可见', async () => {
    const { topics: [topic] } = (await json('/api/dsh-xhs-matrix/topics', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles: ['通勤穿搭'] }),
    })).body as unknown as { topics: { id: string }[] }
    const draftRes = await json('/api/dsh-xhs-matrix/drafts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' }),
    })
    const draftId = (draftRes.body as { draft: { id: string } }).draft.id
    const statusRes = await json('/api/dsh-xhs-matrix/drafts/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId, status: 'published', metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' } }),
    })
    expect(statusRes.status).toBe(200)
    expect(store.listDrafts()[0].metrics?.reads).toBe(50)
  })

  it('草稿缺失必填字段返回 400 且不落库', async () => {
    const res = await json('/api/dsh-xhs-matrix/drafts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'acc-a', topicId: 't1', date: '2026-08-18' }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('必填')
    expect(store.listDrafts()).toHaveLength(0)
  })

  it('草稿引用不存在的选题返回 400 且不落库', async () => {
    const res = await json('/api/dsh-xhs-matrix/drafts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'acc-a', topicId: 'no-such-topic', date: '2026-08-18', copy: 'c', coverPrompt: 'p' }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('选题不存在')
    expect(store.listDrafts()).toHaveLength(0)
  })

  it('草稿状态回填的 metrics 形状非法返回 400', async () => {
    const res = await json('/api/dsh-xhs-matrix/drafts/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId: 'any', status: 'published', metrics: { reads: '50', likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' } }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('metrics')
  })

  it('Apify 配置 GET/PATCH：默认空，PATCH 后持久化', async () => {
    const initial = await json('/api/dsh-xhs-matrix/settings/apify')
    expect(initial.status).toBe(200)
    expect((initial.body as { settings: { actorId: string } }).settings.actorId).toBe('')

    const saved = await json('/api/dsh-xhs-matrix/settings/apify', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actorId: 'apify/trend', apiToken: 'tok-123', maxItems: 8 }),
    })
    expect(saved.status).toBe(200)
    const apify = (saved.body as { settings: { actorId: string; apiToken: string; maxItems: number } }).settings
    expect(apify.actorId).toBe('apify/trend')
    expect(apify.apiToken).toBe('tok-123')
    expect(apify.maxItems).toBe(8)
    // 落盘后 store 可见
    expect(store.getSettings().apify.actorId).toBe('apify/trend')
    expect(store.getSettings().apify.apiToken).toBe('tok-123')
  })

  it('Apify 配置非法 maxItems 返回 400', async () => {
    const res = await json('/api/dsh-xhs-matrix/settings/apify', {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actorId: 'apify/trend', maxItems: -1 }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('maxItems')
  })
})
