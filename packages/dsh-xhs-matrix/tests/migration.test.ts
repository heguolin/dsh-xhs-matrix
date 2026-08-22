import { describe, expect, it } from 'vitest'
import { migrateStoreFile, migrateStoreFileV3ToV4, type StoreFileV3, type V3PublishedNote, type V3ViralItem } from '../src/migration.ts'
import type { Account, NoteWeight, Persona, ViralStatus } from '../src/types.ts'

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

const ISO = '2026-08-22T00:00:00.000Z'

function v3Account(id: string, personaId: string): Account {
  return { id, name: '账号' + id, personaId, enabled: true, createdAt: '2026-08-01T00:00:00.000Z', connection: { status: 'unbound' }, collection: { enabled: false, intervalMinutes: 1440, maxItems: 100 }, collectionStatus: { running: false, lastStatus: 'idle' } }
}
function v3Persona(id: string): Persona {
  return { id, name: '人设' + id, prompt: 'p', hookStyles: ['教程结构'], endingStyle: '自然邀请', createdAt: '2026-08-01T00:00:00.000Z' }
}
function v3Note(id: string, accountId: string, weight: NoteWeight): V3PublishedNote {
  return { id, accountId, title: 'title-' + id, copy: 'copy-' + id, publishedAt: '2026-08-20', source: 'manual', weight, createdAt: ISO, updatedAt: ISO }
}
function v3Viral(id: string, accountId: string, status: ViralStatus = 'pending'): V3ViralItem {
  return { id, accountId, title: 'viral-' + id, body: 'body-' + id, source: 'apify', status, score: 8, reasons: [], collectedAt: ISO }
}
function v3File(partial: Partial<StoreFileV3>): StoreFileV3 {
  return { version: 3, accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], ...partial }
}

describe('v3 → v4 迁移', () => {
  it('v3 可靠归属：账号存在且绑定有效人设时归属该人设并保留来源快照', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({ accounts: [v3Account('a1', 'p1')], personas: [v3Persona('p1')], publishedNotes: [v3Note('n1', 'a1', 3)], viralItems: [v3Viral('v1', 'a1')] }))
    expect(migrated.version).toBe(4)
    expect(migrated.publishedNotes[0]).toMatchObject({ id: 'n1', personaId: 'p1', sourceAccountId: 'a1', sourceAccountName: '账号a1', weight: 3 })
    expect(migrated.viralItems[0]).toMatchObject({ id: 'v1', personaId: 'p1', sourceAccountId: 'a1', sourceAccountName: '账号a1', weight: 1, status: 'pending' })
    expect(migrated.pendingOwnership).toHaveLength(0)
  })

  it('v3 账号缺失进入待归属集合', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({ publishedNotes: [v3Note('n1', 'ghost', 3)] }))
    expect(migrated.publishedNotes).toHaveLength(0)
    expect(migrated.pendingOwnership).toHaveLength(1)
    expect(migrated.pendingOwnership[0].kind).toBe('published-note')
    expect(migrated.pendingOwnership[0].reason).toBe('账号不存在')
  })

  it('v3 账号未绑定人设进入待归属集合', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({ accounts: [v3Account('a1', '')], personas: [], publishedNotes: [v3Note('n1', 'a1', 3)] }))
    expect(migrated.publishedNotes).toHaveLength(0)
    expect(migrated.pendingOwnership).toHaveLength(1)
    expect(migrated.pendingOwnership[0].reason).toBe('账号未绑定人设')
  })

  it('v3 人设引用失效进入待归属集合', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({ accounts: [v3Account('a1', 'ghost')], personas: [], publishedNotes: [v3Note('n1', 'a1', 3)] }))
    expect(migrated.publishedNotes).toHaveLength(0)
    expect(migrated.pendingOwnership).toHaveLength(1)
    expect(migrated.pendingOwnership[0].reason).toBe('人设引用失效')
  })

  it('v3 旧字段改名 hookStyles→writingStyles、endingStyle→endingHookConstraints', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({ personas: [v3Persona('p1')] }))
    const persona = migrated.personas[0]
    expect(persona.writingStyles).toEqual(['教程结构'])
    expect(persona.endingHookConstraints).toBe('自然邀请')
  })

  it('v3 旧爆款默认权重 1 且保留已有审核状态', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({ accounts: [v3Account('a1', 'p1')], personas: [v3Persona('p1')], viralItems: [v3Viral('v1', 'a1', 'accepted'), v3Viral('v2', 'a1', 'ignored')] }))
    expect(migrated.viralItems[0]).toMatchObject({ status: 'accepted', weight: 1 })
    expect(migrated.viralItems[1]).toMatchObject({ status: 'ignored', weight: 1 })
  })

  it('v3 Draft/Studio/指标快照补齐', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({
      accounts: [v3Account('a1', 'p1')], personas: [v3Persona('p1')],
      drafts: [{ id: 'd1', accountId: 'a1', date: '2026-08-20', copy: 'c', coverPrompt: 'p', status: 'generated', createdAt: ISO }],
      metricSnapshots: [{ id: 's1', noteId: 'n1', accountId: 'a1', reads: 1, likes: 0, favorites: 0, comments: 0, collectedAt: ISO, source: 'manual', status: 'success' }],
      studioMessages: [{ id: 'm1', accountId: 'a1', role: 'user', content: 'hi', receivedAt: ISO, read: false }],
    }))
    expect(migrated.drafts[0].personaIdSnapshot).toBe('p1')
    expect(migrated.studioMessages[0].personaIdSnapshot).toBe('p1')
    expect(migrated.metricSnapshots[0].accountNameSnapshot).toBe('账号a1')
  })

  it('v3 多账号同人设合并保持 id 与权重', () => {
    const migrated = migrateStoreFileV3ToV4(v3File({ accounts: [v3Account('a1', 'p1'), v3Account('a2', 'p1')], personas: [v3Persona('p1')], publishedNotes: [v3Note('n1', 'a1', 4), v3Note('n2', 'a2', 2)], viralItems: [v3Viral('v1', 'a1'), v3Viral('v2', 'a2')] }))
    expect(migrated.publishedNotes).toHaveLength(2)
    expect(migrated.publishedNotes.every(n => n.personaId === 'p1')).toBe(true)
    expect(migrated.publishedNotes.map(n => n.id).sort()).toEqual(['n1', 'n2'])
    expect(migrated.publishedNotes.find(n => n.id === 'n1')?.weight).toBe(4)
    expect(migrated.publishedNotes.find(n => n.id === 'n2')?.weight).toBe(2)
    expect(migrated.viralItems.every(v => v.personaId === 'p1')).toBe(true)
  })
})
