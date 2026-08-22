import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Draft, MetricSnapshot, PendingOwnership, Persona, PublishedNote, StoreFile, StudioMessage, ViralBatch, ViralItem } from '../src/types.ts'
import { MatrixStore } from '../src/store.ts'

const ISO = '2026-08-22T00:00:00.000Z'

describe('v4 领域类型', () => {
  it('PublishedNote 唯一归属人设并可追踪来源账号', () => {
    const note: PublishedNote = { id: 'n1', personaId: 'p1', sourceAccountId: 'a1', sourceAccountName: '账号A', title: 't', copy: 'c', publishedAt: '2026-08-20', source: 'manual', weight: 3, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z' }
    expect(note.personaId).toBe('p1')
    expect(note.sourceAccountName).toBe('账号A')
    expect('accountId' in note).toBe(false)
  })
  it('ViralItem 含人工权重与唯一归属', () => {
    const item: ViralItem = { id: 'v1', personaId: 'p1', title: '爆款', body: '正文', source: 'apify', status: 'pending', weight: 5, score: 35, reasons: ['匹配人设方向'], collectedAt: '2026-08-20T00:00:00.000Z' }
    expect(item.weight).toBe(5)
    expect('accountId' in item).toBe(false)
  })
  it('ViralBatch 以人设分组', () => {
    const batch: ViralBatch = { id: 'b1', personaId: 'p1', collectedAt: '2026-08-20T00:00:00.000Z', itemCount: 3 }
    expect(batch.personaId).toBe('p1')
  })
  it('Persona 新增写作风格/结尾钩子/违禁词字段', () => {
    const p: Persona = { id: 'p1', name: 'n', prompt: 'p', writingStyles: ['教程结构'], endingHookConstraints: '自然邀请', endingHookExamples: ['一起学习'], forbiddenWords: ['绝对', '最'], createdAt: '2026-08-20T00:00:00.000Z' }
    expect(p.writingStyles).toContain('教程结构')
    expect(p.endingHookConstraints).toBe('自然邀请')
    expect(p.forbiddenWords).toContain('绝对')
  })
  it('Draft/StudioMessage/MetricSnapshot 增加快照字段', () => {
    const draft: Draft = { id: 'd1', accountId: 'a1', date: '2026-08-20', copy: 'c', coverPrompt: 'p', personaIdSnapshot: 'p1', status: 'generated', createdAt: '2026-08-20T00:00:00.000Z' }
    const message: StudioMessage = { id: 'm1', accountId: 'a1', role: 'assistant', content: 'c', personaIdSnapshot: 'p1', requestId: 'r1', receivedAt: '2026-08-20T00:00:00.000Z', read: false }
    const metric: MetricSnapshot = { id: 's1', noteId: 'n1', accountId: 'a1', accountNameSnapshot: '账号A', reads: 1, likes: 0, favorites: 0, comments: 0, collectedAt: '2026-08-20T00:00:00.000Z', source: 'manual', status: 'success' }
    expect(draft.personaIdSnapshot).toBe('p1')
    expect(message.requestId).toBe('r1')
    expect(message.personaIdSnapshot).toBe('p1')
    expect(metric.accountNameSnapshot).toBe('账号A')
  })
  it('StoreFile version 4 且带 pendingOwnership', () => {
    const file: StoreFile = { version: 4, accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], pendingOwnership: [], settings: { apify: { actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 30000, maxPolls: 120 } } }
    expect(file.version).toBe(4)
    expect(file.pendingOwnership).toEqual([])
  })
  it('PendingOwnership 是可辨识联合（published-note / viral-item）', () => {
    const p: PendingOwnership = { id: 'p1', kind: 'published-note', payload: { id: 'n1', title: 't', copy: 'c', publishedAt: '2026-08-20', source: 'manual', weight: 3, createdAt: ISO, updatedAt: ISO }, sourceAccountId: 'a1', reason: '账号不存在', migratedAt: ISO }
    expect(p.kind).toBe('published-note')
    if (p.kind === 'published-note') expect(p.payload.title).toBe('t')
    const v: PendingOwnership = { id: 'p2', kind: 'viral-item', payload: { id: 'v1', title: 't', body: 'b', source: 'apify', status: 'pending', weight: 1, score: 8, reasons: [], collectedAt: ISO }, reason: '账号不存在', migratedAt: ISO }
    expect(v.kind).toBe('viral-item')
  })
  it('v4 store 持久化 pendingOwnership', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xhs-v4-'))
    const path = join(dir, 'x.json')
    const store = new MatrixStore(path)
    store.stashPendingOwnership({ kind: 'published-note', payload: { id: 'n1', title: 't', copy: 'c', publishedAt: '2026-08-20', source: 'manual', weight: 3, createdAt: ISO, updatedAt: ISO }, sourceAccountId: 'a1', reason: 'r' })
    const reloaded = new MatrixStore(path)
    expect(reloaded.listPendingOwnership()).toHaveLength(1)
  })
})
