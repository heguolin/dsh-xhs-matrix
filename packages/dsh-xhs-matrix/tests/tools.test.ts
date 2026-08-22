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
    const [today] = makeTools({ store, ctx: {} as any })
    const result = await today.execute({}, execStub) as { ok: boolean; message: string; briefs: string[] }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('账号')
  })

  it('xhs_today：基于爆款池生成创作简报', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业、数据支撑' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    store.saveViralItem({ personaId: persona.id, title: '通勤穿搭公式', body: '正文', source: 'apify', score: 80, reasons: ['命中人设方向'] })
    const [today] = makeTools({ store, ctx: {} as any })
    const result = await today.execute({}, execStub) as { ok: boolean; briefs: string[] }
    expect(result.ok).toBe(true)
    expect(result.briefs[0]).toContain('账号A')
    expect(result.briefs[0]).toContain('干货风')
    expect(result.briefs[0]).toContain('通勤穿搭公式')
  })

  it('xhs_today：今日已发则跳过该账号', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    store.saveViralItem({ personaId: persona.id, title: '通勤穿搭公式', body: '正文', source: 'apify', score: 80, reasons: ['命中人设方向'] })
    const now = new Date()
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    store.saveDraft({ accountId: account.id, date: local, copy: 'c', coverPrompt: 'p' })
    const [today] = makeTools({ store, ctx: {} as any })
    const result = await today.execute({}, execStub) as { message: string }
    expect(result.message).toContain('今日已生成')
  })

  it('xhs_today：爆款池为空则跳过该账号', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const [today] = makeTools({ store, ctx: {} as any })
    const result = await today.execute({}, execStub) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('爆款池为空')
  })

  it('xhs_draft_save：同账号当日去重（v3 草稿无选题）', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const tools = makeTools({ store, ctx: {} as any })
    const saveTool = tools.find(t => t.name === 'xhs_draft_save')!
    const first = await saveTool.execute({ accountId: account.id, copy: 'c1', coverPrompt: 'p1' }, execStub) as { ok: boolean; message: string }
    expect(first.ok).toBe(true)
    const second = await saveTool.execute({ accountId: account.id, copy: 'c2', coverPrompt: 'p2' }, execStub) as { ok: boolean; message: string }
    expect(second.ok).toBe(false)
    expect(second.message).toContain('已存在')
    const forced = await saveTool.execute({ accountId: account.id, copy: 'c3', coverPrompt: 'p3', force: true }, execStub) as { ok: boolean; message: string }
    expect(forced.ok).toBe(true)
  })

  it('xhs_draft_save：bogus accountId 拒绝且不落库', async () => {
    const store = newStore()
    const tools = makeTools({ store, ctx: {} as any })
    const saveTool = tools.find(t => t.name === 'xhs_draft_save')!
    const result = await saveTool.execute({ accountId: 'bogus-account', copy: 'c', coverPrompt: 'p' }, execStub) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('账号不存在')
    expect(store.listDrafts()).toHaveLength(0)
  })

  it('xhs_draft_save：缺 copy 拒绝且不落库', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const tools = makeTools({ store, ctx: {} as any })
    const saveTool = tools.find(t => t.name === 'xhs_draft_save')!
    const result = await saveTool.execute({ accountId: account.id, copy: '  ', coverPrompt: 'p' }, execStub) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('参数 copy 必填')
    expect(store.listDrafts()).toHaveLength(0)
  })

  it('xhs_draft_save：force 真覆盖（同账号当日仅存一份且为后者）', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const tools = makeTools({ store, ctx: {} as any })
    const saveTool = tools.find(t => t.name === 'xhs_draft_save')!
    await saveTool.execute({ accountId: account.id, copy: 'c1', coverPrompt: 'p1', force: true }, execStub)
    await saveTool.execute({ accountId: account.id, copy: 'c2', coverPrompt: 'p2', force: true }, execStub)
    expect(store.listDrafts()).toHaveLength(1)
    expect(store.listDrafts()[0].copy).toBe('c2')
  })

  it('xhs_virals：查询账号爆款池并按状态过滤', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    store.saveViralItem({ personaId: persona.id, title: '爆款A', body: '正文A', sourceUrl: 'https://x.com/a', source: 'apify', score: 70, reasons: ['命中人设方向'] })
    store.reviewViralItem(persona.id, store.listViralItems(persona.id)[0].id, 'accepted')
    store.saveViralItem({ personaId: persona.id, title: '爆款B', body: '正文B', source: 'apify', score: 60, reasons: ['高互动'] })
    const tools = makeTools({ store, ctx: {} as any })
    const viralsTool = tools.find(t => t.name === 'xhs_virals')!
    const all = await viralsTool.execute({ accountId: account.id }, execStub) as { ok: boolean; items: Array<{ id: string; title: string; status: string; score: number; reasons: string[] }> }
    expect(all.ok).toBe(true)
    expect(all.items).toHaveLength(2)
    expect(all.items[0].title).toBe('爆款A')
    expect(all.items[0].status).toBe('accepted')
    expect(all.items[0].reasons).toContain('命中人设方向')
    const accepted = await viralsTool.execute({ accountId: account.id, status: 'accepted' }, execStub) as { ok: boolean; items: unknown[] }
    expect(accepted.items).toHaveLength(1)
    const bogus = await viralsTool.execute({ accountId: account.id, status: 'bogus' }, execStub) as { ok: boolean; message: string }
    expect(bogus.ok).toBe(false)
    expect(bogus.message).toContain('pending/accepted/ignored')
  })

  it('xhs_virals：账号不存在时拒绝', async () => {
    const store = newStore()
    const tools = makeTools({ store, ctx: {} as any })
    const viralsTool = tools.find(t => t.name === 'xhs_virals')!
    const result = await viralsTool.execute({ accountId: 'ghost' }, execStub) as { ok: boolean; message: string }
    expect(result.ok).toBe(false)
    expect(result.message).toContain('账号不存在')
  })

  it('xhs_notes：查询账号已发布笔记知识库', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    store.savePublishedNote({ personaId: persona.id, title: '实测笔记', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 5 })
    const tools = makeTools({ store, ctx: {} as any })
    const notesTool = tools.find(t => t.name === 'xhs_notes')!
    const result = await notesTool.execute({ accountId: account.id }, execStub) as { ok: boolean; notes: string[] }
    expect(result.ok).toBe(true)
    expect(result.notes[0]).toContain('实测笔记')
  })

  it('xhs_collection_status：账号级只读查询', async () => {
    const store = newStore()
    const account = store.upsertAccount({ name: '账号A', personaId: '', enabled: true })
    const tools = makeTools({ store, ctx: {} as any })
    const statusTool = tools.find(t => t.name === 'xhs_collection_status')!
    const result = await statusTool.execute({ accountId: account.id }, execStub) as { ok: boolean; status: string }
    expect(result.ok).toBe(true)
  })

  it('xhs_draft_status：published + metrics 触发反馈事件', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const account = store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const draft = store.saveDraft({ accountId: account.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    const received: unknown[] = []
    const ctx = new Context()
    ctx.on('xhs/feedback', (event: unknown) => { received.push(event) })
    const tools = makeTools({ store, ctx })
    const statusTool = tools.find(t => t.name === 'xhs_draft_status')!
    const result = await statusTool.execute({ draftId: draft.id, status: 'published', metrics: { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' } }, execStub) as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(received).toHaveLength(1)
  })

  it('xhs_accounts：列出账号与人设', async () => {
    const store = newStore()
    const persona = store.upsertPersona({ name: '干货风', prompt: '专业' })
    store.upsertAccount({ name: '账号A', personaId: persona.id, enabled: true })
    const tools = makeTools({ store, ctx: {} as any })
    const accountsTool = tools.find(t => t.name === 'xhs_accounts')!
    const result = await accountsTool.execute({}, execStub) as { ok: boolean; accounts: { name: string }[]; personas: { name: string }[] }
    expect(result.ok).toBe(true)
    expect(result.accounts[0].name).toBe('账号A')
    expect(result.personas[0].name).toBe('干货风')
  })

  it('不再暴露选题池/趋势工具（xhs_topics/xhs_topic_add/xhs_trends）', () => {
    const store = newStore()
    const names = makeTools({ store, ctx: {} as any }).map(t => t.name)
    expect(names).toContain('xhs_today')
    expect(names).toContain('xhs_draft_save')
    expect(names).toContain('xhs_virals')
    expect(names).toContain('xhs_accounts')
    expect(names).toContain('xhs_draft_status')
    expect(names).toContain('xhs_notes')
    expect(names).toContain('xhs_collection_status')
    expect(names).not.toContain('xhs_topics')
    expect(names).not.toContain('xhs_topic_add')
    expect(names).not.toContain('xhs_trends')
  })
})