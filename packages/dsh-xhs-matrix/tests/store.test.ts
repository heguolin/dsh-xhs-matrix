import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MATRIX_STORE_VERSION, MatrixStore, MatrixStoreError, matrixStorePath } from '../src/store.ts'
import { migrateStoreFile } from '../src/migration.ts'

let dir: string
let file: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xhs-store-')); file = join(dir, 'xhs.json') })
afterEach(() => { })

describe('MatrixStore', () => {
  it('version 1 迁移到 version 2，并初始化新增集合（不保留 negatives）', () => {
    const migrated = migrateStoreFile({ version: 1, accounts: [], personas: [], topics: [], drafts: [] })
    expect(migrated.version).toBe(2)
    expect(migrated).toMatchObject({ accounts: [], personas: [], topics: [], drafts: [], publishedNotes: [], metricSnapshots: [], trendSamples: [], studioMessages: [] })
    expect('negatives' in migrated).toBe(false)
  })

  it('加载 version 1 文件后持久化为完整 version 2 StoreFile 形状', () => {
    writeFileSync(file, JSON.stringify({ version: 1, accounts: [{ id: 'a1' }], personas: [], topics: [], drafts: [] }))
    const data = new MatrixStore(file).load()
    expect(data).toEqual(expect.objectContaining({ version: 2, publishedNotes: [], metricSnapshots: [], trendSamples: [], studioMessages: [] }))
    const persisted = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    expect(persisted.version).toBe(2)
    expect('negatives' in persisted).toBe(false)
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

  it('去重闸门：同账号+日期+选题的草稿可被 findDraft 发现', () => {
    const store = new MatrixStore(file)
    const topic = store.addTopics(['通勤穿搭'])[0]
    store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    expect(store.findDraft('acc-a', '2026-08-18', topic.id)).toBeTruthy()
    expect(store.findDraft('acc-b', '2026-08-18', topic.id)).toBeUndefined()
  })

  it('markTopicUsed 后选题不再 open', () => {
    const store = new MatrixStore(file)
    const [topic] = store.addTopics(['通勤穿搭'])
    const draft = store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
    store.markTopicUsed(topic.id, draft.id)
    expect(store.listTopics()[0].status).toBe('used')
    expect(store.listTopics()[0].usedByDraftId).toBe(draft.id)
  })

  it('setDraftStatus 携带 metrics', () => {
    const store = new MatrixStore(file)
    const [topic] = store.addTopics(['通勤穿搭'])
    const draft = store.saveDraft({ accountId: 'acc-a', topicId: topic.id, date: '2026-08-18', copy: 'c', coverPrompt: 'p' })
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
    const account = store.upsertAccount({ name: '账号A', personaId: '', enabled: true })
    const note = store.savePublishedNote({ accountId: account.id, title: '标题', copy: '正文', publishedAt: '2026-08-20T00:00:00.000Z', source: 'manual', weight: 3 })
    const message = store.saveStudioMessage({ accountId: account.id, role: 'assistant', content: '建议' })
    expect(note.id).toBeTruthy()
    expect(note.createdAt).toMatch(/T/)
    expect(note.updatedAt).toMatch(/T/)
    expect(message.id).toBeTruthy()
    expect(message.receivedAt).toMatch(/T/)
    expect(message.read).toBe(false)
  })

  it('多账号数据按 accountId 隔离', () => {
    const store = new MatrixStore(file)
    const accountA = store.upsertAccount({ name: 'A', personaId: '', enabled: true })
    const accountB = store.upsertAccount({ name: 'B', personaId: '', enabled: true })
    store.savePublishedNote({ accountId: accountA.id, title: 'A', copy: 'a', publishedAt: '2026-08-20', source: 'manual', weight: 0 })
    store.savePublishedNote({ accountId: accountB.id, title: 'B', copy: 'b', publishedAt: '2026-08-20', source: 'manual', weight: 0 })
    store.saveStudioMessage({ accountId: accountA.id, role: 'user', content: 'a' })
    store.saveStudioMessage({ accountId: accountB.id, role: 'user', content: 'b' })
    expect(store.listPublishedNotes(accountA.id)).toHaveLength(1)
    expect(store.listPublishedNotes(accountB.id)).toHaveLength(1)
    expect(store.listStudioMessages(accountA.id)[0].content).toBe('a')
    expect(store.listStudioMessages(accountB.id)[0].content).toBe('b')
  })

  it('写入不存在账号的已发布笔记会报错', () => {
    const store = new MatrixStore(file)
    expect(() => store.savePublishedNote({ accountId: 'ghost', title: '标题', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 0 }))
      .toThrow(MatrixStoreError)
  })

  it('setNoteWeight 仅允许 0-5 且校验账号归属', () => {
    const store = new MatrixStore(file)
    const account = store.upsertAccount({ name: '账号A', personaId: '', enabled: true })
    const note = store.savePublishedNote({ accountId: account.id, title: '标题', copy: '正文', publishedAt: '2026-08-20', source: 'manual', weight: 0 })
    store.setNoteWeight(account.id, note.id, 5)
    expect(store.listPublishedNotes(account.id)[0].weight).toBe(5)
    expect(() => store.setNoteWeight(account.id, note.id, 6)).toThrow(MatrixStoreError)
  })

  it('爆款池 CRUD 与审核状态流转', () => {
    const store = new MatrixStore(file)
    const account = store.upsertAccount({ name: 'a', personaId: '', enabled: true })
    const item = store.saveViralItem({ accountId: account.id, title: '爆款', body: '正文', sourceUrl: 'https://x.com/1', source: 'apify', score: 35, reasons: ['匹配人设方向'] })
    expect(item.status).toBe('pending')
    const accepted = store.reviewViralItem(account.id, item.id, 'accepted')
    expect(accepted.status).toBe('accepted')
    expect(store.listViralItems(account.id, 'accepted')).toHaveLength(1)
    expect(store.listViralItems(account.id, 'pending')).toHaveLength(0)
    expect(() => store.reviewViralItem('a2', item.id, 'accepted')).toThrow(/账号/)
  })
})
