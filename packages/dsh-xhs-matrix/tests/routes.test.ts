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

/** 解析账号当前人设（v4 内容按人设归属）。 */
const personaIdOf = (accountId: string): string => store.listAccounts().find(a => a.id === accountId)?.personaId ?? ''

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

/** POST JSON 请求体辅助（新契约测试用）。 */
function post(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
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
    const accountId = await seedAccount()
    const draftRes = await json('/api/dsh-xhs-matrix/drafts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, date: '2026-08-18', copy: '标题\n正文', coverPrompt: 'p' }),
    })
    const draftId = (draftRes.body as { draft: { id: string } }).draft.id
    const statusRes = await json('/api/dsh-xhs-matrix/drafts/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId, status: 'published', metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' } }),
    })
    expect(statusRes.status).toBe(200)
    expect(store.listDrafts()[0].metrics?.reads).toBe(50)
  })

  it('发布草稿自动进入知识库：标题取首行、权重默认 0、可重复回填指标', async () => {
    const accountId = await seedAccount()
    const draftRes = await json('/api/dsh-xhs-matrix/drafts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, date: '2026-08-21', copy: '这是标题\n正文第一行 #AI工具', coverPrompt: '红色背景' }),
    })
    const draftId = (draftRes.body as { draft: { id: string } }).draft.id
    const published = await json('/api/dsh-xhs-matrix/drafts/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId, status: 'published' }),
    })
    expect(published.status).toBe(200)
    const notes = store.listPublishedNotes(personaIdOf(accountId))
    expect(notes).toHaveLength(1)
    expect(notes[0].title).toBe('这是标题')
    expect(notes[0].copy).toBe('正文第一行 #AI工具')
    expect(notes[0].weight).toBe(0)
    expect(notes[0].source).toBe('manual')
    // 再次回填指标不重复入库
    const again = await json('/api/dsh-xhs-matrix/drafts/status', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId, status: 'published', metrics: { reads: 10, likes: 1, comments: 0, collected: '2026-08-22T00:00:00.000Z' } }),
    })
    expect(again.status).toBe(200)
    expect(store.listPublishedNotes(personaIdOf(accountId))).toHaveLength(1)
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

  it('导入仅标题+正文时自动补当天发布日期', async () => {
    const accountId = await seedAccount()
    const res = await json('/api/dsh-xhs-matrix/accounts/import', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, format: 'json', content: JSON.stringify([{ title: '标题一', copy: '正文一' }, { title: '标题二', copy: '正文二' }]) }),
    })
    expect(res.status).toBe(201)
    expect((res.body as { imported: number }).imported).toBe(2)
    const notes = store.listPublishedNotes(personaIdOf(accountId))
    expect(notes).toHaveLength(2)
    expect(notes[0].title).toBe('标题一')
    // 发布日期缺省为当天日期（YYYY-MM-DD），保证人工导入无需填写精确日期。
    expect(notes[0].publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('创作台保存草稿不要求 topicId', async () => {
    const accountId = await seedAccount()
    const llm: StudioLlmClient = { complete: async () => ({ text: '回复' }), stream: async (_request, onDelta) => { onDelta('回复'); return '回复' } }
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
    const batches = (list.body as { batches: Array<{ items: Array<{ status: string }> }> }).batches
    expect(batches[0].items[0].status).toBe('accepted')
    // 入库条目可被 store 直接读到
    expect(store.listViralItems(personaIdOf(accountId), 'accepted')).toHaveLength(1)
  })

  it('删除采集批次只删除该批，不影响其他批次', async () => {
    const accountId = await seedAccount()
    const first = await json('/api/dsh-xhs-matrix/viral', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, query: 'AI', maxItems: 5 }),
    })
    const firstBatch = (first.body as { batch: { id: string } }).batch.id
    await json('/api/dsh-xhs-matrix/viral', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accountId, query: '效率', maxItems: 5 }),
    })
    expect(store.listViralItems(personaIdOf(accountId))).toHaveLength(2)
    const deleted = await json(`/api/dsh-xhs-matrix/viral?account=${accountId}&batch=${firstBatch}`, { method: 'DELETE' })
    expect(deleted.status).toBe(200)
    expect((deleted.body as { deleted: number }).deleted).toBe(1)
    expect(store.listViralItems(personaIdOf(accountId))).toHaveLength(1)
  })

  it('采集时自动抓详情补全完整正文，采纳后保留', async () => {
    const accountId = await seedAccount()
    const detailProvider: ViralProvider = {
      search: async () => ({ status: 'success', items: [
        { title: '有正文标题', body: '已有正文', sourceUrl: 'https://xhs.com/note/1', source: 'apify' },
        { title: '无正文标题', sourceUrl: 'https://xhs.com/note/2', source: 'apify' },
      ] }),
      fetchNoteDetail: async () => ({ title: '无正文标题', body: '抓回的完整正文内容', sourceUrl: 'https://xhs.com/note/2', source: 'apify' }),
    }
    const { server: detailServer, base: detailBase } = await startServer(store, detailProvider)
    try {
      const created = await json(detailBase + '/api/dsh-xhs-matrix/viral', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId, query: 'AI', maxItems: 5 }),
      })
      expect(created.status).toBe(201)
      // 采集入库即带完整正文：原已有正文的保留，空正文的被详情补全
      const saved = store.listViralItems(personaIdOf(accountId))
      expect(saved).toHaveLength(2)
      const withBody = saved.find(s => s.title === '有正文标题')
      const fetched = saved.find(s => s.title === '无正文标题')
      expect(withBody?.body).toBe('已有正文')
      expect(fetched?.body).toBe('抓回的完整正文内容')
      // 采纳后保留完整正文与状态
      const reviewed = await json(`${detailBase}/api/dsh-xhs-matrix/viral?account=${accountId}&item=${fetched?.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      })
      expect(reviewed.status).toBe(200)
      expect(store.listViralItems(personaIdOf(accountId), 'accepted')[0].body).toBe('抓回的完整正文内容')
    } finally {
      detailServer.close()
    }
  })

  it('未配置爆款数据源返回 400', async () => {
    const { server: noProviderServer, base: noProviderBase } = await startServer(store)
    try {
      const res = await json(noProviderBase + '/api/dsh-xhs-matrix/viral', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: 'a1', query: 'AI 工具' }),
      })
      expect(res.status).toBe(400)
      expect((res.body as { error: string }).error).toContain('爆款数据源')
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

  it('按账号兼容查询知识库返回 resolvedPersonaId', async () => {
    const accountId = await seedAccount()
    store.savePublishedNote({ personaId: personaIdOf(accountId), title: '笔记', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 5 })
    const res = await json(`/api/dsh-xhs-matrix/notes?account=${accountId}`)
    expect(res.status).toBe(200)
    const body = res.body as { notes: unknown[]; resolvedPersonaId: string }
    expect(body.notes).toHaveLength(1)
    expect(body.resolvedPersonaId).toBe(personaIdOf(accountId))
  })

  it('account 与 persona 不一致返回 409', async () => {
    const personaA = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设甲', prompt: '科技内容' }))).body as { persona: { id: string } }
    const personaB = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设乙', prompt: '美食内容' }))).body as { persona: { id: string } }
    const accRes = await json('/api/dsh-xhs-matrix/accounts', post({ name: '账号A', personaId: personaA.persona.id, enabled: true }))
    const accountA = (accRes.body as { account: { id: string } }).account.id
    const res = await json(`/api/dsh-xhs-matrix/notes?account=${accountA}&persona=${personaB.persona.id}`)
    expect(res.status).toBe(409)
  })

  it('手动爆款按 persona 保存为 accepted+5', async () => {
    const personaRes = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设甲', prompt: '科技内容' }))).body as { persona: { id: string } }
    const personaId = personaRes.persona.id
    const res = await json('/api/dsh-xhs-matrix/viral/manual', post({ personaId, title: '手动', body: '正文' }))
    expect(res.status).toBe(201)
    expect((res.body as { item: Record<string, unknown> }).item).toMatchObject({ personaId, source: 'manual', status: 'accepted', weight: 5 })
  })

  it('人设删除：有绑定账号或内容资产返回 409 和计数', async () => {
    const personaRes = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设甲', prompt: '科技内容' }))).body as { persona: { id: string } }
    const personaId = personaRes.persona.id
    await json('/api/dsh-xhs-matrix/accounts', post({ name: '账号A', personaId, enabled: true }))
    const del = await json(`/api/dsh-xhs-matrix/personas?persona=${personaId}`, { method: 'DELETE' })
    expect(del.status).toBe(409)
    const usage = (del.body as { usage: { accountCount: number; noteCount: number; viralCount: number } }).usage
    expect(usage.accountCount).toBe(1)
    // 人设仍存在，未被删除
    const personasLeft = (await json('/api/dsh-xhs-matrix/personas')).body as { personas: unknown[] }
    expect(personasLeft.personas).toHaveLength(1)
  })

  it('人设删除：无账号与内容资产时删除成功', async () => {
    const personaRes = (await json('/api/dsh-xhs-matrix/personas', post({ name: '空闲人设', prompt: '美食内容' }))).body as { persona: { id: string } }
    const del = await json(`/api/dsh-xhs-matrix/personas?persona=${personaRes.persona.id}`, { method: 'DELETE' })
    expect(del.status).toBe(200)
    expect(((await json('/api/dsh-xhs-matrix/personas')).body as { personas: unknown[] }).personas).toHaveLength(0)
  })

  it('待归属：列表与显式归属到人设', async () => {
    const personaRes = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设甲', prompt: '科技内容' }))).body as { persona: { id: string } }
    const personaId = personaRes.persona.id
    store.stashPendingOwnership({
      kind: 'published-note',
      payload: { id: 'n1', title: '待归属笔记', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 0, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z' },
      reason: '迁移无法确定人设',
    })
    const list = await json('/api/dsh-xhs-matrix/pending-ownership')
    expect(list.status).toBe(200)
    const pending = (list.body as { pending: Array<{ id: string }> }).pending
    expect(pending).toHaveLength(1)
    const assigned = await json('/api/dsh-xhs-matrix/pending-ownership', post({ id: pending[0].id, targetPersonaId: personaId }))
    expect(assigned.status).toBe(200)
    expect(((await json('/api/dsh-xhs-matrix/pending-ownership')).body as { pending: unknown[] }).pending).toHaveLength(0)
    expect(store.listPublishedNotes(personaId)).toHaveLength(1)
  })

  it('笔记转移：移动到目标人设', async () => {
    const personaA = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设甲', prompt: '科技内容' }))).body as { persona: { id: string } }
    const personaB = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设乙', prompt: '美食内容' }))).body as { persona: { id: string } }
    store.savePublishedNote({ personaId: personaA.persona.id, title: '笔记', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 5 })
    const noteId = store.listPublishedNotes(personaA.persona.id)[0].id
    const res = await json('/api/dsh-xhs-matrix/notes/transfer', post({ personaId: personaA.persona.id, targetPersonaId: personaB.persona.id, noteIds: [noteId] }))
    expect(res.status).toBe(200)
    expect(store.listPublishedNotes(personaA.persona.id)).toHaveLength(0)
    expect(store.listPublishedNotes(personaB.persona.id)).toHaveLength(1)
  })

  it('爆款转移：移动到目标人设', async () => {
    const personaA = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设甲', prompt: '科技内容' }))).body as { persona: { id: string } }
    const personaB = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设乙', prompt: '美食内容' }))).body as { persona: { id: string } }
    store.saveViralItem({ personaId: personaA.persona.id, title: '爆款', body: '正文', source: 'apify', score: 80, reasons: ['命中人设方向'] })
    const itemId = store.listViralItems(personaA.persona.id)[0].id
    const res = await json('/api/dsh-xhs-matrix/viral/transfer', post({ personaId: personaA.persona.id, targetPersonaId: personaB.persona.id, itemIds: [itemId] }))
    expect(res.status).toBe(200)
    expect(store.listViralItems(personaA.persona.id)).toHaveLength(0)
    expect(store.listViralItems(personaB.persona.id)).toHaveLength(1)
  })

  it('删除批次：跨人设 batch id 返回 404', async () => {
    const personaRes = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设甲', prompt: '科技内容' }))).body as { persona: { id: string } }
    const personaId = personaRes.persona.id
    store.saveViralItem({ personaId, title: '爆款', body: '正文', source: 'apify', score: 80, reasons: ['命中人设方向'], batchId: 'batch-1' })
    const otherPersona = (await json('/api/dsh-xhs-matrix/personas', post({ name: '人设乙', prompt: '美食内容' }))).body as { persona: { id: string } }
    const res = await json(`/api/dsh-xhs-matrix/viral?persona=${otherPersona.persona.id}&batch=batch-1`, { method: 'DELETE' })
    expect(res.status).toBe(404)
    const ok = await json(`/api/dsh-xhs-matrix/viral?persona=${personaId}&batch=batch-1`, { method: 'DELETE' })
    expect(ok.status).toBe(200)
    expect(store.listViralItems(personaId)).toHaveLength(0)
  })
})
