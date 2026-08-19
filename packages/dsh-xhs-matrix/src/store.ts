/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type {
  Account, Draft, DraftMetrics, DraftStatus, NegativeTopic, Persona, StoreFile, Topic,
} from './types.ts'

/** 存储文件格式版本。 */
export const MATRIX_STORE_VERSION = 1

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
export interface PersonaPayload { name: string; prompt: string; toneTags?: string[] }
export interface NegativePayload { accountId?: string; keyword: string; reason: string }
export interface DraftPayload { accountId: string; topicId: string; date: string; copy: string; coverPrompt: string }

function empty(): StoreFile {
  return { version: MATRIX_STORE_VERSION, accounts: [], personas: [], topics: [], negatives: [], drafts: [] }
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

  static validateNegativePayload(payload: unknown): string | undefined {
    const p = payload as Partial<NegativePayload> | null
    if (typeof p !== 'object' || p === null) return 'body 必须是 JSON 对象'
    if (typeof p.keyword !== 'string' || p.keyword.trim() === '') return '黑名单关键词必填'
    if (typeof p.reason !== 'string' || p.reason.trim() === '') return '黑名单原因必填'
    if (p.accountId !== undefined && typeof p.accountId !== 'string') return 'accountId 必须是字符串'
    return undefined
  }

  private readonly filePath: string
  private data: StoreFile

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
    if (file.version !== MATRIX_STORE_VERSION) {
      throw new MatrixStoreError(`存储文件 version 不匹配：期望 ${MATRIX_STORE_VERSION}，实际 ${file.version}`)
    }
    this.data = {
      version: MATRIX_STORE_VERSION,
      accounts: Array.isArray(file.accounts) ? file.accounts as Account[] : [],
      personas: Array.isArray(file.personas) ? file.personas as Persona[] : [],
      topics: Array.isArray(file.topics) ? file.topics as Topic[] : [],
      negatives: Array.isArray(file.negatives) ? file.negatives as NegativeTopic[] : [],
      drafts: Array.isArray(file.drafts) ? file.drafts as Draft[] : [],
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
    const account: Account = { id: nextId(), ...payload, createdAt: new Date().toISOString() }
    this.data.accounts.push(account)
    this.save()
    return account
  }
  deleteAccount(id: string): void {
    this.data.accounts = this.data.accounts.filter(a => a.id !== id)
    this.save()
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
      this.save()
      return existing
    }
    const persona: Persona = { id: nextId(), name: payload.name, prompt: payload.prompt, toneTags: payload.toneTags, createdAt: new Date().toISOString() }
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

  // ---------------------------------------------------------------- 选题
  listTopics(): Topic[] { return this.data.topics }
  addTopics(titles: string[]): Topic[] {
    const created: Topic[] = []
    for (const title of titles) {
      const trimmed = title.trim()
      if (trimmed === '') continue
      const topic: Topic = { id: nextId(), title: trimmed, source: 'manual', status: 'open', createdAt: new Date().toISOString() }
      this.data.topics.push(topic)
      created.push(topic)
    }
    this.save()
    return created
  }
  retireTopic(id: string): void {
    const topic = this.data.topics.find(t => t.id === id)
    if (topic === undefined) throw new MatrixStoreError(`选题不存在：${id}`)
    topic.status = 'retired'
    this.save()
  }
  markTopicUsed(id: string, draftId: string): void {
    const topic = this.data.topics.find(t => t.id === id)
    if (topic === undefined) throw new MatrixStoreError(`选题不存在：${id}`)
    topic.status = 'used'
    topic.usedByDraftId = draftId
    this.save()
  }

  // ---------------------------------------------------------------- 黑名单
  listNegatives(): NegativeTopic[] { return this.data.negatives }
  addNegative(payload: NegativePayload): NegativeTopic {
    const error = MatrixStore.validateNegativePayload(payload)
    if (error !== undefined) throw new MatrixStoreError(error)
    const negative: NegativeTopic = { id: nextId(), accountId: payload.accountId, keyword: payload.keyword, reason: payload.reason, createdAt: new Date().toISOString() }
    this.data.negatives.push(negative)
    this.save()
    return negative
  }
  deleteNegative(id: string): void {
    this.data.negatives = this.data.negatives.filter(n => n.id !== id)
    this.save()
  }

  // ---------------------------------------------------------------- 草稿
  listDrafts(): Draft[] { return this.data.drafts }
  findDraft(accountId: string, date: string, topicId: string): Draft | undefined {
    return this.data.drafts.find(d => d.accountId === accountId && d.date === date && d.topicId === topicId)
  }
  saveDraft(payload: DraftPayload): Draft {
    const draft: Draft = { id: nextId(), ...payload, status: 'generated', createdAt: new Date().toISOString() }
    this.data.drafts.push(draft)
    this.save()
    return draft
  }
  setDraftStatus(id: string, status: DraftStatus, metrics?: DraftMetrics): Draft {
    const draft = this.data.drafts.find(d => d.id === id)
    if (draft === undefined) throw new MatrixStoreError(`草稿不存在：${id}`)
    draft.status = status
    if (metrics !== undefined) draft.metrics = metrics
    this.save()
    return draft
  }
}
