import { describe, expect, it } from 'vitest'
import type { Draft, StoreFile, ViralItem } from '../src/types.ts'

describe('领域类型（version 4）', () => {
  it('ViralItem 含标题/正文/链接/审核状态/权重', () => {
    const item: ViralItem = {
      id: 'v1', personaId: 'p1', title: '爆款标题', body: '正文',
      sourceUrl: 'https://x.com/1', source: 'apify', status: 'pending', weight: 1,
      score: 35, reasons: ['匹配人设方向'], collectedAt: '2026-08-20T00:00:00.000Z',
    }
    expect(item.status).toBe('pending')
    expect(item.weight).toBe(1)
    expect(item.sourceUrl).toContain('https')
  })
  it('Draft 不再有 topicId', () => {
    const draft: Draft = { id: 'd1', accountId: 'a1', date: '2026-08-20', copy: 'c', coverPrompt: 'p', status: 'generated', createdAt: '2026-08-20T00:00:00.000Z' }
    expect('topicId' in draft).toBe(false)
  })
  it('StoreFile v4 有 viralItems 与 pendingOwnership，无 topics', () => {
    const file: StoreFile = { version: 4, accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], pendingOwnership: [], settings: { apify: { actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 30000, maxPolls: 120 } } }
    expect(file.version).toBe(4)
    expect('topics' in file).toBe(false)
    expect('trendSamples' in file).toBe(false)
  })
})
