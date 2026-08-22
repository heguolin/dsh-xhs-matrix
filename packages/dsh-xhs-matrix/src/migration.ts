/** 存储文件版本迁移（v1/v2 → v4）。 */

import type {
  Account, CollectionStatus, DataSource, Draft, MatrixSettings, MetricSnapshot, NoteWeight, PendingOwnership, Persona, PublishedNote, StoreFile, StudioMessage, ViralItem,
} from './types.ts'

/** 运行时设置默认值（存于 migration 模块，避免 store↔migration 循环依赖）。 */
export function defaultMatrixSettings(): MatrixSettings {
  return {
    apify: {
      actorId: '',
      apiToken: '',
      maxItems: 10,
      requestTimeoutMs: 30000,
      maxPolls: 120,
    },
  }
}

/** version 1 中尚未包含连接和采集配置的账号。 */
type VersionOneAccount = Omit<Account, 'connection' | 'collection' | 'collectionStatus'> & {
  connection?: Account['connection']
  collection?: Account['collection']
  collectionStatus?: CollectionStatus
}

/** v2 旧版趋势样本（迁移为爆款池条目）。 */
interface VersionTwoTrendSample {
  id: string
  accountId: string
  title: string
  summary?: string
  desc?: string
  sourceUrl?: string
  source: string
  publishedAt?: string
  collectedAt: string
  status?: string
}

/** 旧版已发布笔记（v2 仍以 accountId 归属）。 */
interface LegacyNote {
  id: string
  accountId: string
  title: string
  copy: string
  topic?: string
  contentType?: string
  sourceUrl?: string
  publishedAt: string
  source: string
  weight: number
  createdAt: string
  updatedAt?: string
}

/** 旧版草稿（v2 含冗余 topicId 字段）。 */
type LegacyDraft = Draft & { topicId?: string }

/** v1 存储文件的最小输入。 */
export interface VersionOneStoreFile {
  version: 1
  accounts?: VersionOneAccount[]
  personas?: Persona[]
  topics?: unknown[]
  negatives?: unknown[]
  drafts?: LegacyDraft[]
}

/** v2 存储文件输入（含趋势样本与已发布知识库）。 */
export interface VersionTwoStoreFile {
  version: 2
  accounts?: VersionOneAccount[]
  personas?: Persona[]
  topics?: unknown[]
  negatives?: unknown[]
  drafts?: LegacyDraft[]
  publishedNotes?: LegacyNote[]
  metricSnapshots?: MetricSnapshot[]
  trendSamples?: VersionTwoTrendSample[]
  studioMessages?: StudioMessage[]
  settings?: MatrixSettings
}

/** 迁移输入：v1 或 v2 存储文件。 */
export type LegacyStoreFile = VersionOneStoreFile | VersionTwoStoreFile

/** 生成迁移条目 id（时间戳 + 随机后缀）。 */
function nextId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * 将 v1/v2 存储迁移到 v4：无法解析人设的笔记/爆款进入待归属集合，
 * topics/negatives 丢弃、draft 去 topicId，并补齐人设与来源账号快照。
 */
export function migrateStoreFile(file: LegacyStoreFile): StoreFile {
  const defaults = defaultMatrixSettings()
  const accounts = (file.accounts ?? []).map(account => ({
    ...account,
    connection: account.connection ?? { status: 'unbound' },
    collection: account.collection ?? { enabled: false, intervalMinutes: 1440, maxItems: 100 },
    collectionStatus: account.collectionStatus ?? { running: false, lastStatus: 'idle' },
  }))
  const accountById = new Map(accounts.map(account => [account.id, account]))
  const now = new Date().toISOString()
  const pendingOwnership: PendingOwnership[] = []
  const migratedNotes: PublishedNote[] = []
  const migratedViral: ViralItem[] = []

  for (const note of (file.version === 2 ? file.publishedNotes ?? [] : [])) {
    const account = accountById.get(note.accountId)
    const source = note.source === 'import' ? 'import' : note.source === 'manual' ? 'manual' : 'apify'
    if (account !== undefined && typeof account.personaId === 'string' && account.personaId !== '') {
      migratedNotes.push({
        id: note.id,
        personaId: account.personaId,
        sourceAccountId: note.accountId,
        sourceAccountName: account.name,
        title: note.title,
        copy: note.copy,
        topic: note.topic,
        contentType: note.contentType,
        sourceUrl: note.sourceUrl,
        publishedAt: note.publishedAt,
        source,
        weight: note.weight as NoteWeight,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt ?? note.createdAt,
      })
    } else {
      pendingOwnership.push({
        id: 'pending-note-' + note.id,
        kind: 'published-note',
        payload: { id: note.id, sourceAccountId: note.accountId, sourceAccountName: account?.name, title: note.title, copy: note.copy, topic: note.topic, contentType: note.contentType, sourceUrl: note.sourceUrl, publishedAt: note.publishedAt, source: source as DataSource, weight: note.weight as NoteWeight, createdAt: note.createdAt, updatedAt: note.updatedAt ?? note.createdAt },
        sourceAccountId: note.accountId,
        sourceAccountName: account?.name,
        reason: account === undefined ? '账号不存在' : '账号未绑定人设',
        migratedAt: now,
      })
    }
  }

  for (const sample of (file.version === 2 ? file.trendSamples ?? [] : [])) {
    const account = accountById.get(sample.accountId)
    const source: ViralItem['source'] = sample.source === 'manual' ? 'manual' : sample.source === 'import' ? 'import' : 'apify'
    const payload = {
      id: nextId(),
      sourceAccountId: sample.accountId,
      sourceAccountName: account?.name,
      title: sample.title,
      body: sample.summary ?? sample.desc ?? '',
      sourceUrl: sample.sourceUrl,
      source,
      status: 'pending' as const,
      weight: 1 as NoteWeight,
      score: 0,
      reasons: ['历史趋势样本迁移'],
      publishedAt: sample.publishedAt,
      collectedAt: sample.collectedAt,
    }
    if (account !== undefined && typeof account.personaId === 'string' && account.personaId !== '') {
      migratedViral.push({ ...payload, personaId: account.personaId, sourceAccountId: sample.accountId, sourceAccountName: account.name })
    } else {
      pendingOwnership.push({ id: 'pending-viral-' + payload.id, kind: 'viral-item', payload, sourceAccountId: sample.accountId, sourceAccountName: account?.name, reason: account === undefined ? '账号不存在' : '账号未绑定人设', migratedAt: now })
    }
  }

  const drafts = (file.drafts ?? []).map(draft => {
    const { topicId: _topicId, ...rest } = draft
    const account = accountById.get(draft.accountId)
    return { ...rest, personaIdSnapshot: account?.personaId !== undefined && account.personaId !== '' ? account.personaId : undefined }
  })

  const metricSnapshots = (file.version === 2 ? file.metricSnapshots ?? [] : []).map(snapshot => {
    const account = accountById.get(snapshot.accountId)
    return { ...snapshot, accountNameSnapshot: account?.name }
  })

  const studioMessages = (file.version === 2 ? file.studioMessages ?? [] : []).map(message => {
    const account = accountById.get(message.accountId)
    return { ...message, personaIdSnapshot: account?.personaId !== undefined && account.personaId !== '' ? account.personaId : undefined }
  })

  return {
    version: 4,
    accounts,
    personas: file.personas ?? [],
    drafts,
    publishedNotes: migratedNotes,
    metricSnapshots,
    viralItems: migratedViral,
    studioMessages,
    pendingOwnership,
    settings: { apify: { ...defaults.apify, ...(file.version === 2 ? file.settings?.apify ?? {} : {}) } },
  }
}