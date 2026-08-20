/** 领域类型：只放类型，不放运行时代码。 */

/** 矩阵账号连接状态。 */
export type AccountConnectionStatus = 'unbound' | 'bound' | 'authorized' | 'awaiting-import' | 'failed' | 'expired'

/** 数据采集来源。 */
export type DataSource = 'manual' | 'import' | 'apify' | 'authorized'

/** 账号采集配置。 */
export interface CollectionConfig {
  enabled: boolean
  intervalMinutes: number
  maxItems: number
}

/** 账号级采集运行状态。 */
export interface CollectionStatus {
  running: boolean
  lastStatus: 'success' | 'failed' | 'idle'
  lastSuccessAt?: string
  lastError?: string
}

/** 真实小红书账号连接信息；不保存凭据。 */
export interface AccountConnection {
  profileUrl?: string
  externalId?: string
  status: AccountConnectionStatus
  source?: DataSource
  lastError?: string
  lastSuccessAt?: string
}

/** 矩阵账号。 */
export interface Account {
  id: string
  name: string
  personaId: string
  enabled: boolean
  createdAt: string
  connection: AccountConnection
  collection: CollectionConfig
  collectionStatus: CollectionStatus
}

/** 人设模板。 */
export interface Persona {
  id: string
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
  createdAt: string
}

export type TopicStatus = 'open' | 'used' | 'retired'

/** 选题。 */
export interface Topic {
  id: string
  title: string
  source: 'manual' | 'import'
  status: TopicStatus
  usedByDraftId?: string
  createdAt: string
}

/** 发布笔记的人工知识库权重。 */
export type NoteWeight = 0 | 1 | 2 | 3 | 4 | 5

/** 已发布笔记。 */
export interface PublishedNote {
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
  updatedAt: string
}

/** 已发布笔记指标快照。 */
export interface MetricSnapshot {
  id: string
  noteId: string
  accountId: string
  reads: number
  likes: number
  favorites: number
  comments: number
  shares?: number
  collectedAt: string
  source: DataSource
  status: 'success' | 'failed'
  error?: string
}

/** 外部趋势样本；只保存分析所需字段。 */
export interface TrendSample {
  id: string
  accountId: string
  title: string
  summary?: string
  sourceUrl?: string
  source: 'apify' | 'manual'
  actorId?: string
  publishedAt?: string
  reads?: number
  likes?: number
  favorites?: number
  comments?: number
  keywords?: string[]
  contentType?: string
  collectedAt: string
  status: 'success' | 'failed'
  error?: string
}

/** 创作会话消息。 */
export interface StudioMessage {
  id: string
  accountId: string
  role: 'user' | 'assistant'
  content: string
  evidenceIds?: string[]
  receivedAt: string
  read: boolean
}

/** 草稿生成依据。 */
export interface DraftEvidence {
  persona?: string
  noteIds: string[]
  trendIds: string[]
  reasons: string[]
}

export type DraftStatus = 'generated' | 'published' | 'dropped'

/** 发布后回填的流量指标（兼容现有草稿回填接口）。 */
export interface DraftMetrics {
  reads: number
  likes: number
  comments: number
  collected: string
}

/** 草稿（文案 + 封面提示词）。 */
export interface Draft {
  id: string
  accountId: string
  topicId: string
  date: string
  copy: string
  coverPrompt: string
  tags?: string
  status: DraftStatus
  metrics?: DraftMetrics
  evidence?: DraftEvidence
  createdAt: string
  updatedAt?: string
}

/** 存储文件整体形状。 */
export interface StoreFile {
  version: number
  accounts: Account[]
  personas: Persona[]
  topics: Topic[]
  drafts: Draft[]
  publishedNotes: PublishedNote[]
  metricSnapshots: MetricSnapshot[]
  trendSamples: TrendSample[]
  studioMessages: StudioMessage[]
  /** 插件运行时设置（面板可配置，与 Cordis 配置并存、面板写入优先）。 */
  settings: MatrixSettings
}

/** 矩阵插件运行时设置。 */
export interface MatrixSettings {
  /** Apify 外部趋势数据源配置。 */
  apify: {
    actorId: string
    apiToken: string
    maxItems: number
    requestTimeoutMs: number
    maxPolls: number
  }
}
