/** 指标快照严格校验与账号级采集调度。 */

import { MatrixStore } from './store.ts'
import type { DataSource, MetricSnapshot } from './types.ts'
import type { CollectionResult, TrendProvider } from './trends.ts'

const SOURCES: DataSource[] = ['manual', 'import', 'apify', 'authorized']

export interface MetricSnapshotInput {
  accountId: string
  noteId: string
  reads: number
  likes: number
  favorites: number
  comments: number
  shares?: number
  source: DataSource
  collectedAt?: string
}

function isIsoDate(value: string): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false
  return !Number.isNaN(Date.parse(value))
}

function isFiniteNonNegative(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** 校验指标快照；失败抛错。 */
export function validateMetricSnapshot(input: MetricSnapshotInput): Omit<MetricSnapshot, 'id'> {
  if (typeof input.accountId !== 'string' || input.accountId.trim() === '') throw new Error('accountId 必填')
  if (typeof input.noteId !== 'string' || input.noteId.trim() === '') throw new Error('noteId 必填')
  for (const [key, value] of [['reads', input.reads], ['likes', input.likes], ['favorites', input.favorites], ['comments', input.comments]] as const) {
    if (!isFiniteNonNegative(value)) throw new Error(`${key} 必须是非负有限数值`)
  }
  if (input.shares !== undefined && !isFiniteNonNegative(input.shares)) throw new Error('shares 必须是非负有限数值')
  if (!SOURCES.includes(input.source)) throw new Error('source 必须是 manual/import/apify/authorized')
  const collectedAt = input.collectedAt ?? new Date().toISOString()
  if (!isIsoDate(collectedAt)) throw new Error('collectedAt 必须是合法 ISO 时间')
  return { accountId: input.accountId, noteId: input.noteId, reads: input.reads, likes: input.likes, favorites: input.favorites, comments: input.comments, shares: input.shares, source: input.source, collectedAt, status: 'success' as const }
}

export interface CollectionSchedulerDeps {
  store: MatrixStore
  provider: TrendProvider
  now?: () => Date
  intervalMs?: number
}

/** 按账号定时采集已发布笔记公开指标；生命周期由插件 Fiber 管理。 */
export class CollectionScheduler {
  private timer: ReturnType<typeof setInterval> | undefined
  private active = false
  private readonly store: MatrixStore
  private readonly provider: TrendProvider
  private readonly now: () => Date
  private readonly intervalMs: number

  constructor(deps: CollectionSchedulerDeps) {
    this.store = deps.store
    this.provider = deps.provider
    this.now = deps.now ?? (() => new Date())
    this.intervalMs = deps.intervalMs ?? 24 * 60 * 60 * 1000
  }

  get isActive(): boolean { return this.active }

  start(): void {
    if (this.active) return
    this.active = true
    this.timer = setInterval(() => { void this.tick() }, this.intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    this.active = false
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  /** 为指定账号执行一轮采集；记录 running/success/failed 状态，不触发生成或发布。 */
  async runAccount(accountId: string): Promise<void> {
    const account = this.store.listAccounts().find(item => item.id === accountId)
    if (account === undefined) return
    if (account.collection === undefined || !account.collection.enabled) return
    const persona = this.store.listPersonas().find(item => item.id === account.personaId)
    if (persona === undefined) return
    this.store.updateCollectionStatus(accountId, { running: true, lastStatus: 'idle' })
    const query = persona.topicCriteria ?? persona.expertise ?? persona.contentDirections ?? persona.name
    let result: CollectionResult
    try {
      result = await this.provider.search({ accountId, query, maxItems: account.collection.maxItems })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.store.updateCollectionStatus(accountId, { running: false, lastStatus: 'failed', lastError: message })
      return
    }
    const notes = this.store.listPublishedNotes(accountId)
    if (result.status === 'failed') {
      for (const note of notes) {
        this.store.saveMetricSnapshot({ accountId, noteId: note.id, reads: 0, likes: 0, favorites: 0, comments: 0, source: 'apify', status: 'failed' as const, error: result.error })
      }
      this.store.updateCollectionStatus(accountId, { running: false, lastStatus: 'failed', lastError: result.error })
      return
    }
    for (const note of notes) {
      const match = result.samples.find(sample => sample.sourceUrl !== undefined && note.sourceUrl !== undefined && sample.sourceUrl === note.sourceUrl)
      this.store.saveMetricSnapshot({
        accountId, noteId: note.id,
        reads: match?.reads ?? 0, likes: match?.likes ?? 0, favorites: match?.favorites ?? 0, comments: match?.comments ?? 0,
        source: 'apify', status: 'success' as const,
      })
    }
    this.store.updateCollectionStatus(accountId, { running: false, lastStatus: 'success', lastSuccessAt: this.now().toISOString() })
  }

  private async tick(): Promise<void> {
    for (const account of this.store.listAccounts()) {
      if (account.collection?.enabled) await this.runAccount(account.id)
    }
  }
}
