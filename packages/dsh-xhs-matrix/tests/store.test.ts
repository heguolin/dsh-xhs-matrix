import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { MATRIX_STORE_VERSION, MatrixStore, MatrixStoreError, matrixStorePath } from '../src/store.ts'
import { migrateStoreFile } from '../src/migration.ts'

const ISO = '2026-08-22T00:00:00.000Z'

let dir: string
let file: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xhs-store-')); file = join(dir, 'xhs.json') })

function createStore(): MatrixStore { return new MatrixStore(file) }

function seededPersona(): { store: MatrixStore; personaId: string } {
  const store = createStore()
  const personaId = store.upsertPersona({ name: 'P', prompt: 'p' }).id
  return { store, personaId }
}
function seededNote(): { store: MatrixStore; personaId: string; noteId: string } {
  const { store, personaId } = seededPersona()
  const noteId = store.savePublishedNote({ personaId, title: 't', copy: 'c', publishedAt: '2026-08-20', source: 'manual', weight: 0 }).id
  return { store, personaId, noteId }
}
function seededAccountWithAssets(): { store: MatrixStore; personaId: string; accountId: string; noteId: string } {
  const store = createStore()
  const personaId = store.upsertPersona({ name: 'P', prompt: 'p' }).id
  const accountId = store.upsertAccount({ name: '账号A', personaId, enabled: true }).id
  const noteId = store.savePublishedNote({ personaId, sourceAccountId: accountId, sourceAccountName: '账号A', title: 't', copy: 'c', publishedAt: '2026-08-20', source: 'manual', weight: 0 }).id
  store.saveViralItem({ personaId, sourceAccountId: accountId, sourceAccountName: '账号A', title: 'v', body: 'b', source: 'apify', score: 5, reasons: [] })
  store.saveMetricSnapshot({ accountId, noteId, reads: 1, likes: 0, favorites: 0, comments: 0, source: 'manual', status: 'success' })
  store.saveStudioMessage({ accountId, role: 'user', content: 'hi' })
  store.saveDraft({ accountId, date: '2026-08-22', copy: 'c', coverPrompt: 'p' })
  return { store, personaId, accountId, noteId }
}

