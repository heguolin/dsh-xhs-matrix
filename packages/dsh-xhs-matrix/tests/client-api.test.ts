import { afterEach, describe, expect, it, vi } from 'vitest'
import { XhsApi, XhsApiError } from '../src/client/api.ts'
import type { StudioSseEvent } from '../src/studio.ts'
import type { PublishedNote, ViralItem, PendingOwnership } from '../src/types.ts'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => { fetchMock.mockReset() })

/** JSON 响应助手。 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** SSE 模拟：按给定 chunk 依次写入，模拟网络分块（每个 chunk 对应一次 read）。 */
function mockSseChunks(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

/** 一条 SSE 完整事件（超出一行 data 时以单个事件字符串传入）。 */
function sseEvents(events: StudioSseEvent[]): string[] {
  return events.map(event => 'data: ' + JSON.stringify(event) + '\n\n')
}

function initBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse((init?.body as string) ?? '{}') as Record<string, unknown>
}

const noteFixture: PublishedNote = {
  id: 'n1', personaId: 'p1', sourceAccountId: 'a1', sourceAccountName: '账号A',
  title: '笔记A', copy: '正文', source: 'manual', weight: 5, publishedAt: '2026-08-20T10:00:00.000Z', createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
}

const viralFixture: ViralItem = {
  id: 'v1', personaId: 'p1', sourceAccountId: 'a1', sourceAccountName: '账号A',
  title: '爆款A', body: '正文', source: 'apify', status: 'accepted', weight: 5, score: 8, reasons: ['相关性高'], collectedAt: '2026-08-20T10:00:00.000Z', batchId: 'b1',
}

