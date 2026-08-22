/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type {
  Account, CollectionConfig, CollectionStatus, Draft, DraftMetrics, DraftQualityReport, DraftStatus,
  MatrixSettings, MetricSnapshot, NoteWeight, PendingOwnership, Persona, PublishedNote, StoreFile,
  StudioMessage, ViralBatch, ViralItem, ViralStatus,
} from './types.ts'
import { atomicWriteStoreFile, backupStoreFile, defaultMatrixSettings, migrateStoreFile, migrateStoreFileV3ToV4, type StoreFileV3 } from './migration.ts'

/** 存储文件格式版本。 */
export const MATRIX_STORE_VERSION = 4

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
  writingStyles?: string[]
  endingHookConstraints?: string
  endingHookExamples?: string[]
  forbiddenWords?: string[]
}
/** 从文案中提取话题标签（#开头，去重，空格分隔）；无标签返回 undefined。 */
export function extractHashtags(text: string): string | undefined {
  const tags = text.match(/#[^\s#，,。.!！?？]+/g)
  if (tags === null || tags.length === 0) return undefined
  return [...new Set(tags)].join(' ')
}

export interface DraftPayload {
  accountId: string
  date: string
  copy: string
  coverPrompt: string
  tags?: string
  personaIdSnapshot?: string
  qualityReport?: DraftQualityReport
}

export interface PublishedNotePayload {
  personaId: string
  sourceAccountId?: string
  sourceAccountName?: string
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
  accountNameSnapshot?: string
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
  personaId: string
  sourceAccountId?: string
  sourceAccountName?: string
  title: string
  body: string
  sourceUrl?: string
  source: 'apify' | 'manual' | 'import'
  score: number
  reasons: string[]
  publishedAt?: string
  status?: ViralStatus
  batchId?: string
}

/** 手动新增爆款载荷：标题 + 正文必填；来源链接与发布时间可选。 */
export interface ManualViralPayload {
  title: string
  body: string
  sourceUrl?: string
  publishedAt?: string
  reasons?: string[]
}

export interface StudioMessagePayload {
  accountId: string
  role: 'user' | 'assistant'
  content: string
  evidenceIds?: string[]
  personaIdSnapshot?: string
  requestId?: string
}

function empty(): StoreFile {
  return { version: MATRIX_STORE_VERSION, accounts: [], personas: [], drafts: [], publishedNotes: [], metricSnapshots: [], viralItems: [], studioMessages: [], pendingOwnership: [], settings: defaultMatrixSettings() }
}

function nextId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** MatrixStore 构造选项：时钟与原子写 rename 注入（用于 v3→v4 故障恢复测试）。 */
export interface MatrixStoreOptions {
  /** 备份时间戳时钟（测试注入固定时间）。 */
  now?: () => Date
  /** 覆盖原子写 rename（故障注入：写入 v4 失败）。 */
  rename?: (from: string, to: string) => void
}

/**
 * 持久化存储：整个 StoreFile 一个文件，写操作后整体原子落盘。
 * @param filePath - 存储文件路径（测试注入临时路径）。
 * @param options - 可选注入项（时钟 / rename）。
 */
export class MatrixStore {
  private readonly options: MatrixStoreOptions
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
    if (account === undefined) throw new MatrixStoreError('账号不存在：' + accountId)
    return account
  }
  
  private requirePersona(personaId: string): Persona {
    const persona = this.data.personas.find(item => item.id === personaId)
    if (persona === undefined) throw new MatrixStoreError('人设不存在：' + personaId)
    return persona
  }
  
  private requirePersonaNote(personaId: string, noteId: string): PublishedNote {
    this.requirePersona(personaId)
    const note = this.data.publishedNotes.find(item => item.id === noteId && item.personaId === personaId)
    if (note === undefined) throw new MatrixStoreError('已发布笔记不存在或不属于该人设：' + noteId)
    return note
  }
  
  private requireNoteById(noteId: string): PublishedNote {
    const note = this.data.publishedNotes.find(item => item.id === noteId)
    if (note === undefined) throw new MatrixStoreError('已发布笔记不存在：' + noteId)
    return note
  }
  
  private requirePersonaViral(personaId: string, itemId: string): ViralItem {
    this.requirePersona(personaId)
    const item = this.data.viralItems.find(i => i.id === itemId && i.personaId === personaId)
    if (item === undefined) throw new MatrixStoreError('爆款条目不存在或不属于该人设：' + itemId)
    return item
  }
  
  /** 校验 note weight 是否合法 0-5 整数。 */
  private static checkWeight(weight: number): void {
    if (!Number.isInteger(weight) || weight < 0 || weight > 5) throw new MatrixStoreError('权重必须是 0-5 的整数')
  }
  
  constructor(filePath: string = matrixStorePath(), options: MatrixStoreOptions = {}) {
    this.filePath = resolve(filePath)
    this.options = options
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
      throw new MatrixStoreError('存储文件损坏，无法解析：' + this.filePath)
    }
    const file = parsed as Partial<StoreFile> | null
    if (typeof file !== 'object' || file === null || typeof file.version !== 'number') {
      throw new MatrixStoreError('存储文件形状非法：' + this.filePath)
    }
    const rawVersion = (file as { version?: number }).version
    if (rawVersion === 1 || rawVersion === 2) {
      this.data = migrateStoreFile(file as unknown as Parameters<typeof migrateStoreFile>[0])
      this.save()
      return this.data
    }
    if (rawVersion === 3) {
      // v3 → v4：先带时间戳备份原 v3，再原子写入 v4；写入失败时原 v3 与备份均可用。
      const migrated = migrateStoreFileV3ToV4(file as unknown as StoreFileV3)
      backupStoreFile(this.filePath, this.options.now)
      atomicWriteStoreFile(this.filePath, migrated, { rename: this.options.rename })
      this.data = migrated
      return this.data
    }
    if (rawVersion !== MATRIX_STORE_VERSION) {
      throw new MatrixStoreError('存储文件 version 不匹配：期望 ' + MATRIX_STORE_VERSION + '，实际 ' + rawVersion)
    }
    const now = new Date().toISOString()
    const accounts = Array.isArray(file.accounts) ? file.accounts as Account[] : []
    const publishedNotes = Array.isArray(file.publishedNotes) ? file.publishedNotes as PublishedNote[] : []
    const viralItems = Array.isArray(file.viralItems) ? file.viralItems as ViralItem[] : []
    const studioMessages = Array.isArray(file.studioMessages) ? file.studioMessages as StudioMessage[] : []
    const fileSettings = (file.settings ?? {}) as Partial<MatrixSettings>
    const fileApify = (fileSettings.apify ?? {}) as Partial<MatrixSettings['apify']>
    const defaults = defaultMatrixSettings()
    this.data = {
      version: MATRIX_STORE_VERSION,
      accounts: accounts.map(account => ({ ...account, connection: account.connection ?? { status: 'unbound' }, collection: account.collection ?? { enabled: false, intervalMinutes: 1440, maxItems: 100 }, collectionStatus: account.collectionStatus ?? { running: false, lastStatus: 'idle' } })),
      personas: Array.isArray(file.personas) ? file.personas as Persona[] : [],
      drafts: Array.isArray(file.drafts) ? file.drafts as Draft[] : [],
      publishedNotes: publishedNotes.map(note => ({ ...note, updatedAt: note.updatedAt ?? note.createdAt ?? now })),
      metricSnapshots: Array.isArray(file.metricSnapshots) ? file.metricSnapshots as MetricSnapshot[] : [],
      viralItems: viralItems.map(item => ({ ...item, weight: (item.weight ?? 1) })),
      studioMessages: studioMessages.map(message => ({ ...message, read: message.read ?? false })),
      pendingOwnership: Array.isArray(file.pendingOwnership) ? file.pendingOwnership as PendingOwnership[] : [],
      settings: { apify: { actorId: typeof fileApify.actorId === 'string' ? fileApify.actorId : defaults.apify.actorId, apiToken: typeof fileApify.apiToken === 'string' ? fileApify.apiToken : defaults.apify.apiToken, maxItems: typeof fileApify.maxItems === 'number' ? fileApify.maxItems : defaults.apify.maxItems, requestTimeoutMs: typeof fileApify.requestTimeoutMs === 'number' ? fileApify.requestTimeoutMs : defaults.apify.requestTimeoutMs, maxPolls: typeof fileApify.maxPolls === 'number' ? fileApify.maxPolls : defaults.apify.maxPolls } },
    }
    return this.data
  }
  
  /** 原子落盘（tmp-<pid>-<random> + rename；失败时清理临时文件并抛出）。 */
  save(): void {
    atomicWriteStoreFile(this.filePath, this.data, { rename: this.options.rename })
  }

  // ---------------------------------------------------------------- 爆款池
  listViralItems(personaId?: string, status?: ViralStatus, batchId?: string): ViralItem[] {
    let items = this.data.viralItems
    if (personaId !== undefined) items = items.filter(i => i.personaId === personaId)
    if (status !== undefined) items = items.filter(i => i.status === status)
    // 历史条目（无 batchId）归入 legacy 批次，与 listViralBatches 分组规则一致。
    if (batchId !== undefined) items = items.filter(i => (i.batchId ?? 'legacy') === batchId)
    return items
  }
  
  listViralBatches(personaId: string, sourceAccountId?: string): ViralBatch[] {
    this.requirePersona(personaId)
    const byBatch = new Map<string, ViralItem[]>()
    for (const item of this.data.viralItems.filter(i => i.personaId === personaId)) {
      const key = item.batchId ?? 'legacy'
      const list = byBatch.get(key)
      if (list === undefined) byBatch.set(key, [item])
      else list.push(item)
    }
    return [...byBatch.entries()].map(([batchId, items]) => ({ id: batchId, personaId, sourceAccountId, collectedAt: items.map(i => i.collectedAt).sort()[0] ?? new Date().toISOString(), itemCount: items.length } satisfies ViralBatch)).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))
  }
  
  deleteViralBatch(personaId: string, batchId: string): number {
    this.requirePersona(personaId)
    const before = this.data.viralItems.length
    this.data.viralItems = this.data.viralItems.filter(i => !(i.personaId === personaId && (i.batchId ?? 'legacy') === batchId))
    const removed = before - this.data.viralItems.length
    if (removed > 0) this.save()
    return removed
  }
  
  saveViralItem(payload: ViralItemPayload): ViralItem {
    this.requirePersona(payload.personaId)
    const item: ViralItem = { id: nextId(), ...payload, status: payload.status ?? 'pending', weight: 1, collectedAt: new Date().toISOString() }
    this.data.viralItems.push(item)
    this.save()
    return item
  }
  
  addManualViral(personaId: string, payload: ManualViralPayload): ViralItem {
    this.requirePersona(personaId)
    const item: ViralItem = { id: nextId(), personaId, title: payload.title, body: payload.body, sourceUrl: payload.sourceUrl, source: 'manual', status: 'accepted', weight: 5, score: 0, reasons: payload.reasons ?? ['手动新增'], publishedAt: payload.publishedAt, collectedAt: new Date().toISOString() }
    this.data.viralItems.push(item)
    this.save()
    return item
  }
  
  reviewViralItem(personaId: string, itemId: string, status: 'accepted' | 'ignored'): ViralItem {
    const item = this.requirePersonaViral(personaId, itemId)
    item.status = status
    this.save()
    return item
  }
  
  updateViralItem(personaId: string, itemId: string, patch: { title?: string; body?: string; score?: number; reasons?: string[] }): ViralItem {
    const item = this.requirePersonaViral(personaId, itemId)
    if (patch.title !== undefined) item.title = patch.title
    if (patch.body !== undefined) item.body = patch.body
    if (patch.score !== undefined) item.score = patch.score
    if (patch.reasons !== undefined) item.reasons = patch.reasons
    this.save()
    return item
  }
  
  setViralWeight(personaId: string, itemId: string, weight: number): ViralItem {
    MatrixStore.checkWeight(weight)
    const item = this.requirePersonaViral(personaId, itemId)
    item.weight = weight as NoteWeight
    this.save()
    return item
  }
  
  transferViralItems(personaId: string, itemIds: string[], targetPersonaId: string): ViralItem[] {
    this.requirePersona(personaId)
    this.requirePersona(targetPersonaId)
    const moved: ViralItem[] = []
    for (const item of this.data.viralItems) {
      if (item.personaId === personaId && itemIds.includes(item.id)) {
        item.personaId = targetPersonaId
        moved.push(item)
      }
    }
    if (moved.length > 0) this.save()
    return moved
  }

  // ---------------------------------------------------------------- 待归属数据
  stashPendingOwnership(input: {
    kind: 'published-note'
    payload: Omit<PublishedNote, 'personaId'>
    sourceAccountId?: string
    sourceAccountName?: string
    reason: string
  } | {
    kind: 'viral-item'
    payload: Omit<ViralItem, 'personaId'>
    sourceAccountId?: string
    sourceAccountName?: string
    reason: string
  }): PendingOwnership {
    const base = { id: nextId(), sourceAccountId: input.sourceAccountId, sourceAccountName: input.sourceAccountName, reason: input.reason, migratedAt: new Date().toISOString() }
    const entry: PendingOwnership = input.kind === 'published-note'
      ? { ...base, kind: 'published-note' as const, payload: input.payload }
      : { ...base, kind: 'viral-item' as const, payload: input.payload }
    this.data.pendingOwnership.push(entry)
    this.save()
    return entry
  }
  
  listPendingOwnership(): PendingOwnership[] {
    return this.data.pendingOwnership
  }
  
  assignPendingOwnership(id: string, targetPersonaId: string): PublishedNote | ViralItem {
    const index = this.data.pendingOwnership.findIndex(entry => entry.id === id)
    if (index < 0) throw new MatrixStoreError('待归属记录不存在：' + id)
    this.requirePersona(targetPersonaId)
    const entry = this.data.pendingOwnership[index]
    const now = new Date().toISOString()
    if (entry.kind === 'published-note') {
      const note: PublishedNote = { ...entry.payload, personaId: targetPersonaId, updatedAt: entry.payload.updatedAt ?? now }
      this.data.publishedNotes.push(note)
      this.data.pendingOwnership.splice(index, 1)
      this.save()
      return note
    }
    const item: ViralItem = { ...entry.payload, personaId: targetPersonaId }
    this.data.viralItems.push(item)
    this.data.pendingOwnership.splice(index, 1)
    this.save()
    return item
  }

  // ---------------------------------------------------------------- 运行时设置
  getSettings(): MatrixSettings {
    return this.data.settings
  }
  
  updateApifySettings(payload: Partial<MatrixSettings['apify']>): MatrixSettings {
    this.data.settings = { ...this.data.settings, apify: { ...this.data.settings.apify, ...payload } }
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
      if (existing === undefined) throw new MatrixStoreError('账号不存在：' + id)
      existing.name = payload.name
      existing.personaId = payload.personaId
      existing.enabled = payload.enabled
      this.save()
      return existing
    }
    const account: Account = { id: nextId(), ...payload, createdAt: new Date().toISOString(), connection: { status: 'unbound' }, collection: { enabled: false, intervalMinutes: 1440, maxItems: 100 }, collectionStatus: { running: false, lastStatus: 'idle' } }
    this.data.accounts.push(account)
    this.save()
    return account
  }
  deleteAccount(id: string): void {
    this.data.accounts = this.data.accounts.filter(a => a.id !== id)
    this.data.studioMessages = this.data.studioMessages.filter(m => m.accountId !== id)
    this.data.drafts = this.data.drafts.filter(d => d.accountId !== id)
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
      if (existing === undefined) throw new MatrixStoreError('人设不存在：' + id)
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
      existing.writingStyles = payload.writingStyles
      existing.endingHookConstraints = payload.endingHookConstraints
      existing.endingHookExamples = payload.endingHookExamples
      existing.forbiddenWords = payload.forbiddenWords
      this.save()
      return existing
    }
    const persona: Persona = { id: nextId(), name: payload.name, prompt: payload.prompt, toneTags: payload.toneTags, positioning: payload.positioning, audience: payload.audience, expertise: payload.expertise, contentDirections: payload.contentDirections, hookStyles: payload.hookStyles, bodyStructure: payload.bodyStructure, endingStyle: payload.endingStyle, forbiddenExpressions: payload.forbiddenExpressions, topicCriteria: payload.topicCriteria, defaultHashtags: payload.defaultHashtags, writingStyles: payload.writingStyles, endingHookConstraints: payload.endingHookConstraints, endingHookExamples: payload.endingHookExamples, forbiddenWords: payload.forbiddenWords, createdAt: new Date().toISOString() }
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
  personaInUse(personaId: string): { accountCount: number; noteCount: number; viralCount: number } {
    return { accountCount: this.data.accounts.filter(a => a.personaId === personaId).length, noteCount: this.data.publishedNotes.filter(n => n.personaId === personaId).length, viralCount: this.data.viralItems.filter(i => i.personaId === personaId).length }
  }

  // ---------------------------------------------------------------- 草稿
  listDrafts(accountId?: string): Draft[] {
    return accountId === undefined ? this.data.drafts : this.data.drafts.filter(d => d.accountId === accountId)
  }
  findDraft(accountId: string, date: string): Draft | undefined {
    return this.data.drafts.find(d => d.accountId === accountId && d.date === date)
  }
  saveDraft(payload: DraftPayload): Draft {
    const draft: Draft = { id: nextId(), ...payload, tags: payload.tags ?? extractHashtags(payload.copy), status: 'generated', createdAt: new Date().toISOString() }
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
    if (draft === undefined) throw new MatrixStoreError('草稿不存在：' + id)
    draft.status = status
    if (metrics !== undefined) draft.metrics = metrics
    this.save()
    return draft
  }
  updateDraft(id: string, payload: { copy?: string; coverPrompt?: string; tags?: string }): Draft {
    const draft = this.data.drafts.find(d => d.id === id)
    if (draft === undefined) throw new MatrixStoreError('草稿不存在：' + id)
    if (payload.copy !== undefined) draft.copy = payload.copy
    if (payload.coverPrompt !== undefined) draft.coverPrompt = payload.coverPrompt
    if (payload.tags !== undefined) draft.tags = payload.tags
    else if (draft.tags === undefined || draft.tags === '') draft.tags = extractHashtags(draft.copy)
    draft.updatedAt = new Date().toISOString()
    this.save()
    return draft
  }

  // ---------------------------------------------------------------- 已发布笔记
  listPublishedNotes(personaId?: string): PublishedNote[] {
    return personaId === undefined ? this.data.publishedNotes : this.data.publishedNotes.filter(note => note.personaId === personaId)
  }
  savePublishedNote(payload: PublishedNotePayload): PublishedNote {
    this.requirePersona(payload.personaId)
    const now = new Date().toISOString()
    const note: PublishedNote = { id: nextId(), ...payload, sourceAccountName: payload.sourceAccountName ?? (payload.sourceAccountId !== undefined ? this.data.accounts.find(a => a.id === payload.sourceAccountId)?.name : undefined), createdAt: now, updatedAt: payload.updatedAt ?? now }
    this.data.publishedNotes.push(note)
    this.save()
    return note
  }
  importPublishedNotes(personaId: string, payloads: PublishedNotePayload[]): PublishedNote[] {
    this.requirePersona(personaId)
    const now = new Date().toISOString()
    const existingUrls = new Set(this.data.publishedNotes.filter(note => note.personaId === personaId).map(note => note.sourceUrl).filter((url): url is string => url !== undefined))
    const batchUrls = new Set<string>()
    const created = payloads.filter((payload) => {
      if (payload.sourceUrl === undefined) return true
      if (existingUrls.has(payload.sourceUrl) || batchUrls.has(payload.sourceUrl)) return false
      batchUrls.add(payload.sourceUrl)
      return true
    }).map(payload => ({ id: nextId(), personaId, sourceAccountId: payload.sourceAccountId, sourceAccountName: payload.sourceAccountName ?? (payload.sourceAccountId !== undefined ? this.data.accounts.find(a => a.id === payload.sourceAccountId)?.name : undefined), title: payload.title, copy: payload.copy, topic: payload.topic, contentType: payload.contentType, sourceUrl: payload.sourceUrl, publishedAt: payload.publishedAt, source: payload.source, weight: payload.weight, createdAt: now, updatedAt: payload.updatedAt ?? now }))
    this.data.publishedNotes.push(...created)
    if (created.length > 0) this.save()
    return created
  }
  deletePublishedNote(id: string): void {
    this.data.publishedNotes = this.data.publishedNotes.filter(n => n.id !== id)
    this.save()
  }
  setNoteWeight(personaId: string, noteId: string, weight: number): PublishedNote {
    MatrixStore.checkWeight(weight)
    const note = this.requirePersonaNote(personaId, noteId)
    note.weight = weight as NoteWeight
    note.updatedAt = new Date().toISOString()
    this.save()
    return note
  }
  transferNotes(personaId: string, noteIds: string[], targetPersonaId: string): PublishedNote[] {
    this.requirePersona(personaId)
    this.requirePersona(targetPersonaId)
    const moved: PublishedNote[] = []
    for (const note of this.data.publishedNotes) {
      if (note.personaId === personaId && noteIds.includes(note.id)) {
        note.personaId = targetPersonaId
        note.updatedAt = new Date().toISOString()
        moved.push(note)
      }
    }
    if (moved.length > 0) this.save()
    return moved
  }

  // ---------------------------------------------------------------- 指标快照
  listMetricSnapshots(accountId?: string, noteId?: string): MetricSnapshot[] {
    return this.data.metricSnapshots.filter(snapshot => (accountId === undefined || snapshot.accountId === accountId) && (noteId === undefined || snapshot.noteId === noteId))
  }
  listMetricSnapshotsByNote(noteId: string): MetricSnapshot[] {
    return this.data.metricSnapshots.filter(snapshot => snapshot.noteId === noteId)
  }
  saveMetricSnapshot(payload: MetricSnapshotPayload): MetricSnapshot {
    this.requireNoteById(payload.noteId)
    const snapshot: MetricSnapshot = { id: nextId(), accountId: payload.accountId, noteId: payload.noteId, accountNameSnapshot: payload.accountNameSnapshot ?? this.data.accounts.find(a => a.id === payload.accountId)?.name, reads: payload.reads, likes: payload.likes, favorites: payload.favorites, comments: payload.comments, shares: payload.shares, source: payload.source, status: payload.status, error: payload.error, collectedAt: new Date().toISOString() }
    this.data.metricSnapshots.push(snapshot)
    this.save()
    return snapshot
  }

  // ---------------------------------------------------------------- 创作室消息
  listStudioMessages(accountId?: string, personaIdSnapshot?: string): StudioMessage[] {
    let messages = this.data.studioMessages
    if (accountId !== undefined) messages = messages.filter(message => message.accountId === accountId)
    if (personaIdSnapshot !== undefined) messages = messages.filter(message => message.personaIdSnapshot === personaIdSnapshot)
    return messages
  }
  /** 按请求 id 查询已落库的会话消息（同一 account 下的完成态幂等判定）。 */
  listStudioMessagesByRequestId(accountId: string, requestId: string): StudioMessage[] {
    return this.data.studioMessages.filter(message => message.accountId === accountId && message.requestId === requestId)
  }
  saveStudioMessage(payload: StudioMessagePayload): StudioMessage {
    this.requireAccount(payload.accountId)
    const message: StudioMessage = { id: nextId(), accountId: payload.accountId, role: payload.role, content: payload.content, evidenceIds: payload.evidenceIds, personaIdSnapshot: payload.personaIdSnapshot, requestId: payload.requestId, receivedAt: new Date().toISOString(), read: false }
    this.data.studioMessages.push(message)
    this.save()
    return message
  }
  markStudioMessageRead(id: string): void {
    const message = this.data.studioMessages.find(m => m.id === id)
    if (message === undefined) throw new MatrixStoreError('创作室消息不存在：' + id)
    message.read = true
    this.save()
  }
}
