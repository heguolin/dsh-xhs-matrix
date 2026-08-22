/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */
import type { Account, CollectionConfig, CollectionStatus, Draft, DraftMetrics, DraftQualityReport, DraftStatus, MatrixSettings, MetricSnapshot, NoteWeight, PendingOwnership, Persona, PublishedNote, StoreFile, StudioMessage, ViralBatch, ViralItem, ViralStatus } from './types.ts';
/** 存储文件格式版本。 */
export declare const MATRIX_STORE_VERSION = 4;
/** 存储文件默认位置。 */
export declare function matrixStorePath(): string;
/** 存储错误：介质损坏 / version 不匹配 / 校验失败。 */
export declare class MatrixStoreError extends Error {
    constructor(message: string);
}
/** 写接口的载荷形状（不含 id/createdAt）。 */
export interface AccountPayload {
    name: string;
    personaId: string;
    enabled: boolean;
}
export interface PersonaPayload {
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
    writingStyles?: string[];
    endingHookConstraints?: string;
    endingHookExamples?: string[];
    forbiddenWords?: string[];
}
/** 从文案中提取话题标签（#开头，去重，空格分隔）；无标签返回 undefined。 */
export declare function extractHashtags(text: string): string | undefined;
export interface DraftPayload {
    accountId: string;
    date: string;
    copy: string;
    coverPrompt: string;
    tags?: string;
    personaIdSnapshot?: string;
    qualityReport?: DraftQualityReport;
}
export interface PublishedNotePayload {
    personaId: string;
    sourceAccountId?: string;
    sourceAccountName?: string;
    title: string;
    copy: string;
    topic?: string;
    contentType?: string;
    sourceUrl?: string;
    publishedAt: string;
    source: import('./types.ts').DataSource;
    weight: NoteWeight;
    updatedAt?: string;
}
export interface MetricSnapshotPayload {
    noteId: string;
    accountId: string;
    accountNameSnapshot?: string;
    reads: number;
    likes: number;
    favorites: number;
    comments: number;
    shares?: number;
    source: import('./types.ts').DataSource;
    status: 'success' | 'failed';
    error?: string;
}
export interface ViralItemPayload {
    personaId: string;
    sourceAccountId?: string;
    sourceAccountName?: string;
    title: string;
    body: string;
    sourceUrl?: string;
    source: 'apify' | 'manual' | 'import';
    score: number;
    reasons: string[];
    publishedAt?: string;
    status?: ViralStatus;
    batchId?: string;
}
/** 手动新增爆款载荷：标题 + 正文必填；来源链接与发布时间可选。 */
export interface ManualViralPayload {
    title: string;
    body: string;
    sourceUrl?: string;
    publishedAt?: string;
    reasons?: string[];
}
export interface StudioMessagePayload {
    accountId: string;
    role: 'user' | 'assistant';
    content: string;
    evidenceIds?: string[];
    personaIdSnapshot?: string;
    requestId?: string;
}
/** MatrixStore 构造选项：时钟与原子写 rename 注入（用于 v3→v4 故障恢复测试）。 */
export interface MatrixStoreOptions {
    /** 备份时间戳时钟（测试注入固定时间）。 */
    now?: () => Date;
    /** 覆盖原子写 rename（故障注入：写入 v4 失败）。 */
    rename?: (from: string, to: string) => void;
}
/**
 * 持久化存储：整个 StoreFile 一个文件，写操作后整体原子落盘。
 * @param filePath - 存储文件路径（测试注入临时路径）。
 * @param options - 可选注入项（时钟 / rename）。
 */