describe('XhsApi', () => {
  it('listAccounts 调用正确路径', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accounts: [{ id: 'a1', name: '账号A' }] }))
    const api = new XhsApi()
    const accounts = await api.listAccounts()
    expect(accounts[0].name).toBe('账号A')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/dsh-xhs-matrix/accounts')
  })

  it('createAccount 发送 JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ account: { id: 'a1' } }, 201))
    const api = new XhsApi()
    await api.createAccount({ name: '账号A', personaId: 'p1', enabled: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(initBody(init).name).toBe('账号A')
  })

  it('业务错误抛出 XhsApiError 并带中文消息', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ error: '账号名必填' }, 400)))
    const api = new XhsApi()
    await expect(api.createAccount({ name: '', personaId: 'p1', enabled: true })).rejects.toThrow(XhsApiError)
    await expect(api.createAccount({ name: '', personaId: 'p1', enabled: true })).rejects.toThrow('账号名必填')
  })

  it('setDraftStatus 透传 metrics', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ draft: { id: 'd1' } }))
    const api = new XhsApi()
    await api.setDraftStatus('d1', 'published', { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' })
    const body = initBody(fetchMock.mock.calls[0][1])
    expect(body.status).toBe('published')
    expect((body.metrics as { reads: number }).reads).toBe(50)
  })

  it('listNotes 携带 persona 查询参数并返回人设笔记', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ notes: [noteFixture], resolvedPersonaId: 'p1' }))
    const api = new XhsApi()
    const notes = await api.listNotes('p1')
    expect(notes).toHaveLength(1)
    expect(notes[0].personaId).toBe('p1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/notes')
    expect(url).toContain('persona=p1')
    expect(init).toBeUndefined()
  })

  it('listNotes 兼容账号使用显式对象 { accountId }（不做字符串猜测）', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ notes: [noteFixture], resolvedPersonaId: 'p1' }))
    const api = new XhsApi()
    const notes = await api.listNotes({ accountId: 'a1' })
    expect(notes).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('account=a1')
    expect(url).not.toContain('persona=')
    expect(init).toBeUndefined()
  })

  it('setNoteWeight 发送 PATCH /notes 并携带 persona/note 与权重 body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ note: noteFixture }))
    const api = new XhsApi()
    await api.setNoteWeight('p1', 'n1', 4)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/notes')
    expect(url).toContain('persona=p1')
    expect(url).toContain('note=n1')
    expect(init!.method).toBe('PATCH')
    expect(initBody(init).weight).toBe(4)
  })

  it('listViralItems 携带 persona 与 status 查询参数并拍平批次', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ batches: [{ id: 'b1', personaId: 'p1', sourceAccountId: 'a1', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: 1, items: [viralFixture] }] }))
    const api = new XhsApi()
    const items = await api.listViralItems('p1', 'accepted')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('爆款A')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral')
    expect(url).toContain('persona=p1')
    expect(url).toContain('status=accepted')
    expect(init).toBeUndefined()
  })

  it('listViralBatches 兼容账号使用显式对象 { accountId } 并对 deleteViralBatch 发送 DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ batches: [{ id: 'b1', personaId: 'p1', sourceAccountId: 'a1', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: 1, items: [] }] }))
    const api = new XhsApi()
    const batches = await api.listViralBatches({ accountId: 'a1' })
    expect(batches).toHaveLength(1)
    expect(batches[0].id).toBe('b1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('account=a1')
    expect(url).not.toContain('persona=')
    expect(init).toBeUndefined()
    fetchMock.mockResolvedValue(jsonResponse({ deleted: 3 }))
    const deleted = await api.deleteViralBatch('p1', 'b1')
    expect(deleted).toBe(3)
    const [url2, init2] = fetchMock.mock.calls[1]
    expect(url2).toContain('persona=p1')
    expect(url2).toContain('batch=b1')
    expect(init2!.method).toBe('DELETE')
  })

  it('collectViral 发送 accountId/query/maxItems 到 POST /viral', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], batch: { id: 'b1', accountId: 'a1', collectedAt: '2026-08-20T10:00:00.000Z', itemCount: 0 } }, 201))
    const api = new XhsApi()
    await api.collectViral('a1', '美妆测评', 5)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral')
    expect(init.method).toBe('POST')
    const body = initBody(init)
    expect(body.accountId).toBe('a1')
    expect(body.query).toBe('美妆测评')
    expect(body.maxItems).toBe(5)
  })

  it('reviewViralItem 发送 PATCH /viral 并携带 persona/item 与 status body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ item: viralFixture }))
    const api = new XhsApi()
    const item = await api.reviewViralItem('p1', 'v1', 'accepted')
    expect(item.status).toBe('accepted')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral')
    expect(url).toContain('persona=p1')
    expect(url).toContain('item=v1')
    expect(init.method).toBe('PATCH')
    expect(initBody(init).status).toBe('accepted')
  })

  it('addManualViral 发送 POST /viral/manual 并携带 personaId 与标题正文', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ item: { ...viralFixture, source: 'manual', title: '手动爆款' } }, 201))
    const api = new XhsApi()
    const item = await api.addManualViral('p1', { title: '手动爆款', body: '正文', reasons: ['人工确认'] })
    expect(item.title).toBe('手动爆款')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral/manual')
    expect(init.method).toBe('POST')
    const body = initBody(init)
    expect(body.personaId).toBe('p1')
    expect(body.title).toBe('手动爆款')
    expect(body.body).toBe('正文')
    expect(body.reasons).toEqual(['人工确认'])
  })

  it('setViralWeight 发送 PATCH /viral 并携带 persona/item 与 weight body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ item: { ...viralFixture, weight: 4 } }))
    const api = new XhsApi()
    const item = await api.setViralWeight('p1', 'v1', 4)
    expect(item.weight).toBe(4)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral')
    expect(url).toContain('persona=p1')
    expect(url).toContain('item=v1')
    expect(init!.method).toBe('PATCH')
    expect(initBody(init).weight).toBe(4)
  })

  it('transferNotes 发送 POST /notes/transfer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ notes: [noteFixture] }))
    const api = new XhsApi()
    const notes = await api.transferNotes('p1', 'p2', ['n1'])
    expect(notes).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/notes/transfer')
    expect(init.method).toBe('POST')
    const body = initBody(init)
    expect(body.personaId).toBe('p1')
    expect(body.targetPersonaId).toBe('p2')
    expect(body.noteIds).toEqual(['n1'])
  })

  it('transferVirals 发送 POST /viral/transfer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [viralFixture] }))
    const api = new XhsApi()
    const items = await api.transferVirals('p1', 'p2', ['v1'])
    expect(items).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/viral/transfer')
    expect(init.method).toBe('POST')
    const body = initBody(init)
    expect(body.personaId).toBe('p1')
    expect(body.targetPersonaId).toBe('p2')
    expect(body.itemIds).toEqual(['v1'])
  })

  it('listPending 读取待归属数据，assignPending 显式归属', async () => {
    const pendingEntry: PendingOwnership = { id: 'pd1', kind: 'published-note', payload: { id: 'n1', sourceAccountId: 'a1', title: '旧笔记', copy: '正文', source: 'manual', weight: 3, publishedAt: '2026-08-20T10:00:00.000Z', createdAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z' }, sourceAccountId: 'a1', sourceAccountName: '账号A', reason: '账号未绑定人设', migratedAt: '2026-08-20T10:00:00.000Z' }
    fetchMock.mockResolvedValue(jsonResponse({ pending: [pendingEntry] }))
    const api = new XhsApi()
    const pending = await api.listPending()
    expect(pending).toHaveLength(1)
    expect(pending[0].kind).toBe('published-note')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/dsh-xhs-matrix/pending-ownership')
    fetchMock.mockResolvedValue(jsonResponse({ asset: noteFixture }))
    const asset = await api.assignPending('pd1', 'p2')
    expect((asset as PublishedNote).personaId).toBe('p1')
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toContain('/api/dsh-xhs-matrix/pending-ownership')
    expect(init.method).toBe('POST')
    const body = initBody(init)
    expect(body.id).toBe('pd1')
    expect(body.targetPersonaId).toBe('p2')
  })

  // ------------------------------------------------------------ 结构化 SSE

  it('SSE JSON 被网络分块拆开时仍按事件回调', async () => {
    fetchMock.mockResolvedValue(mockSseChunks([
      'data: {"type":"content_',
      'delta","delta":"最终稿"}\n\n',
      'data: {"type":"done","messageId":"m1"}\n\n',
    ]))
    const api = new XhsApi()
    const events: StudioSseEvent[] = []
    await api.studioSendStream('a1', '写', 'creative', e => events.push(e), 'req-1')
    expect(events.map(x => x.type)).toEqual(['content_delta', 'done'])
  })

  it('SSE 按顺序回调完整事件序列（阶段/依据/计划/内容/质检/完成）', async () => {
    const streamEvents: StudioSseEvent[] = [
      { type: 'phase', phase: 'planning' },
      { type: 'evidence', evidence: { persona: '人设A', noteIds: [], trendIds: [], reasons: ['高权重参考'] } },
      { type: 'phase', phase: 'drafting' },
      { type: 'plan_delta', delta: '创作计划……' },
      { type: 'phase', phase: 'polishing' },
      { type: 'content_delta', delta: '最终稿' },
      { type: 'quality', report: { reviewStatus: 'passed', forbiddenWordHits: [], checkedAt: '2026-08-20T10:00:00.000Z', personaSnapshot: '人设A' }, allowed: true },
      { type: 'done', messageId: 'm1', coverPrompt: '封面', quality: { reviewStatus: 'passed', forbiddenWordHits: [], checkedAt: '2026-08-20T10:00:00.000Z', personaSnapshot: '人设A' }, evidence: { persona: '人设A', noteIds: [], trendIds: [], reasons: ['高权重参考'] }, personaId: 'p1' },
    ]
    fetchMock.mockResolvedValue(mockSseChunks(sseEvents(streamEvents)))
    const api = new XhsApi()
    const events: StudioSseEvent[] = []
    const summary = await api.studioSendStream('a1', '写', 'full', e => events.push(e), 'req-2')
    expect(events.map(x => x.type)).toEqual(['phase', 'evidence', 'phase', 'plan_delta', 'phase', 'content_delta', 'quality', 'done'])
    expect(summary.messageId).toBe('m1')
    expect(summary.coverPrompt).toBe('封面')
    expect(summary.personaId).toBe('p1')
  })

  it('SSE done 负载透传 messageId/coverPrompt/personaId', async () => {
    fetchMock.mockResolvedValue(mockSseChunks([
      'data: {"type":"done","messageId":"m9","coverPrompt":"封面","quality":{"reviewStatus":"passed","forbiddenWordHits":[],"checkedAt":"2026-08-20T10:00:00.000Z","personaSnapshot":"人设A"},"evidence":{"persona":"人设A","noteIds":[],"trendIds":[],"reasons":[]},"personaId":"p1"}\n\n',
    ]))
    const api = new XhsApi()
    const summary = await api.studioSendStream('a1', '写', 'creative', () => {})
    expect(summary.messageId).toBe('m9')
    expect(summary.coverPrompt).toBe('封面')
    expect(summary.personaId).toBe('p1')
    expect(summary.quality?.reviewStatus).toBe('passed')
  })

  it('SSE 错误事件抛出 XhsApiError 并携带消息', async () => {
    // 每次调用都返回新的 Response 实例（流 body 只能读一次）。
    fetchMock.mockImplementation(() => Promise.resolve(mockSseChunks(['data: {"type":"error","stage":"stream","retryable":true,"message":"模型调用失败"}\n\n'])))
    const api = new XhsApi()
    const events: StudioSseEvent[] = []
    await expect(api.studioSendStream('a1', '写', 'creative', e => events.push(e))).rejects.toThrow(XhsApiError)
    await expect(api.studioSendStream('a1', '写', 'creative', () => {})).rejects.toThrow('模型调用失败')
    expect(events.map(x => x.type)).toEqual(['error'])
  })

  it('studioSendStream 请求透传 requestId', async () => {
    fetchMock.mockResolvedValue(mockSseChunks(['data: {"type":"done","messageId":"m1"}\n\n']))
    const api = new XhsApi()
    await api.studioSendStream('a1', '写', 'creative', () => {}, 'req-42')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/dsh-xhs-matrix/studio/messages')
    expect(init.method).toBe('POST')
    const body = initBody(init)
    expect(body.stream).toBe(true)
    expect(body.requestId).toBe('req-42')
    expect(body.input).toBe('写')
    expect(body.mode).toBe('creative')
  })
})