describe('MatrixStore', () => {
  it('version 1 迁移到 version 4，并初始化新增集合（不保留 negatives/topics）', () => {
    const migrated = migrateStoreFile({ version: 1, accounts: [], personas: [], topics: [], drafts: [] })
    expect(migrated.version).toBe(4)
    expect(migrated).toMatchObject({ accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], pendingOwnership: [] })
    expect('negatives' in migrated).toBe(false)
    expect('topics' in migrated).toBe(false)
  })

  it('加载 version 1 文件后持久化为完整 version 4 StoreFile 形状', () => {
    writeFileSync(file, JSON.stringify({ version: 1, accounts: [{ id: 'a1' }], personas: [], topics: [], drafts: [] }))
    const data = new MatrixStore(file).load()
    expect(data).toEqual(expect.objectContaining({ version: 4, publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], pendingOwnership: [] }))
    const persisted = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    expect(persisted.version).toBe(4)
    expect('negatives' in persisted).toBe(false)
  })

  it('加载 version 2 文件：无法归属的趋势样本进入待归属集合', () => {
    writeFileSync(file, JSON.stringify({
      version: 2,
      accounts: [{ id: 'a1' }],
      personas: [],
      topics: [{ id: 'tp1', title: 't', source: 'manual', status: 'open', createdAt: '2026-08-01T00:00:00.000Z' }],
      drafts: [{ id: 'd1', accountId: 'a1', topicId: 'tp1', date: '2026-08-20', copy: 'c', coverPrompt: 'p', status: 'generated', createdAt: '2026-08-20T00:00:00.000Z' }],
      publishedNotes: [],
      metricSnapshots: [],
      trendSamples: [{ id: 't1', accountId: 'a1', title: '爆款标题', summary: '摘要正文', sourceUrl: 'https://x.com/1', source: 'apify', collectedAt: '2026-08-10T00:00:00.000Z', status: 'success' }],
      studioMessages: [],
    }))
    const data = new MatrixStore(file).load()
    expect(data.version).toBe(4)
    expect(data.viralItems).toHaveLength(0)
    expect(data.pendingOwnership).toHaveLength(1)
    expect(data.pendingOwnership[0].kind).toBe('viral-item')
    expect('topicId' in data.drafts[0]).toBe(false)
    const persisted = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    expect(persisted.version).toBe(4)
    expect('topics' in persisted).toBe(false)
  })
  it('默认路径为 ~/.dsh/dsh-xhs-matrix.json', () => {
    expect(matrixStorePath()).toContain('.dsh')
    expect(matrixStorePath()).toContain('dsh-xhs-matrix.json')
  })

  it('首次加载返回空结构并持久化', () => {
    const store = new MatrixStore(file)
    const data = store.load()
    expect(data.version).toBe(MATRIX_STORE_VERSION)
    expect(data.accounts).toEqual([])
    expect(data.viralItems).toEqual([])
    expect(data.pendingOwnership).toEqual([])
  })

  it('upsert 与 roundtrip 持久化', () => {
    const store = new MatrixStore(file)
    const account = store.upsertAccount({ name: '账号A', personaId: 'p1', enabled: true })
    expect(account.id).toBeTruthy()
    expect(store.listAccounts()).toHaveLength(1)
    const reloaded = new MatrixStore(file)
    expect(reloaded.listAccounts()[0].name).toBe('账号A')
  })

  it('version 不匹配明确报错', () => {
    writeFileSync(file, JSON.stringify({ version: MATRIX_STORE_VERSION + 1, accounts: [] }))
    expect(() => new MatrixStore(file).load()).toThrow(MatrixStoreError)
    expect(() => new MatrixStore(file).load()).toThrow(/version/)
  })

  it('损坏介质明确报错', () => {
    writeFileSync(file, '{not json')
    expect(() => new MatrixStore(file).load()).toThrow(MatrixStoreError)
  })

  it('去重闸门：同账号+日期的草稿可被 findDraft 发现（v4 草稿仍按账号隔离）', () => {
    const store = new MatrixStore(file)
    store.saveDraft({ accountId: 'acc-a', date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    expect(store.findDraft('acc-a', '2026-08-18')).toBeTruthy()
    expect(store.findDraft('acc-b', '2026-08-18')).toBeUndefined()
  })

  it('setDraftStatus 携带 metrics', () => {
    const store = new MatrixStore(file)
    const draft = store.saveDraft({ accountId: 'acc-a', date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    const updated = store.setDraftStatus(draft.id, 'published', { reads: 50, likes: 3, comments: 1, collected: '2026-08-20T10:00:00.000Z' })
    expect(updated.status).toBe('published')
    expect(updated.metrics?.reads).toBe(50)
  })

  it('删除人设后引用账号的 personaId 置空', () => {
    const store = new MatrixStore(file)
    const p = store.upsertPersona({ name: '干货风', prompt: '专业' })
    const a = store.upsertAccount({ name: '账号A', personaId: p.id, enabled: true })
    store.deletePersona(p.id)
    expect(store.listAccounts().find(x => x.id === a.id)?.personaId).toBe('')
  })

  it('payload 校验', () => {
    expect(MatrixStore.validateAccountPayload({ name: '', personaId: 'p1', enabled: true })).toMatch(/账号名/)
    expect(MatrixStore.validateAccountPayload({ name: '账号A', personaId: 'p1', enabled: true })).toBeUndefined()
  })

  it('原子写：save 后文件可直接读取', () => {
    const store = new MatrixStore(file)
    store.upsertAccount({ name: '账号A', personaId: '', enabled: true })
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { version: number }
    expect(raw.version).toBe(MATRIX_STORE_VERSION)
  })

  it('已发布笔记与创作室消息补齐默认字段', () => {
    const store = new MatrixStore(file)
    const persona = store.upsertPersona({ name: '账号A', prompt: 'p' })
    const account = store.upsertAccount({ name: 'A', personaId: persona.id, enabled: true })
    const note = store.savePublishedNote({ personaId: persona.id, title: '标题', copy: '正文', publishedAt: '2026-08-20T00:00:00.000Z', source: 'manual', weight: 3 })
    const message = store.saveStudioMessage({ accountId: account.id, role: 'assistant', content: '建议' })
    expect(note.id).toBeTruthy()
    expect(note.personaId).toBe(persona.id)
    expect(note.createdAt).toMatch(/T/)
    expect(note.updatedAt).toMatch(/T/)
    expect(message.id).toBeTruthy()
    expect(message.receivedAt).toMatch(/T/)
    expect(message.read).toBe(false)
  })

  it('笔记按人设隔离，创作室消息按账号隔离', () => {
    const store = new MatrixStore(file)
    const personaA = store.upsertPersona({ name: 'A', prompt: 'p' }).id
    const personaB = store.upsertPersona({ name: 'B', prompt: 'p' }).id
    store.savePublishedNote({ personaId: personaA, title: 'A', copy: 'a', publishedAt: '2026-08-20', source: 'manual', weight: 0 })
    store.savePublishedNote({ personaId: personaB, title: 'B', copy: 'b', publishedAt: '2026-08-20', source: 'manual', weight: 0 })
    const accA = store.upsertAccount({ name: 'A', personaId: personaA, enabled: true }).id
    const accB = store.upsertAccount({ name: 'B', personaId: personaB, enabled: true }).id
    store.saveStudioMessage({ accountId: accA, role: 'user', content: 'a' })
    store.saveStudioMessage({ accountId: accB, role: 'user', content: 'b' })
    expect(store.listPublishedNotes(personaA)).toHaveLength(1)
    expect(store.listPublishedNotes(personaB)).toHaveLength(1)
    expect(store.listStudioMessages(accA).length).toBe(1)
    expect(store.listStudioMessages(accB).length).toBe(1)
  })

  it('写入不存在人设的已发布笔记会报错', () => {
    const store = new MatrixStore(file)
    expect(() => store.savePublishedNote({ personaId: 'ghost', title: '标题', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 0 }))
      .toThrow(MatrixStoreError)
  })

  it('setNoteWeight 仅允许 0-5 且校验人设归属', () => {
    const store = new MatrixStore(file)
    const personaId = store.upsertPersona({ name: '账号A', prompt: 'p' }).id
    const note = store.savePublishedNote({ personaId, title: '标题', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 0 })
    store.setNoteWeight(personaId, note.id, 5)
    expect(store.listPublishedNotes(personaId)[0].weight).toBe(5)
    expect(() => store.setNoteWeight(personaId, note.id, 6)).toThrow(MatrixStoreError)
    expect(() => store.setNoteWeight('ghost', note.id, 5)).toThrow(/人设/)
  })

  it('爆款池 CRUD 与审核状态流转', () => {
    const store = new MatrixStore(file)
    const personaId = store.upsertPersona({ name: 'a', prompt: 'p' }).id
    const item = store.saveViralItem({ personaId, title: '爆款', body: '正文', sourceUrl: 'https://x.com/1', source: 'apify', score: 35, reasons: ['匹配人设方向'] })
    expect(item.status).toBe('pending')
    expect(item.weight).toBe(1)
    const accepted = store.reviewViralItem(personaId, item.id, 'accepted')
    expect(accepted.status).toBe('accepted')
    expect(store.listViralItems(personaId, 'accepted')).toHaveLength(1)
    expect(store.listViralItems(personaId, 'pending')).toHaveLength(0)
    expect(() => store.reviewViralItem('ghost', item.id, 'accepted')).toThrow(/人设/)
  })

  it('历史条目（无 batchId）归入 legacy 批次且可查询', () => {
    const store = new MatrixStore(file)
    const personaId = store.upsertPersona({ name: 'a', prompt: 'p' }).id
    store.saveViralItem({ personaId, title: '历史爆款', body: '正文', source: 'apify', score: 10, reasons: [] })
    const batches = store.listViralBatches(personaId)
    expect(batches).toHaveLength(1)
    expect(batches[0].id).toBe('legacy')
    expect(batches[0].itemCount).toBe(1)
    expect(store.listViralItems(personaId, undefined, 'legacy')).toHaveLength(1)
  })

  it('草稿保存自动提取话题标签', () => {
    const store = new MatrixStore(file)
    const account = store.upsertAccount({ name: 'a', personaId: '', enabled: true })
    const draft = store.saveDraft({ accountId: account.id, date: '2026-08-21', copy: '标题\n正文内容 #效率工具 #职场成长 #效率工具', coverPrompt: 'p' })
    expect(draft.tags).toBe('#效率工具 #职场成长')
  })

  it('更新草稿时未传标签自动从正文提取', () => {
    const store = new MatrixStore(file)
    const account = store.upsertAccount({ name: 'a', personaId: '', enabled: true })
    const draft = store.saveDraft({ accountId: account.id, date: '2026-08-21', copy: '标题\n无标签正文', coverPrompt: 'p' })
    expect(draft.tags).toBeUndefined()
    const updated = store.updateDraft(draft.id, { copy: '新正文 #打工人 #效率' })
    expect(updated.tags).toBe('#打工人 #效率')
  })

  // ------------------------------------------------ brief Step 1 tests
  it('完整待归属笔记归属后保持 id、正文和权重', () => {
    const store = createStore()
    const personaId = store.upsertPersona({ name: 'P', prompt: 'p' }).id
    store.stashPendingOwnership({
      kind: 'published-note',
      payload: { id: 'legacy-note', title: '孤儿笔记', copy: '完整正文', publishedAt: '2026-08-22', source: 'manual', weight: 3, createdAt: ISO, updatedAt: ISO },
      sourceAccountId: 'deleted-account', reason: '账号不存在',
    })
    const pending = store.listPendingOwnership()[0]
    expect(store.assignPendingOwnership(pending.id, personaId)).toMatchObject({ id: 'legacy-note', personaId, copy: '完整正文', weight: 3 })
    expect(store.listPendingOwnership()).toHaveLength(0)
  })

  it('手动爆款固定 accepted+5，采集爆款默认 pending+1', () => {
    const { store, personaId } = seededPersona()
    expect(store.addManualViral(personaId, { title: '手动', body: '正文' })).toMatchObject({ source: 'manual', status: 'accepted', weight: 5 })
    expect(store.saveViralItem({ personaId, title: '采集', body: '正文', source: 'apify', score: 8, reasons: [] })).toMatchObject({ status: 'pending', weight: 1 })
  })

  it.each([-1, 1.5, 6])('拒绝非法权重 %s', weight => {
    const { store, personaId, noteId } = seededNote()
    expect(() => store.setNoteWeight(personaId, noteId, weight)).toThrow(/0.*5.*整数/)
  })

  it('删除账号只清理账号私有数据，保留人设资产和指标快照', () => {
    const seeded = seededAccountWithAssets()
    seeded.store.deleteAccount(seeded.accountId)
    expect(seeded.store.listPublishedNotes(seeded.personaId)).toHaveLength(1)
    expect(seeded.store.listViralItems(seeded.personaId)).toHaveLength(1)
    expect(seeded.store.listMetricSnapshotsByNote(seeded.noteId)).toHaveLength(1)
    expect(seeded.store.listStudioMessages(seeded.accountId)).toHaveLength(0)
    expect(seeded.store.listDrafts(seeded.accountId)).toHaveLength(0)
  })

  it('assignPendingOwnership 失败时不移除 pending 记录', () => {
    const store = createStore()
    store.stashPendingOwnership({ kind: 'published-note', payload: { id: 'n1', title: 't', copy: 'c', publishedAt: '2026-08-22', source: 'manual', weight: 3, createdAt: ISO, updatedAt: ISO }, reason: 'r' })
    const pending = store.listPendingOwnership()[0]
    expect(() => store.assignPendingOwnership(pending.id, 'ghost-persona')).toThrow(/人设/)
    expect(store.listPendingOwnership()).toHaveLength(1)
  })
})
