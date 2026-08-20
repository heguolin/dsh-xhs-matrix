/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type {
  Account, CollectionConfig, CollectionStatus, Draft, DraftMetrics, DraftStatus, MatrixSettings, MetricSnapshot, NoteWeight,
  Persona, PublishedNote, StoreFile, StudioMessage, ViralItem, ViralStatus,
} from './types.ts'
import { defaultMatrixSettings, migrateStoreFile } from './migration.ts'

/** 存储文件格式版本。 */
export const MATRIX_STORE_VERSION = 3

/** 存储文件默认位置。 */
export function matrixStorePath(): string {
  return join(homedir(), '.dsh', 'dsh-xhs-matrix.json')
}

/** 存储错误：介质损坏 / version 不匹配 / 校验失败。 */
export class MatrixStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatrixStoreError'
  }
}

/** 写接口的载荷形状（不含 id/createdAt）。 */
export interface AccountPayload { name: string; personaId: string; enabled: boolean }
export interface PersonaPayload {
  name: string
  prompt: string
  toneTags?: string[]
  positioning?: string
  audience?: string
  expertise?: string
  contentDirections?: string
  hookStyles?: string[]
  bodyStructure?: string
  endingStyle?: string
  forbiddenExpressions?: string
  topicCriteria?: string
  defaultHashtags?: string[]
}
export interface DraftPayload { accountId: string; topicId: string; date: string; copy: string; coverPrompt: string }

export interface PublishedNotePayload {
  accountId: string
  title: string
  copy: string
  topic?: string
  contentType?: string
  sourceUrl?: string
  publishedAt: string
  source: import('./types.ts').DataSource
  weight: NoteWeight
  updatedAt?: string
}

export interface MetricSnapshotPayload {
  noteId: string
  accountId: string
  reads: number
  likes: number
  favorites: number
  comments: number
  shares?: number
  source: import('./types.ts').DataSource
  status: 'success' | 'failed'
  error?: string
}

export interface ViralItemPayload {
  accountId: string
  title: string
  body: string
  sourceUrl?: string
  source: 'apify' | 'manual' | 'import'
  score: number
  reasons: string[]
  publishedAt?: string
  status?: ViralStatus
}

export interface StudioMessagePayload {
  accountId: string
  role: 'user' | 'assistant'
  content: string
  evidenceIds?: string[]
}

function empty(): StoreFile {
  return { version: MATRIX_STORE_VERSION, accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], settings: defaultMatrixSettings() }
}

function nextId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/**
 * 持久化存储：整个 StoreFile 一个文件，写操作后整体原子落盘。
 * @param filePath - 存储文件路径（测试注入临时路径）。
 */
export class MatrixStore {
  static validateAccountPayload(payload: unknown): string | undefined {
    const p = payload as Partial<AccountPayload> | null
    if (typeof p !== 'object' || p === null) return 'body 必须是 JSON 对象'
    if (typeof p.name !== 'string' || p.name.trim() === '') return '账号名必填'
    if (typeof p.personaId !== 'string') return 'personaId 必须是字符串'
    if (typeof p.enabled !== 'boolean') return 'enabled 必须是布尔值'
    return undefined
  }

  static validatePersonaPayload(payload: unknown): string | undefined {
    const p = payload as Partial<PersonaPayload> | null
    if (typeof p !== 'object' || p === null) return 'body 必须是 JSON 对象'
    if (typeof p.name !== 'string' || p.name.trim() === '') return '人设名必填'
    if (typeof p.prompt !== 'string' || p.prompt.trim() === '') return '人设提示词必填'
    return undefined
  }

  private readonly filePath: string
  private data: StoreFile

  private requireAccount(accountId: string): Account {
    const account = this.data.accounts.find(item => item.id === accountId)
    if (account === undefined) throw new MatrixStoreError(`账号不存在：${accountId}`)
    return account
  }

  private requirePublishedNote(accountId: string, noteId: string): PublishedNote {
    this.requireAccount(accountId)
    const note = this.data.publishedNotes.find(item => item.id === noteId && item.accountId === accountId)
    if (note === undefined) throw new MatrixStoreError(`已发布笔记不存在或不属于该账号：${noteId}`)
    return note
  }

  constructor(filePath: string = matrixStorePath()) {
    this.filePath = resolve(filePath)
    this.data = empty()
    // 实例化时自动加载已存在的存储文件，保证新实例直接可见已持久化的数据。
    if (existsSync(this.filePath)) this.load()
  }

