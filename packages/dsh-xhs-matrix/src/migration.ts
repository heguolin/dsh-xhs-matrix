/** 存储文件版本迁移（v1/v2/v3 → v4）。 */

import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { splitLegacyForbidden } from './content-quality.ts'
import type {
  Account, CollectionStatus, DataSource, Draft, MatrixSettings, MetricSnapshot, NoteWeight, PendingOwnership, Persona, PublishedNote, StudioMessage, StoreFile, ViralItem, ViralStatus,
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

/** v3 已发布笔记：以 accountId 归属，无 personaId/来源快照字段。 */
export interface V3PublishedNote {
  id: string
  accountId: string
  title: string
  copy: string
  topic?: string
  contentType?: string
  sourceUrl?: string
  publishedAt: string
  source: DataSource
  weight: NoteWeight
  createdAt: string
  updatedAt?: string
}

/** v3 爆款条目：以 accountId 归属，无 personaId、无人工权重。 */
export interface V3ViralItem {
  id: string
  accountId: string
  title: string
  body: string
  sourceUrl?: string
  source: 'apify' | 'manual' | 'import'
  status: ViralStatus
  score: number
  reasons?: string[]
  publishedAt?: string
  collectedAt: string
  batchId?: string
}

/** v3 草稿：无 personaIdSnapshot/qualityReport。 */
export type V3Draft = Omit<Draft, 'personaIdSnapshot' | 'qualityReport'>

/** v3 指标快照：无 accountNameSnapshot。 */
export type V3MetricSnapshot = Omit<MetricSnapshot, 'accountNameSnapshot'>

/** v3 创作室消息：无 personaIdSnapshot/requestId。 */
export type V3StudioMessage = Omit<StudioMessage, 'personaIdSnapshot' | 'requestId'>

/** v3 存储文件：笔记/爆款以 accountId 归属。 */
export interface StoreFileV3 {
  version: 3
  accounts?: Account[]
  personas?: Persona[]
  drafts?: V3Draft[]
  publishedNotes?: V3PublishedNote[]
  metricSnapshots?: V3MetricSnapshot[]
  viralItems?: V3ViralItem[]
  studioMessages?: V3StudioMessage[]
  settings?: MatrixSettings
}

/** 生成迁移条目 id（时间戳 + 随机后缀）。 */
function nextId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 旧笔记 source 归一化（保持 v1/v2 既有行为：仅 import/manual/apify）。 */
function normalizeNoteSource(source: string): DataSource {
  return source === 'import' ? 'import' : source === 'manual' ? 'manual' : 'apify'
}

/** 旧趋势样本 source 归一化。 */
function normalizeViralSource(source: string): ViralItem['source'] {
  return source === 'manual' ? 'manual' : source === 'import' ? 'import' : 'apify'
}

/** 解析账号有效人设 id；账号缺失/未绑定/人设引用失效均返回 undefined。 */
function resolvePersonaId(account: Account | undefined, personaById: Map<string, Persona>): string | undefined {
  if (account === undefined) return undefined
  if (typeof account.personaId !== 'string' || account.personaId === '') return undefined
  if (!personaById.has(account.personaId)) return undefined
  return account.personaId
}

/** 无法解析归属时的原因（仅在 resolvePersonaId 失败时调用）。 */
function ownershipReason(account: Account | undefined, personaById: Map<string, Persona>): string {
  if (account === undefined) return '账号不存在'
  if (typeof account.personaId !== 'string' || account.personaId === '') return '账号未绑定人设'
  if (!personaById.has(account.personaId)) return '人设引用失效'
  return '账号未绑定人设'
}

/** 快照人设 id：无法确认时返回 undefined（保留记录但标记为历史未归属）。 */
function snapshotPersonaId(account: Account | undefined, personaById: Map<string, Persona>): string | undefined {
  return resolvePersonaId(account, personaById)
}

/**
 * 将 v1/v2 存储文件先迁为「内存 v3」（笔记/爆款恢复为 accountId 归属、draft 去 topicId），
 * 再走同一 v3→v4 流程，统一整个迁移管线。
 */
function migrateLegacyToV3(file: LegacyStoreFile): StoreFileV3 {
  const accounts = (file.accounts ?? []).map(account => ({
    ...account,
    connection: account.connection ?? { status: 'unbound' },
    collection: account.collection ?? { enabled: false, intervalMinutes: 1440, maxItems: 100 },
    collectionStatus: account.collectionStatus ?? { running: false, lastStatus: 'idle' },
  }))
  const publishedNotes: V3PublishedNote[] = (file.version === 2 ? file.publishedNotes ?? [] : []).map(note => ({
    id: note.id,
    accountId: note.accountId,
    title: note.title,
    copy: note.copy,
    topic: note.topic,
    contentType: note.contentType,
    sourceUrl: note.sourceUrl,
    publishedAt: note.publishedAt,
    source: normalizeNoteSource(note.source),
    weight: note.weight as NoteWeight,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt ?? note.createdAt,
  }))
  const viralItems: V3ViralItem[] = (file.version === 2 ? file.trendSamples ?? [] : []).map(sample => ({
    id: nextId(),
    accountId: sample.accountId,
    title: sample.title,
    body: sample.summary ?? sample.desc ?? '',
    sourceUrl: sample.sourceUrl,
    source: normalizeViralSource(sample.source),
    status: 'pending',
    score: 0,
    reasons: ['历史趋势样本迁移'],
    publishedAt: sample.publishedAt,
    collectedAt: sample.collectedAt,
  }))
  const drafts = (file.drafts ?? []).map(draft => {
    const { topicId: _topicId, ...rest } = draft
    return rest
  })
  const metricSnapshots = (file.version === 2 ? file.metricSnapshots ?? [] : [])
  const studioMessages = (file.version === 2 ? file.studioMessages ?? [] : [])
  return {
    version: 3,
    accounts,
    personas: file.personas ?? [],
    drafts,
    publishedNotes,
    metricSnapshots,
    viralItems,
    studioMessages,
    settings: { apify: { ...defaultMatrixSettings().apify, ...(file.version === 2 ? file.settings?.apify ?? {} : {}) } },
  }
}

/**
 * 将 v1/v2 存储迁移到 v4：先迁为内存 v3，再走 v3→v4 统一流程。
 * 无法解析人设的笔记/爆款进入待归属集合，draft 去 topicId，并补齐人设与来源账号快照。
 */
export function migrateStoreFile(file: LegacyStoreFile): StoreFile {
  return migrateStoreFileV3ToV4(migrateLegacyToV3(file))
}

/**
 * 将 v3 存储迁移到 v4：直接从 file.accounts 与 file.personas 解析归属（不接收外部 resolver）。
 * - 账号存在且绑定有效人设 → 归属该人设，并保存来源账号 id 与名称快照。
 * - 账号缺失/未绑定/人设失效 → 进入 pendingOwnership（reason 区分）。
 * - 旧 ViralItem 一律补 weight=1，既有审核状态保留；内容 id 不重写。
 * - 多账号映射同一人设时内容自然合并，权重不平均也不覆盖。
 */
export function migrateStoreFileV3ToV4(file: StoreFileV3): StoreFile {
  const accounts = (file.accounts ?? []).map(account => ({
    ...account,
    connection: account.connection ?? { status: 'unbound' },
    collection: account.collection ?? { enabled: false, intervalMinutes: 1440, maxItems: 100 },
    collectionStatus: account.collectionStatus ?? { running: false, lastStatus: 'idle' },
  }))
  const accountById = new Map(accounts.map(account => [account.id, account]))
  const personaById = new Map((file.personas ?? []).map(persona => [persona.id, persona]))
  const now = new Date().toISOString()
  const pendingOwnership: PendingOwnership[] = []
  const migratedNotes: PublishedNote[] = []
  const migratedViral: ViralItem[] = []

  for (const note of file.publishedNotes ?? []) {
    const account = accountById.get(note.accountId)
    const personaId = resolvePersonaId(account, personaById)
    if (personaId !== undefined) {
      migratedNotes.push({
        id: note.id,
        personaId,
        sourceAccountId: note.accountId,
        sourceAccountName: account?.name,
        title: note.title,
        copy: note.copy,
        topic: note.topic,
        contentType: note.contentType,
        sourceUrl: note.sourceUrl,
        publishedAt: note.publishedAt,
        source: note.source,
        weight: note.weight,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt ?? note.createdAt,
      })
    } else {
      pendingOwnership.push({
        id: 'pending-note-' + note.id,
        kind: 'published-note',
        payload: { id: note.id, sourceAccountId: note.accountId, sourceAccountName: account?.name, title: note.title, copy: note.copy, topic: note.topic, contentType: note.contentType, sourceUrl: note.sourceUrl, publishedAt: note.publishedAt, source: note.source, weight: note.weight, createdAt: note.createdAt, updatedAt: note.updatedAt ?? note.createdAt },
        sourceAccountId: note.accountId,
        sourceAccountName: account?.name,
        reason: ownershipReason(account, personaById),
        migratedAt: now,
      })
    }
  }

  for (const item of file.viralItems ?? []) {
    const account = accountById.get(item.accountId)
    const personaId = resolvePersonaId(account, personaById)
    const payload: Omit<ViralItem, 'personaId'> = {
      id: item.id,
      sourceAccountId: item.accountId,
      sourceAccountName: account?.name,
      title: item.title,
      body: item.body ?? '',
      sourceUrl: item.sourceUrl,
      source: item.source,
      status: item.status ?? 'pending',
      weight: 1,
      score: item.score,
      reasons: item.reasons ?? [],
      publishedAt: item.publishedAt,
      collectedAt: item.collectedAt,
      batchId: item.batchId,
    }
    if (personaId !== undefined) {
      migratedViral.push({ ...payload, personaId })
    } else {
      pendingOwnership.push({ id: 'pending-viral-' + item.id, kind: 'viral-item', payload, sourceAccountId: item.accountId, sourceAccountName: account?.name, reason: ownershipReason(account, personaById), migratedAt: now })
    }
  }

  const personas = (file.personas ?? []).map(persona => ({
    ...persona,
    writingStyles: persona.writingStyles ?? persona.hookStyles,
    endingHookConstraints: persona.endingHookConstraints ?? persona.endingStyle,
    // v3 旧 forbiddenExpressions（逗号串）迁移为 v4 forbiddenWords（数组）。
    forbiddenWords: persona.forbiddenWords ?? splitLegacyForbidden(persona.forbiddenExpressions),
  }))

  const drafts = (file.drafts ?? []).map(draft => {
    const account = accountById.get(draft.accountId)
    return { ...draft, personaIdSnapshot: snapshotPersonaId(account, personaById) }
  })

  const metricSnapshots = (file.metricSnapshots ?? []).map(snapshot => {
    const account = accountById.get(snapshot.accountId)
    return { ...snapshot, accountNameSnapshot: account?.name }
  })

  const studioMessages = (file.studioMessages ?? []).map(message => {
    const account = accountById.get(message.accountId)
    return { ...message, personaIdSnapshot: snapshotPersonaId(account, personaById) }
  })

  return {
    version: 4,
    accounts,
    personas,
    drafts,
    publishedNotes: migratedNotes,
    metricSnapshots,
    viralItems: migratedViral,
    studioMessages,
    pendingOwnership,
    settings: { apify: { ...defaultMatrixSettings().apify, ...(file.settings?.apify ?? {}) } },
  }
}

/**
 * 在同目录创建带时间戳的 v3 备份文件（逐字节复制），返回备份路径。
 * 备份文件名形如 <file>.bak-<时间戳>；同名已存在时追加序号，绝不覆盖已有备份。
 */
export function backupStoreFile(filePath: string, now?: () => Date): string {
  const stamp = (now ?? (() => new Date()))().toISOString().replace(/[:.]/g, '-')
  let backupPath = filePath + '.bak-' + stamp
  let counter = 0
  while (existsSync(backupPath)) {
    counter += 1
    backupPath = filePath + '.bak-' + stamp + '-' + counter
  }
  copyFileSync(filePath, backupPath)
  return backupPath
}

/** 原子写选项（rename 注入用于故障测试）。 */
export interface AtomicWriteOptions {
  rename?: (from: string, to: string) => void
}

/**
 * 原子落盘：同目录写 <file>.tmp-<pid>-<random>，成功后 renameSync 替换正式文件；
 * 失败时仅删除已解析的临时文件并抛出，正式文件（及既有备份）保持原样。
 */
export function atomicWriteStoreFile(filePath: string, data: StoreFile, options?: AtomicWriteOptions): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2, 8)
  const rename = options?.rename ?? renameSync
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    rename(tmp, filePath)
  } catch (error) {
    try {
      rmSync(tmp, { force: true })
    } catch {
      // 清理失败不掩盖原始错误。
    }
    throw error
  }
}
