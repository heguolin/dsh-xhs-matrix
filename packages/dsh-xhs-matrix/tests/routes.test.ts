import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ViralProvider } from '../src/collector/provider.ts'
import { makeRoutes } from '../src/routes/index.ts'
import { MatrixStore } from '../src/store.ts'
import { StudioService, type StudioLlmClient } from '../src/studio.ts'

let server: Server
let base: string
let store: MatrixStore
let viralProvider: ViralProvider

/** 记录 mock 数据源的 search 调用参数（路由透传验证）。 */
const searchCalls: Array<{ accountId: string; query: string; maxItems: number }> = []

/** 用给定依赖启动路由测试 server；返回 server 与基础 URL。 */
async function startServer(targetStore: MatrixStore, provider?: ViralProvider, studio?: StudioService): Promise<{ server: Server; base: string }> {
  const routes = makeRoutes({ store: targetStore, viralProvider: provider, studio })
  const srv = createServer((req, res) => {
    const route = routes.find(r => r.kind === 'exact' && r.path === (new URL(req.url ?? '/', 'http://localhost').pathname))
    if (route === undefined) { res.writeHead(404); res.end('not found'); return }
    route.handler(req, res)
  })
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', resolve))
  return { server: srv, base: 'http://127.0.0.1:' + (srv.address() as AddressInfo).port }
}

beforeEach(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-routes-'))
  store = new MatrixStore(join(dir, 'xhs.json'))
  searchCalls.length = 0
  viralProvider = {
    search: async (request) => {
      searchCalls.push({ accountId: request.accountId, query: request.query, maxItems: request.maxItems })
      return { status: 'success', items: [{ title: '大模型应用实战', body: '正文', sourceUrl: 'https://x.com/1', source: 'apify' }] }
    },
  }
  const started = await startServer(store, viralProvider)
  server = started.server
  base = started.base
})

afterEach(() => { server.close() })

async function json(path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const url = path.startsWith('http') ? path : base + path
  const response = await fetch(url, init)
  const body = await response.json().catch(() => undefined)
  return { status: response.status, body }
}

/** 建一个已分配人设的账号；返回账号 id。 */
async function seedAccount(): Promise<string> {
  const personaRes = await json('/api/dsh-xhs-matrix/personas', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'AI 博主', prompt: '科技内容创作' }),
  })
  const personaId = (personaRes.body as { persona: { id: string } }).persona.id
  const accRes = await json('/api/dsh-xhs-matrix/accounts', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '账号A', personaId, enabled: true }),
  })
  return (accRes.body as { account: { id: string } }).account.id
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

  it('草稿状态回填后存储可见', async () => {
    const draftRes = await json('/api/dsh-xhs-matrix/drafts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'acc-a', date: '2026-08-18', copy: 'c', coverPrompt: 'p' }),
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
      body: JSON.stringify({ accountId: 'acc-a', date: '2026-08-18' }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('必填')
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

  it('创作台保存草稿不要求 topicId', async () => {
    const accountId = await seedAccount()
    const llm: StudioLlmClient = { complete: async () => ({ text: '回复' }) }
    const studio = new StudioService(store, llm)
    const { server: studioServer, base: studioBase } = await startServer(store, viralProvider, studio)
    try {
      const res = await json(studioBase + '/api/dsh-xhs-matrix/studio/draft', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, copy: 'c', coverPrompt: 'p' }),
      })
      expect(res.status).toBe(201)
      const draft = (res.body as { draft: { id: string; accountId: string } }).draft
      expect(draft.accountId).toBe(accountId)
      // v3 草稿独立：落库的草稿不携带 topicId 字段。
      expect(store.listDrafts()[0].id).toBe(draft.id)
      expect('topicId' in store.listDrafts()[0]).toBe(false)
      // 未装配创作台时保存请求返回 400。
      const unready = await json('/api/dsh-xhs-matrix/studio/draft', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, copy: 'c', coverPrompt: 'p' }),
      })
      expect(unready.status).toBe(400)
      expect((unready.body as { error: string }).error).toContain('创作台')
    } finally {
      studioServer.close()
    }
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

  it('爆款采集入库 pending 并可审核', async () => {
    const accountId = await seedAccount()
    const created = await json('/api/dsh-xhs-matrix/viral', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, query: 'AI 工具', maxItems: 5 }),
    })
    expect(created.status).toBe(201)
    const items = (created.body as { items: Array<{ id: string; status: string; title: string }> }).items
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('大模型应用实战')
    expect(items[0].status).toBe('pending')
    // 查询与数量上限透传给数据源
    expect(searchCalls).toEqual([{ accountId, query: 'AI 工具', maxItems: 5 }])

    const item = items[0]
    const reviewed = await json(`/api/dsh-xhs-matrix/viral?account=${accountId}&item=${item.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    })
    expect(reviewed.status).toBe(200)
    const list = await json(`/api/dsh-xhs-matrix/viral?account=${accountId}`)
    expect((list.body as { items: Array<{ status: string }> }).items[0].status).toBe('accepted')
    // 入库条目可被 store 直接读到
    expect(store.listViralItems(accountId, 'accepted')).toHaveLength(1)
  })

  it('未配置趋势数据源返回 400', async () => {
    const { server: noProviderServer, base: noProviderBase } = await startServer(store)
    try {
      const res = await json(noProviderBase + '/api/dsh-xhs-matrix/viral', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'a1', query: 'AI 工具' }),
      })
      expect(res.status).toBe(400)
      expect((res.body as { error: string }).error).toContain('趋势数据源')
    } finally {
      noProviderServer.close()
    }
  })

  it('采集目标账号不存在返回 400', async () => {
    const res = await json('/api/dsh-xhs-matrix/viral', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: 'no-such-account', query: 'AI 工具' }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('账号不存在')
  })

  it('采集目标账号未分配人设返回 400', async () => {
    const accRes = await json('/api/dsh-xhs-matrix/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '账号B', personaId: 'no-such-persona', enabled: true }),
    })
    const accountId = (accRes.body as { account: { id: string } }).account.id
    const res = await json('/api/dsh-xhs-matrix/viral', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, query: 'AI 工具' }),
    })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('人设')
  })

  it('采集失败返回 502', async () => {
    const accountId = await seedAccount()
    const failingProvider: ViralProvider = {
      search: async () => ({ status: 'failed', items: [], error: 'Apify 超时' }),
    }
    const { server: failServer, base: failBase } = await startServer(store, failingProvider)
    try {
      const res = await json(failBase + '/api/dsh-xhs-matrix/viral', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, query: 'AI 工具' }),
      })
      expect(res.status).toBe(502)
      expect((res.body as { error: string }).error).toContain('Apify 超时')
    } finally {
      failServer.close()
    }
  })

  it('未传 query 时按人设方向降级生成搜索词', async () => {
    const personaRes = await json('/api/dsh-xhs-matrix/personas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'AI 博主', prompt: '科技内容创作', topicCriteria: '大模型应用' }),
    })
    const personaId = (personaRes.body as { persona: { id: string } }).persona.id
    const accRes = await json('/api/dsh-xhs-matrix/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '账号A', personaId, enabled: true }),
    })
    const accountId = (accRes.body as { account: { id: string } }).account.id
    const res = await json('/api/dsh-xhs-matrix/viral', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId }),
    })
    expect(res.status).toBe(201)
    expect(searchCalls[0].query).toBe('大模型应用')
    expect(searchCalls[0].maxItems).toBe(10)
  })
})
