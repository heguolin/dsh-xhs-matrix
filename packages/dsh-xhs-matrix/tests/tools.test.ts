import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { makeTools } from '../src/tools.ts'
import { MatrixStore } from '../src/store.ts'

function newStore(): MatrixStore {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-tools-'))
  return new MatrixStore(join(dir, 'xhs.json'))
}

const execStub = {} as any

// ToolDefinition.execute 擦除 per-tool 输出类型（返回 Promise<unknown>），测试按工具输出形状断言。

describe('xhs 工具族', () => {
  it('xhs_today：无账号时给出中文诊断', async () => {
    const store = newStore()
    const [today] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' })
    const result = await today.execute({}, execStub) as { ok: boolean; message: string; briefs: string[] }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('账号')
  })

  it('xhs_today：生成创作简报', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业、数据支撑' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    store.addTopics(['通勤穿搭'])
    const [today] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' })
    const result = await today.execute({}, execStub) as { ok: boolean; briefs: string[] }
    expect(result.ok).toBe(true)
    expect(result.briefs[0]).toContain('账号A')
    expect(result.briefs[0]).toContain('干货风')
    expect(result.briefs[0]).toContain('通勤穿搭')
  })

  it('xhs_today：今日已发则跳过该账号', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    store.saveDraft({ accountId: account.id, topicId: topic.id, date: local, copy: 'c', coverPrompt: 'p' })
    const [today] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' })
    const result = await today.execute({}, execStub) as { message: string }
    expect(result.message).toContain('已发')
  })

  it('xhs_draft_save：同账号当日同选题去重', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const [saveTool] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' }).slice(1, 2)
    const first = await saveTool.execute({ topicId: topic.id, accountId: account.id, copy: 'c1', coverPrompt: 'p1' }, execStub) as { ok: boolean; message: string }
    expect(first.ok).toBe(true)
    const second = await saveTool.execute({ topicId: topic.id, accountId: account.id, copy: 'c2', coverPrompt: 'p2' }, execStub) as { ok: boolean; message: string }
    expect(second.ok).toBe(false)
    expect(second.message).toContain('已存在')
    const forced = await saveTool.execute({ topicId: topic.id, accountId: account.id, copy: 'c3', coverPrompt: 'p3', force: true }, execStub) as { ok: boolean; message: string }
    expect(forced.ok).toBe(true)
  })

  it('xhs_draft_save：bogus topicId 拒绝且不落库', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [saveTool] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' }).slice(1, 2)
    const result = await saveTool.execute({ topicId: 'bogus-topic', accountId: account.id, copy: 'c', coverPrompt: 'p' }, execStub) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('选题不存在')
    expect(store.listDrafts()).toHaveLength(0)
  })

  it('xhs_draft_save：bogus accountId 拒绝且不落库', async () => {
    const store = newStore()
    const [topic] = store.addTopics(['通勤穿搭'])
    const [saveTool] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' }).slice(1, 2)
    const result = await saveTool.execute({ topicId: topic.id, accountId: 'bogus-account', copy: 'c', coverPrompt: 'p' }, execStub) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('账号不存在')
    expect(store.listDrafts()).toHaveLength(0)
  })

  it('xhs_draft_save：缺 copy 拒绝且不落库', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const [saveTool] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' }).slice(1, 2)
    const result = await saveTool.execute({ topicId: topic.id, accountId: account.id, copy: '  ', coverPrompt: 'p' }, execStub) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('参数 copy 必填')
    expect(store.listDrafts()).toHaveLength(0)
  })

  it('xhs_draft_save：force 真覆盖（同账号当日同选题仅存一份且为后者）', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const [saveTool] = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' }).slice(1, 2)
    await saveTool.execute({ topicId: topic.id, accountId: account.id, copy: 'c1', coverPrompt: 'p1', force: true }, execStub)
    await saveTool.execute({ topicId: topic.id, accountId: account.id, copy: 'c2', coverPrompt: 'p2', force: true }, execStub)
    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const drafts = store.listDrafts().filter(d => d.accountId === account.id && d.date === local && d.topicId === topic.id)
    expect(store.listDrafts()).toHaveLength(1)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].copy).toBe('c2')
  })

  it('xhs_topic_add：批量导入', async () => {
    const store = newStore()
    const tools = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' })
    const addTool = tools.find(t => t.name === 'xhs_topic_add')!
    const result = await addTool.execute({ titles: ['通勤穿搭', '秋季护肤'] }, execStub) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(store.listTopics()).toHaveLength(2)
  })

  it('xhs_notes：查询账号已发布笔记知识库', async () => {
    const store = newStore()
    const account = store.upsertAccount({ name: '账号A', personaId: '', enabled: true })
    store.savePublishedNote({ accountId: account.id, title: '实测笔记', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 5 })
    const tools = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' })
    const notesTool = tools.find(t => t.name === 'xhs_notes')!
    const result = await notesTool.execute({ accountId: account.id }, execStub) as { ok: boolean; notes: string[] }
    expect(result.ok).toBe(true)
    expect(result.notes[0]).toContain('实测笔记')
  })

  it('xhs_trends 与 xhs_collection_status：账号级只读查询', async () => {
    const store = newStore()
    const account = store.upsertAccount({ name: '账号A', personaId: '', enabled: true })
    store.saveTrendSample({ accountId: account.id, title: '趋势选题', source: 'apify', status: 'success' })
    const tools = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' })
    const trendsTool = tools.find(t => t.name === 'xhs_trends')!
    const trendsResult = await trendsTool.execute({ accountId: account.id }, execStub) as { ok: boolean; trends: string[] }
    expect(trendsResult.ok).toBe(true)
    expect(trendsResult.trends[0]).toContain('趋势选题')
    const statusTool = tools.find(t => t.name === 'xhs_collection_status')!
    const statusResult = await statusTool.execute({ accountId: account.id }, execStub) as { ok: boolean; status: string }
    expect(statusResult.ok).toBe(true)
  })

  it('xhs_draft_status：published + metrics 触发反馈事件', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [topic] = store.addTopics(['通勤穿搭'])
    const draft = store.saveDraft({ accountId: account.id, topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    const received: unknown[] = []
    const ctx = new Context()
    ctx.on('xhs/feedback', (event: unknown) => { received.push(event) })
    const tools = makeTools({ store, ctx, selectionStrategy: 'fifo' })
    const statusTool = tools.find(t => t.name === 'xhs_draft_status')!
    const result = await statusTool.execute({ draftId: draft.id, status: 'published', metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' } }, execStub) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(received).toHaveLength(1)
  })

  it('xhs_accounts：列出账号与人设', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const tools = makeTools({ store, ctx: {} as any, selectionStrategy: 'fifo' })
    const accountsTool = tools.find(t => t.name === 'xhs_accounts')!
    const result = await accountsTool.execute({}, execStub) as { ok: boolean; accounts: { name: string }[]; personas: { name: string }[] }
    expect(result.ok).toBe(true)
    expect(result.accounts[0].name).toBe('账号A')
    expect(result.personas[0].name).toBe('干货风')
  })
})
