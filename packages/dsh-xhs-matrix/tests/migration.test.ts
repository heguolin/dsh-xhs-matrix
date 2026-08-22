import { describe, expect, it } from 'vitest'
import { migrateStoreFile } from '../src/migration.ts'

describe('v2 → v4 迁移', () => {
  it('trendSamples 转为爆款池 pending 条目', () => {
    const migrated = migrateStoreFile({
      version: 2,
      accounts: [{ id: 'a1', name: 'x', personaId: '', enabled: true, createdAt: '2026-08-01T00:00:00.000Z', connection: { status: 'unbound' }, collection: { enabled: false, intervalMinutes: 1440, maxItems: 100 }, collectionStatus: { running: false, lastStatus: 'idle' } }],
      personas: [], drafts: [], publishedNotes: [], metricSnapshots: [],
      trendSamples: [{ id: 't1', accountId: 'a1', title: '爆款标题', summary: '摘要正文', sourceUrl: 'https://x.com/1', source: 'apify', collectedAt: '2026-08-10T00:00:00.000Z', status: 'success' }],
      studioMessages: [],
      settings: { apify: { actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 30000, maxPolls: 120 } },
    } as never)
    expect(migrated.version).toBe(4)
    // 该账号未绑定人设 → 无法归属的趋势样本进入待归属集合。
    expect(migrated.viralItems).toHaveLength(0)
    expect(migrated.pendingOwnership).toHaveLength(1)
    expect(migrated.pendingOwnership[0].kind).toBe('viral-item')
    const pending = migrated.pendingOwnership[0] as { payload: { status: string; body: string; sourceUrl?: string } }
    expect(pending.payload).toMatchObject({ status: 'pending', body: '摘要正文', sourceUrl: 'https://x.com/1' })
    expect('topics' in migrated).toBe(false)
  })
  it('draft 迁移后移除 topicId', () => {
    const migrated = migrateStoreFile({ version: 2, accounts: [], personas: [], topics: [{ id: 'tp1', title: 't', source: 'manual', status: 'open', createdAt: '2026-08-01T00:00:00.000Z' }], drafts: [{ id: 'd1', accountId: 'a1', topicId: 'tp1', date: '2026-08-20', copy: 'c', coverPrompt: 'p', status: 'generated', createdAt: '2026-08-20T00:00:00.000Z' }], publishedNotes: [], metricSnapshots: [], trendSamples: [], studioMessages: [], settings: { apify: { actorId: '', apiToken: '', maxItems: 10, requestTimeoutMs: 30000, maxPolls: 120 } } } as never)
    const draft = migrated.drafts[0] as unknown as Record<string, unknown>
    expect('topicId' in draft).toBe(false)
  })
})
