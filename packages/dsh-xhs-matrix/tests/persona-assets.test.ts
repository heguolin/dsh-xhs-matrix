/** PersonaAssetService：路由与工具操作人设资产的唯一入口。 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { MatrixStore } from '../src/store.ts'
import { PersonaAssetService } from '../src/persona-assets.ts'
import type { Account, NoteWeight, ViralStatus } from '../src/types.ts'

const ISO = '2026-08-22T00:00:00.000Z'

let store: MatrixStore
let file: string

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-assets-'))
  file = join(dir, 'xhs.json')
  store = new MatrixStore(file)
})

function createPersona(name = 'P'): string {
  return store.upsertPersona({ name, prompt: 'p' }).id
}
function createAccount(name: string, personaId: string): Account {
  return store.upsertAccount({ name, personaId, enabled: true })
}
/** 另一个人设 id（用于账号换绑）。 */
function anotherPersonaId(): string {
  return store.upsertPersona({ name: 'P2', prompt: 'p2' }).id
}
/** 把账号换绑到另一个人设。 */
function rebindAccount(accountId: string, personaId: string): void {
  const account = store.listAccounts().find(a => a.id === accountId)
  if (account === undefined) throw new Error('账号不存在：' + accountId)
  store.upsertAccount({ name: account.name, personaId, enabled: account.enabled }, accountId)
}
/** 一条合法知识库导入（内容字段，不含 personId / 来源账号）。 */
function validNoteInput() {
  return { title: '标题', copy: '正文', publishedAt: '2026-08-20', source: 'import' as const, weight: 0 as NoteWeight }
}
/** 同人设双账号共享场景。 */
function seededSharedPersona() {
  const personaId = createPersona('P')
  const accountA = createAccount('账号A', personaId)
  const accountB = createAccount('账号B', personaId)
  const service = new PersonaAssetService(store)
  return { store, service, personaId, accountA, accountB }
}

describe('PersonaAssetService', () => {
  it('同人设两账号共享资产，账号换绑不改变来源快照', () => {
    const { service, personaId, accountA, accountB } = seededSharedPersona()
    const note = service.importNotes(personaId, [validNoteInput()], accountA.id, accountA.name)[0]
    expect(accountB.personaId).toBe(personaId)
    rebindAccount(accountA.id, anotherPersonaId())
    expect(service.listNotes(personaId)[0]).toMatchObject({ id: note.id, sourceAccountId: accountA.id, sourceAccountName: accountA.name })
  })

  it('导入显式接收目标 personaId，不依赖账号当前人设', () => {
    const { service, personaId, accountA } = seededSharedPersona()
    service.importNotes(personaId, [validNoteInput()], accountA.id, accountA.name)
    const note = service.listNotes(personaId)[0]
    expect(note.personaId).toBe(personaId)
    expect(note.sourceAccountId).toBe(accountA.id)
    expect(note.sourceAccountName).toBe(accountA.name)
  })

  it('getPersona 返回人设，缺失时抛错', () => {
    const { service, personaId } = seededSharedPersona()
    expect(service.getPersona(personaId).name).toBe('P')
    expect(() => service.getPersona('ghost')).toThrow(/人设/)
  })

  it('setNoteWeight / transferNotes 按人设归属', () => {
    const { service, store, personaId } = seededSharedPersona()
    const target = anotherPersonaId()
    const note = service.importNotes(personaId, [validNoteInput()])[0]
    service.setNoteWeight(personaId, note.id, 4)
    expect(service.listNotes(personaId)[0].weight).toBe(4)
    service.transferNotes(personaId, [note.id], target)
    expect(service.listNotes(personaId)).toHaveLength(0)
    expect(service.listNotes(target)[0].id).toBe(note.id)
    expect(store.listPublishedNotes(target)[0].personaId).toBe(target)
  })

  it('爆款池：手动新增固定 accepted+5，可审核、调权、整批删除与批量转移', () => {
    const { service, personaId } = seededSharedPersona()
    const item = service.addManualViral(personaId, { title: '手动爆款', body: '正文' })
    expect(item).toMatchObject({ source: 'manual', status: 'accepted', weight: 5 })
    service.reviewViral(personaId, item.id, 'ignored')
    expect(service.listVirals(personaId, 'ignored')).toHaveLength(1)
    service.setViralWeight(personaId, item.id, 3)
    expect(service.listVirals(personaId)[0].weight).toBe(3)
    // 单元素手动条目无 batchId → 归入 legacy 批次，整批可删。
    expect(service.deleteBatch(personaId, 'legacy')).toBe(1)
    expect(service.listVirals(personaId)).toHaveLength(0)
  })

  it('listBatches 按人设分组并统计数量', () => {
    const { service, personaId } = seededSharedPersona()
    service.importNotes(personaId, [validNoteInput()])
    store.saveViralItem({ personaId, title: 'v', body: 'b', source: 'apify', score: 8, reasons: [], batchId: 'b1' })
    store.saveViralItem({ personaId, title: 'v2', body: 'b2', source: 'apify', score: 3, reasons: [], batchId: 'b2' })
    const batches = service.listBatches(personaId)
    expect(batches.map(b => b.id).sort()).toEqual(['b1', 'b2'])
    expect(service.listBatches(personaId).find(b => b.id === 'b1')?.itemCount).toBe(1)
  })

  it('transferVirals 把条目移到目标人设', () => {
    const { service, personaId } = seededSharedPersona()
    const target = anotherPersonaId()
    const item = store.saveViralItem({ personaId, title: 'v', body: 'b', source: 'apify', score: 8, reasons: [] })
    service.transferVirals(personaId, [item.id], target)
    expect(service.listVirals(personaId)).toHaveLength(0)
    expect(service.listVirals(target)[0].id).toBe(item.id)
  })

  it('待归属列表与归属后进入正式集合', () => {
    const { service, personaId } = seededSharedPersona()
    store.stashPendingOwnership({
      kind: 'published-note',
      payload: { id: 'orphan', title: '孤儿笔记', copy: '正文', publishedAt: '2026-08-22', source: 'manual', weight: 3, createdAt: ISO, updatedAt: ISO },
      sourceAccountId: 'deleted-account', reason: '账号不存在',
    })
    const pending = service.listPending()[0]
    expect(pending.kind).toBe('published-note')
    const note = service.assignPending(pending.id, personaId)
    expect(note).toMatchObject({ id: 'orphan', personaId })
    expect(service.listPending()).toHaveLength(0)
  })

  it('personaInUse 汇总账号、知识库与爆款数量', () => {
    const { service, store, personaId } = seededSharedPersona()
    service.importNotes(personaId, [validNoteInput()])
    store.saveViralItem({ personaId, title: 'v', body: 'b', source: 'apify', score: 8, reasons: [] })
    expect(service.personaInUse(personaId)).toEqual({ accountCount: 2, noteCount: 1, viralCount: 1 })
  })
})
