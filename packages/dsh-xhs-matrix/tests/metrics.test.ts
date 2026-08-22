/** 指标调度：按 sourceAccountId 找历史笔记并写 accountNameSnapshot。 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { MatrixStore } from '../src/store.ts'
import { CollectionScheduler } from '../src/metrics.ts'
import type { ViralProvider } from '../src/collector/provider.ts'

let store: MatrixStore
let file: string

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'xhs-metrics-'))
  file = join(dir, 'xhs.json')
  store = new MatrixStore(file)
})

const provider: ViralProvider = {
  search: async () => ({ items: [{ title: 't', body: 'b', sourceUrl: 'https://x/1', source: 'apify' }], status: 'success' }),
}

/** 账号绑定 p1 并落一条 p1 笔记，随后换绑到 p2。 */
function rebindScenario() {
  const personaP1 = store.upsertPersona({ name: 'P1', prompt: 'p' }).id
  const personaP2 = store.upsertPersona({ name: 'P2', prompt: 'p' }).id
  const account = store.upsertAccount({ name: '账号A', personaId: personaP1, enabled: true })
  const note = store.savePublishedNote({
    personaId: personaP1, sourceAccountId: account.id, sourceAccountName: '账号A',
    title: 't', copy: 'c', publishedAt: '2026-08-20', source: 'manual', weight: 3,
  })
  store.updateCollectionConfig(account.id, { enabled: true, intervalMinutes: 1440, maxItems: 100 })
  store.upsertAccount({ name: '账号A', personaId: personaP2, enabled: true }, account.id)
  return { personaP1, personaP2, account, note }
}

describe('CollectionScheduler', () => {
  it('指标按 sourceAccountId 找历史笔记：账号换绑后仍采集原人设笔记', async () => {
    const { account, note } = rebindScenario()
    const scheduler = new CollectionScheduler({ store, provider })
    await scheduler.runAccount(account.id)
    const snapshots = store.listMetricSnapshotsByNote(note.id)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({ noteId: note.id, accountId: account.id, accountNameSnapshot: '账号A' })
  })

  it('采集开始时捕获账号名快照并写入结果', async () => {
    const { account, note } = rebindScenario()
    const scheduler = new CollectionScheduler({ store, provider })
    await scheduler.runAccount(account.id)
    expect(store.listMetricSnapshotsByNote(note.id)[0].accountNameSnapshot).toBe('账号A')
  })

  it('来源账号已删除时跳过新采集', async () => {
    const { account, note } = rebindScenario()
    store.deleteAccount(account.id)
    const scheduler = new CollectionScheduler({ store, provider })
    await scheduler.runAccount(account.id)
    expect(store.listMetricSnapshotsByNote(note.id)).toHaveLength(0)
  })
})