  /** 读取并校验存储文件；缺失则返回空结构。 */
  load(): StoreFile {
    if (!existsSync(this.filePath)) {
      this.data = empty()
      return this.data
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(this.filePath, 'utf8'))
    } catch {
      throw new MatrixStoreError(`存储文件损坏，无法解析：${this.filePath}`)
    }
    const file = parsed as Partial<StoreFile> | null
    if (typeof file !== 'object' || file === null || typeof file.version !== 'number') {
      throw new MatrixStoreError(`存储文件形状非法：${this.filePath}`)
    }
    const rawVersion = (file as { version?: number }).version
    if (rawVersion === 1) {
      this.data = migrateStoreFile(file as unknown as Parameters<typeof migrateStoreFile>[0])
      this.save()
      return this.data
    }
    if (rawVersion !== MATRIX_STORE_VERSION) {
      throw new MatrixStoreError(`存储文件 version 不匹配：期望 ${MATRIX_STORE_VERSION}，实际 ${rawVersion}`)
    }
    const now = new Date().toISOString()
    const accounts = Array.isArray(file.accounts) ? file.accounts as Account[] : []
    const publishedNotes = Array.isArray(file.publishedNotes) ? file.publishedNotes as PublishedNote[] : []
    const studioMessages = Array.isArray(file.studioMessages) ? file.studioMessages as StudioMessage[] : []
    const fileSettings = (file.settings ?? {}) as Partial<MatrixSettings>
    const fileApify = (fileSettings.apify ?? {}) as Partial<MatrixSettings['apify']>
    const defaults = defaultMatrixSettings()
    this.data = {
      version: MATRIX_STORE_VERSION,
      accounts: accounts.map(account => ({
        ...account,
        connection: account.connection ?? { status: 'unbound' },
        collection: account.collection ?? { enabled: false, intervalMinutes: 1440, maxItems: 100 },
        collectionStatus: account.collectionStatus ?? { running: false, lastStatus: 'idle' },
      })),
      personas: Array.isArray(file.personas) ? file.personas as Persona[] : [],
      drafts: Array.isArray(file.drafts) ? file.drafts as Draft[] : [],
      publishedNotes: publishedNotes.map(note => ({ ...note, updatedAt: note.updatedAt ?? note.createdAt ?? now })),
      metricSnapshots: Array.isArray(file.metricSnapshots) ? file.metricSnapshots as MetricSnapshot[] : [],
      viralItems: Array.isArray(file.viralItems) ? file.viralItems as ViralItem[] : [],
      studioMessages: studioMessages.map(message => ({ ...message, read: message.read ?? false })),
      settings: {
        apify: {
          actorId: typeof fileApify.actorId === 'string' ? fileApify.actorId : defaults.apify.actorId,
          apiToken: typeof fileApify.apiToken === 'string' ? fileApify.apiToken : defaults.apify.apiToken,
          maxItems: typeof fileApify.maxItems === 'number' ? fileApify.maxItems : defaults.apify.maxItems,
          requestTimeoutMs: typeof fileApify.requestTimeoutMs === 'number' ? fileApify.requestTimeoutMs : defaults.apify.requestTimeoutMs,
          maxPolls: typeof fileApify.maxPolls === 'number' ? fileApify.maxPolls : defaults.apify.maxPolls,
        },
      },
    }
    return this.data
  }

  /** 原子落盘（tmp + rename）。 */
  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const tmp = this.filePath + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(tmp, this.filePath)
  }

  // ---------------------------------------------------------------- 爆款池
  /** 按账号与审核状态列出爆款池条目。 */
  listViralItems(accountId?: string, status?: ViralStatus): ViralItem[] {
    let items = this.data.viralItems
    if (accountId !== undefined) items = items.filter(i => i.accountId === accountId)
    if (status !== undefined) items = items.filter(i => i.status === status)
    return items
  }

  /** 新增爆款池条目（默认 pending）；账号必须存在。 */
  saveViralItem(payload: ViralItemPayload): ViralItem {
    this.requireAccount(payload.accountId)
    const item: ViralItem = { id: nextId(), ...payload, status: payload.status ?? 'pending', collectedAt: new Date().toISOString() }
    this.data.viralItems.push(item)
    this.save()
    return item
  }

  /** 审核爆款条目为 accepted / ignored；条目必须属于该账号。 */
  reviewViralItem(accountId: string, itemId: string, status: 'accepted' | 'ignored'): ViralItem {
    this.requireAccount(accountId)
    const item = this.data.viralItems.find(i => i.id === itemId && i.accountId === accountId)
    if (item === undefined) throw new MatrixStoreError(`爆款不存在或不属于该账号：${itemId}`)
    item.status = status
    this.save()
    return item
  }

  // ---------------------------------------------------------------- 运行时设置
  /** 读取运行时设置（apify 等）。 */
  getSettings(): MatrixSettings {
    return this.data.settings
  }

  /** 更新 Apify 数据源配置并落盘；返回更新后的设置。 */
  updateApifySettings(payload: Partial<MatrixSettings['apify']>): MatrixSettings {
    this.data.settings = {
      ...this.data.settings,
      apify: { ...this.data.settings.apify, ...payload },
    }
    this.save()
    return this.data.settings
  }

  // ---------------------------------------------------------------- 账号
  listAccounts(): Account[] { return this.data.accounts }
  upsertAccount(payload: AccountPayload, id?: string): Account {
    const error = MatrixStore.validateAccountPayload(payload)
    if (error !== undefined) throw new MatrixStoreError(error)
    if (id !== undefined) {
      const existing = this.data.accounts.find(a => a.id === id)
      if (existing === undefined) throw new MatrixStoreError(`账号不存在：${id}`)
      existing.name = payload.name
      existing.personaId = payload.personaId
      existing.enabled = payload.enabled
      this.save()
      return existing
    }
    const account: Account = {
      id: nextId(),
      ...payload,
      createdAt: new Date().toISOString(),
      connection: { status: 'unbound' },
      collection: { enabled: false, intervalMinutes: 1440, maxItems: 100 },
      collectionStatus: { running: false, lastStatus: 'idle' },
    }
    this.data.accounts.push(account)
    this.save()
    return account
  }
  deleteAccount(id: string): void {
    this.data.accounts = this.data.accounts.filter(a => a.id !== id)
    this.save()
  }
  updateAccountConnection(id: string, connection: Account['connection']): Account {
    const account = this.requireAccount(id)
    account.connection = connection
    this.save()
    return account
  }
  updateCollectionConfig(id: string, collection: CollectionConfig): Account {
    const account = this.requireAccount(id)
    if (!Number.isInteger(collection.intervalMinutes) || collection.intervalMinutes < 1) throw new MatrixStoreError('intervalMinutes 必须是正整数')
    if (!Number.isInteger(collection.maxItems) || collection.maxItems < 1) throw new MatrixStoreError('maxItems 必须是正整数')
    account.collection = collection
    this.save()
    return account
  }
  updateCollectionStatus(id: string, status: CollectionStatus): Account {
    const account = this.requireAccount(id)
    account.collectionStatus = status
    this.save()
    return account
  }

  // ---------------------------------------------------------------- 人设
  listPersonas(): Persona[] { return this.data.personas }
  upsertPersona(payload: PersonaPayload, id?: string): Persona {
    const error = MatrixStore.validatePersonaPayload(payload)
    if (error !== undefined) throw new MatrixStoreError(error)
    if (id !== undefined) {
      const existing = this.data.personas.find(p => p.id === id)
      if (existing === undefined) throw new MatrixStoreError(`人设不存在：${id}`)
      existing.name = payload.name
      existing.prompt = payload.prompt
      existing.toneTags = payload.toneTags
      existing.positioning = payload.positioning
      existing.audience = payload.audience
      existing.expertise = payload.expertise
      existing.contentDirections = payload.contentDirections
      existing.hookStyles = payload.hookStyles
      existing.bodyStructure = payload.bodyStructure
      existing.endingStyle = payload.endingStyle
      existing.forbiddenExpressions = payload.forbiddenExpressions
      existing.topicCriteria = payload.topicCriteria
      existing.defaultHashtags = payload.defaultHashtags
      this.save()
      return existing
    }
    const persona: Persona = {
      id: nextId(),
      name: payload.name,
      prompt: payload.prompt,
      toneTags: payload.toneTags,
      positioning: payload.positioning,
      audience: payload.audience,
      expertise: payload.expertise,
      contentDirections: payload.contentDirections,
      hookStyles: payload.hookStyles,
      bodyStructure: payload.bodyStructure,
      endingStyle: payload.endingStyle,
      forbiddenExpressions: payload.forbiddenExpressions,
      topicCriteria: payload.topicCriteria,
      defaultHashtags: payload.defaultHashtags,
      createdAt: new Date().toISOString(),
    }
    this.data.personas.push(persona)
    this.save()
    return persona
  }
  deletePersona(id: string): void {
    this.data.personas = this.data.personas.filter(p => p.id !== id)
    for (const account of this.data.accounts) {
      if (account.personaId === id) account.personaId = ''
    }
    this.save()
  }

  // ---------------------------------------------------------------- 草稿
  listDrafts(): Draft[] { return this.data.drafts }
  findDraft(accountId: string, date: string, topicId: string): Draft | undefined {
    return (this.data.drafts as Array<Draft & { topicId?: string }>).find(d => d.accountId === accountId && d.date === date && d.topicId === topicId)
  }
  saveDraft(payload: DraftPayload): Draft {
    const draft: Draft = { id: nextId(), ...payload, status: 'generated', createdAt: new Date().toISOString() }
    this.data.drafts.push(draft)
    this.save()
    return draft
  }
  deleteDraft(id: string): void {
    this.data.drafts = this.data.drafts.filter(d => d.id !== id)
    this.save()
  }
  setDraftStatus(id: string, status: DraftStatus, metrics?: DraftMetrics): Draft {
    const draft = this.data.drafts.find(d => d.id === id)
    if (draft === undefined) throw new MatrixStoreError(`草稿不存在：${id}`)
    draft.status = status
    if (metrics !== undefined) draft.metrics = metrics
    this.save()
    return draft
  }
  updateDraft(id: string, payload: { copy?: string; coverPrompt?: string; tags?: string }): Draft {
    const draft = this.data.drafts.find(d => d.id === id)
    if (draft === undefined) throw new MatrixStoreError(`草稿不存在：${id}`)
    if (payload.copy !== undefined) draft.copy = payload.copy
    if (payload.coverPrompt !== undefined) draft.coverPrompt = payload.coverPrompt
    if (payload.tags !== undefined) draft.tags = payload.tags
    draft.updatedAt = new Date().toISOString()
    this.save()
    return draft
  }

  // ---------------------------------------------------------------- 已发布笔记
  listPublishedNotes(accountId?: string): PublishedNote[] {
    return accountId === undefined ? this.data.publishedNotes : this.data.publishedNotes.filter(note => note.accountId === accountId)
  }
  savePublishedNote(payload: PublishedNotePayload): PublishedNote {
    return this.importPublishedNotes(payload.accountId, [payload])[0]
  }
  importPublishedNotes(accountId: string, payloads: PublishedNotePayload[]): PublishedNote[] {
    this.requireAccount(accountId)
    if (payloads.some(payload => payload.accountId !== accountId)) throw new MatrixStoreError('导入记录 accountId 与目标账号不一致')
    const now = new Date().toISOString()
    const existingUrls = new Set(this.data.publishedNotes.filter(note => note.accountId === accountId).map(note => note.sourceUrl).filter((url): url is string => url !== undefined))
    const batchUrls = new Set<string>()
    const created = payloads.filter((payload) => {
      if (payload.sourceUrl === undefined) return true
      if (existingUrls.has(payload.sourceUrl) || batchUrls.has(payload.sourceUrl)) return false
      batchUrls.add(payload.sourceUrl)
      return true
    }).map(payload => ({ id: nextId(), ...payload, createdAt: now, updatedAt: payload.updatedAt ?? now }))
    this.data.publishedNotes.push(...created)
    if (created.length > 0) this.save()
    return created
  }
  deletePublishedNote(id: string): void {
    this.data.publishedNotes = this.data.publishedNotes.filter(n => n.id !== id)
    this.save()
  }
  setNoteWeight(accountId: string, noteId: string, weight: number): PublishedNote {
    if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new MatrixStoreError('权重必须是 0-5 的整数')
    this.requirePublishedNote(accountId, noteId)
    const note = this.data.publishedNotes.find(item => item.id === noteId && item.accountId === accountId)
    if (note === undefined) throw new MatrixStoreError(`已发布笔记不存在或不属于该账号：${noteId}`)
    note.weight = weight as NoteWeight
    note.updatedAt = new Date().toISOString()
    this.save()
    return note
  }

  // ---------------------------------------------------------------- 指标快照
  listMetricSnapshots(accountId?: string, noteId?: string): MetricSnapshot[] {
    return this.data.metricSnapshots.filter(snapshot =>
      (accountId === undefined || snapshot.accountId === accountId)
      && (noteId === undefined || snapshot.noteId === noteId),
    )
  }
  saveMetricSnapshot(payload: MetricSnapshotPayload): MetricSnapshot {
    this.requirePublishedNote(payload.accountId, payload.noteId)
    const snapshot: MetricSnapshot = { id: nextId(), ...payload, collectedAt: new Date().toISOString() }
    this.data.metricSnapshots.push(snapshot)
    this.save()
    return snapshot
  }

  // ---------------------------------------------------------------- 创作室消息
  listStudioMessages(accountId?: string): StudioMessage[] {
    return accountId === undefined ? this.data.studioMessages : this.data.studioMessages.filter(message => message.accountId === accountId)
  }
  saveStudioMessage(payload: StudioMessagePayload): StudioMessage {
    this.requireAccount(payload.accountId)
    const message: StudioMessage = { id: nextId(), ...payload, receivedAt: new Date().toISOString(), read: false }
    this.data.studioMessages.push(message)
    this.save()
    return message
  }
  markStudioMessageRead(id: string): void {
    const message = this.data.studioMessages.find(m => m.id === id)
    if (message === undefined) throw new MatrixStoreError(`创作室消息不存在：${id}`)
    message.read = true
    this.save()
  }
}
