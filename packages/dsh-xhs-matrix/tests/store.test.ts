import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MATRIX_STORE_VERSION, MatrixStore, MatrixStoreError, matrixStorePath } from '../src/store.ts'

let dir: string
let file: string

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'xhs-store-')); file = join(dir, 'xhs.json') })
afterEach(() => { })

describe('MatrixStore', () => {
  it('默认路径为 ~/.dsh/dsh-xhs-matrix.json', () => {
    expect(matrixStorePath()).toContain('.dsh')
    expect(matrixStorePath()).toContain('dsh-xhs-matrix.json')
  })

  it('首次加载返回空结构并持久化', () => {
    const store = new MatrixStore(file)
    const data = store.load()
    expect(data.version).toBe(MATRIX_STORE_VERSION)
    expect(data.accounts).toEqual([])
    expect(data.topics).toEqual([])
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
})
