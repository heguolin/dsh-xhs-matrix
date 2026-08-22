/** 领域类型：只放类型，不放运行时代码。 */
/** 矩阵账号连接状态。 */
export type AccountConnectionStatus = 'unbound' | 'bound' | 'authorized' | 'awaiting-import' | 'failed' | 'expired';
/** 数据采集来源。 */
export type DataSource = 'manual' | 'import' | 'apify' | 'authorized';
/** 账号采集配置。 */
export interface CollectionConfig {
    enabled: boolean;
    intervalMinutes: number;
    maxItems: number;
}
/** 账号级采集运行状态。 */
export interface CollectionStatus {
    running: boolean;
    lastStatus: 'success' | 'failed' | 'idle';
    lastSuccessAt?: string;
    lastError?: string;
}
/** 真实小红书账号连接信息；不保存凭据。 */
export interface AccountConnection {
    profileUrl?: string;
    externalId?: string;
    status: AccountConnectionStatus;
    source?: DataSource;
    lastError?: string;
    lastSuccessAt?: string;
}
/** 矩阵账号：发布、采集和会话的运营载体。 */
export interface Account {
    id: string;
    name: string;
    personaId: string;
    enabled: boolean;
    createdAt: string;
    connection: AccountConnection;
    collection: CollectionConfig;
    collectionStatus: CollectionStatus;
}
/** 人设模板：可复用内容资产的所有者。 */
export interface Persona {
    id: string;
    name: string;
    prompt: string;
    toneTags?: string[];
    positioning?: string;
    audience?: string;
    expertise?: string;
    contentDirections?: string;
    hookStyles?: string[];
    bodyStructure?: string;
    endingStyle?: string;
    forbiddenExpressions?: string;
    topicCriteria?: string;
    defaultHashtags?: string[];
    /** 自定义写作风格标签（任意增删，不限于固定选项）。 */
    writingStyles?: string[];
    /** 结尾互动钩子自由约束文本。 */
    endingHookConstraints?: string;
    /** 结尾互动钩子最佳案例列表。 */
    endingHookExamples?: string[];
    /** 人设级违禁词来源。 */
    forbiddenWords?: string[];
    createdAt: string;
}
/** 发布笔记的人工知识库权重。 */
export type NoteWeight = 0 | 1 | 2 | 3 | 4 | 5;
/** 已发布笔记：唯一归属人设，来源账号仅用于追踪与指标采集。 */
export interface PublishedNote {
    id: string;
    personaId: string;
    sourceAccountId?: string;
    sourceAccountName?: string;
    title: string;
    copy: string;
    topic?: string;
    contentType?: string;
    sourceUrl?: string;
    publishedAt: string;
    source: DataSource;
    weight: NoteWeight;
    createdAt: string;
    updatedAt: string;
}
/** 已发布笔记指标快照。 */
export interface MetricSnapshot {
    id: string;
    noteId: string;
    accountId: string;
    /** 采集时账号名称快照；账号删除后仍可解释历史数据。 */
    accountNameSnapshot?: string;
    reads: number;
    likes: number;
    favorites: number;
    comments: number;
    shares?: number;
    collectedAt: string;
    source: DataSource;
    status: 'success' | 'failed';
    error?: string;
}
/** 爆款池审核状态。 */
export type ViralStatus = 'pending' | 'accepted' | 'ignored';
/** 爆款池条目：唯一归属人设；weight 为人工权重，score 为机器评分，二者不互相覆盖。 */
export interface ViralItem {
    id: string;
    personaId: string;
    sourceAccountId?: string;
    sourceAccountName?: string;
    title: string;
    body: string;
    sourceUrl?: string;
    source: 'apify' | 'manual' | 'import';
    status: ViralStatus;
    weight: NoteWeight;
    score: number;
    reasons: string[];
    publishedAt?: string;
    collectedAt: string;
    /** 采集批次 id：同一次采集的条目归入同一批次，可整批删除。 */
    batchId?: string;
}
/** 爆款采集批次：以人设分组。 */
export interface ViralBatch {
    id: string;
    personaId: string;
    sourceAccountId?: string;
    query?: string;
    collectedAt: string;
    itemCount: number;
}
/** 创作会话消息。 */
export interface StudioMessage {
    id: string;
    accountId: string;
    role: 'user' | 'assistant';
    content: string;
    evidenceIds?: string[];
    /** 生成该消息时的人设快照；账号换绑后旧会话不混入当前人设上下文。 */
    personaIdSnapshot?: string;
    /** 请求 id：用于流式重试去重，防止重复落库。 */
    requestId?: string;
    receivedAt: string;
    read: boolean;
}
/** 草稿生成依据。 */
export interface DraftEvidence {
    persona?: string;
    noteIds: string[];
    trendIds: string[];
    reasons: string[];
}
export type DraftStatus = 'generated' | 'published' | 'dropped';
/** 发布后回填的流量指标（兼容现有草稿回填接口）。 */
export interface DraftMetrics {
    reads: number;
    likes: number;
    comments: number;
    collected: string;
}
/** 草稿质量报告（审校状态、违禁词命中、检查时间与人设快照）。 */
export interface DraftQualityReport {
    reviewStatus: 'passed' | 'failed' | 'unchecked';
    forbiddenWordHits: Array<{
        word: string;
        position: number;
    }>;
    checkedAt: string;
    personaSnapshot?: string;
}
/** 草稿（文案 + 封面提示词）。 */
export interface Draft {
    id: string;
    accountId: string;
    date: string;
    copy: string;
    coverPrompt: string;
    tags?: string;
    status: DraftStatus;
    metrics?: DraftMetrics;
    evidence?: DraftEvidence;
    /** 生成该草稿时的人设快照。 */
    personaIdSnapshot?: string;
    /** 轻量质检报告。 */
    qualityReport?: DraftQualityReport;
    createdAt: string;
    updatedAt?: string;
}
/** 待归属「已发布笔记」完整载荷（不含 personaId）。 */
export type PendingPublishedNotePayload = Omit<PublishedNote, 'personaId'>;
/** 待归属「爆款条目」完整载荷（不含 personaId）。 */
export type PendingViralItemPayload = Omit<ViralItem, 'personaId'>;
/** 待归属数据：迁移时无法解析人设的内容进入该集合，不进入正常人设资产查询。 */
export type PendingOwnership = {
    id: string;
    kind: 'published-note';
    payload: PendingPublishedNotePayload;
    sourceAccountId?: string;
    sourceAccountName?: string;
    reason: string;
    migratedAt: string;
} | {
    id: string;
    kind: 'viral-item';
    payload: PendingViralItemPayload;
    sourceAccountId?: string;
    sourceAccountName?: string;
    reason: string;
    migratedAt: string;
};
/** 存储文件整体形状。 */
export interface StoreFile {
    version: 4;
    accounts: Account[];
    personas: Persona[];
    drafts: Draft[];
    publishedNotes: PublishedNote[];
    metricSnapshots: MetricSnapshot[];
    viralItems: ViralItem[];
    studioMessages: StudioMessage[];
    pendingOwnership: PendingOwnership[];
    /** 插件运行时设置（面板可配置，与 Cordis 配置并存、面板写入优先）。 */
    settings: MatrixSettings;
}
/** 矩阵插件运行时设置。 */
export interface MatrixSettings {
    /** Apify 爆款采集配置。 */
    apify: {
        actorId: string;
        apiToken: string;
        maxItems: number;
        requestTimeoutMs: number;
        maxPolls: number;
    };
}
