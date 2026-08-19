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
})
