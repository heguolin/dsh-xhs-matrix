import { afterEach, describe, expect, it, vi } from 'vitest'
import { XhsApi, XhsApiError } from '../src/client/api.ts'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => { fetchMock.mockReset() })

describe('XhsApi', () => {
  it('listAccounts 调用正确路径', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accounts: [{ id: 'a1', name: '账号A' }] }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const api = new XhsApi()
    const accounts = await api.listAccounts()
    expect(accounts[0].name).toBe('账号A')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/dsh-xhs-matrix/accounts')
  })

  it('createAccount 发送 JSON body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ account: { id: 'a1' } }), { status: 201 }))
    const api = new XhsApi()
    await api.createAccount({ name: '账号A', personaId: 'p1', enabled: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string).name).toBe('账号A')
  })

  it('业务错误抛出 XhsApiError 并带中文消息', async () => {
    // Response 体只能消费一次，而该用例对同一 mock 调用两次 createAccount，
    // 因此每次调用都必须返回新的 Response 实例（断言与语义保持不变）。
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: '账号名必填' }), { status: 400 })))
    const api = new XhsApi()
    await expect(api.createAccount({ name: '', personaId: 'p1', enabled: true })).rejects.toThrow(XhsApiError)
    await expect(api.createAccount({ name: '', personaId: 'p1', enabled: true })).rejects.toThrow('账号名必填')
  })

  it('setDraftStatus 透传 metrics', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ draft: { id: 'd1' } }), { status: 200 }))
    const api = new XhsApi()
    await api.setDraftStatus('d1', 'published', { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.status).toBe('published')
    expect(body.metrics.reads).toBe(50)
  })

  it('listViralItems 携带 account 与 status 查询参数并拍平批次', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ batches: [{ id: 'b1', accountId: 'a1', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: 1, items: [{ id: 'v1', accountId: 'a1', title: '爆款A', body: '正文', source: 'apify', status: 'accepted', score: 8, reasons: ['相关性高'], collectedAt: '2026-08-20T10:00:00.000Z' }] }] }), { status: 200 }))
    const api = new XhsApi()
    const items = await api.listViralItems('a1', 'accepted')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('爆款A')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral')
    expect(url).toContain('account=a1')
    expect(url).toContain('status=accepted')
    // GET 请求不携带 init，默认即 GET 方法。
    expect(init).toBeUndefined()
  })

  it('listViralBatches 返回按批次分组条目，deleteViralBatch 发送 DELETE', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ batches: [{ id: 'b1', accountId: 'a1', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: 1, items: [] }] }), { status: 200 }))
    const api = new XhsApi()
    const batches = await api.listViralBatches('a1')
    expect(batches).toHaveLength(1)
    expect(batches[0].id).toBe('b1')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ deleted: 3 }), { status: 200 }))
    const deleted = await api.deleteViralBatch('a1', 'b1')
    expect(deleted).toBe(3)
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toContain('batch=b1')
    expect(init?.method).toBe('DELETE')
  })

  it('collectViral 发送 accountId/query/maxItems 到 POST /viral', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 201 }))
    const api = new XhsApi()
    await api.collectViral('a1', '美妆测评', 5)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral')
    expect(init.method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.accountId).toBe('a1')
    expect(body.query).toBe('美妆测评')
    expect(body.maxItems).toBe(5)
  })

  it('reviewViralItem 发送 PATCH /viral 并携带 status body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ item: { id: 'v1', accountId: 'a1', title: '爆款A', body: '正文', source: 'apify', status: 'accepted', score: 8, reasons: ['相关性高'], collectedAt: '2026-08-20T10:00:00.000Z' } }), { status: 200 }))
    const api = new XhsApi()
    const item = await api.reviewViralItem('a1', 'v1', 'accepted')
    expect(item.status).toBe('accepted')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral')
    expect(url).toContain('account=a1')
    expect(url).toContain('item=v1')
    expect(init.method).toBe('PATCH')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.status).toBe('accepted')
  })
})