export declare class MatrixStore {
    private readonly options;
    static validateAccountPayload(payload: unknown): string | undefined;
    static validatePersonaPayload(payload: unknown): string | undefined;
    private readonly filePath;
    private data;
    private requireAccount;
    private requirePersona;
    private requirePersonaNote;
    private requireNoteById;
    private requirePersonaViral;
    /** 校验 note weight 是否合法 0-5 整数。 */
    private static checkWeight;
    constructor(filePath?: string, options?: MatrixStoreOptions);
    /** 读取并校验存储文件；缺失则返回空结构。 */
    load(): StoreFile;
    /** 原子落盘（tmp-<pid>-<random> + rename；失败时清理临时文件并抛出）。 */
    save(): void;
    listViralItems(personaId?: string, status?: ViralStatus, batchId?: string): ViralItem[];
    listViralBatches(personaId: string, sourceAccountId?: string): ViralBatch[];
    deleteViralBatch(personaId: string, batchId: string): number;
    saveViralItem(payload: ViralItemPayload): ViralItem;
    addManualViral(personaId: string, payload: ManualViralPayload): ViralItem;
    reviewViralItem(personaId: string, itemId: string, status: 'accepted' | 'ignored'): ViralItem;
    updateViralItem(personaId: string, itemId: string, patch: {
        title?: string;
        body?: string;
        score?: number;
        reasons?: string[];
    }): ViralItem;
    setViralWeight(personaId: string, itemId: string, weight: number): ViralItem;
    transferViralItems(personaId: string, itemIds: string[], targetPersonaId: string): ViralItem[];
    stashPendingOwnership(input: {
        kind: 'published-note';
        payload: Omit<PublishedNote, 'personaId'>;
        sourceAccountId?: string;
        sourceAccountName?: string;
        reason: string;
    } | {
        kind: 'viral-item';
        payload: Omit<ViralItem, 'personaId'>;
        sourceAccountId?: string;
        sourceAccountName?: string;
        reason: string;
    }): PendingOwnership;
    listPendingOwnership(): PendingOwnership[];
    assignPendingOwnership(id: string, targetPersonaId: string): PublishedNote | ViralItem;
    getSettings(): MatrixSettings;
    updateApifySettings(payload: Partial<MatrixSettings['apify']>): MatrixSettings;
    listAccounts(): Account[];
    upsertAccount(payload: AccountPayload, id?: string): Account;
    deleteAccount(id: string): void;
    updateAccountConnection(id: string, connection: Account['connection']): Account;
    updateCollectionConfig(id: string, collection: CollectionConfig): Account;
    updateCollectionStatus(id: string, status: CollectionStatus): Account;
    listPersonas(): Persona[];
    upsertPersona(payload: PersonaPayload, id?: string): Persona;
    deletePersona(id: string): void;
    personaInUse(personaId: string): {
        accountCount: number;
        noteCount: number;
        viralCount: number;
    };
    listDrafts(accountId?: string): Draft[];
    findDraft(accountId: string, date: string): Draft | undefined;
    saveDraft(payload: DraftPayload): Draft;
    deleteDraft(id: string): void;
    setDraftStatus(id: string, status: DraftStatus, metrics?: DraftMetrics): Draft;
    updateDraft(id: string, payload: {
        copy?: string;
        coverPrompt?: string;
        tags?: string;
    }): Draft;
    listPublishedNotes(personaId?: string): PublishedNote[];
    savePublishedNote(payload: PublishedNotePayload): PublishedNote;
    importPublishedNotes(personaId: string, payloads: PublishedNotePayload[]): PublishedNote[];
    deletePublishedNote(id: string): void;
    setNoteWeight(personaId: string, noteId: string, weight: number): PublishedNote;
    transferNotes(personaId: string, noteIds: string[], targetPersonaId: string): PublishedNote[];
    listMetricSnapshots(accountId?: string, noteId?: string): MetricSnapshot[];
    listMetricSnapshotsByNote(noteId: string): MetricSnapshot[];
    saveMetricSnapshot(payload: MetricSnapshotPayload): MetricSnapshot;
    listStudioMessages(accountId?: string, personaIdSnapshot?: string): StudioMessage[];
    /** 按请求 id 查询已落库的会话消息（同一 account 下的完成态幂等判定）。 */
    listStudioMessagesByRequestId(accountId: string, requestId: string): StudioMessage[];
    saveStudioMessage(payload: StudioMessagePayload): StudioMessage;
    markStudioMessageRead(id: string): void;
}
