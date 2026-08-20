/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */
import type { Account, CollectionConfig, CollectionStatus, Draft, DraftMetrics, DraftStatus, MatrixSettings, MetricSnapshot, NoteWeight, Persona, PublishedNote, StoreFile, StudioMessage, ViralBatch, ViralItem, ViralStatus } from './types.ts';
/** 存储文件格式版本。 */
export declare const MATRIX_STORE_VERSION = 3;
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
}
/** 从文案中提取话题标签（#开头，去重，空格分隔）；无标签返回 undefined。 */
export declare function extractHashtags(text: string): string | undefined;
export interface DraftPayload {
    accountId: string;
    date: string;
    copy: string;
    coverPrompt: string;
    tags?: string;
}
export interface PublishedNotePayload {
    accountId: string;
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
    accountId: string;
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
export interface StudioMessagePayload {
    accountId: string;
    role: 'user' | 'assistant';
    content: string;
    evidenceIds?: string[];
}
/**
 * 持久化存储：整个 StoreFile 一个文件，写操作后整体原子落盘。
 * @param filePath - 存储文件路径（测试注入临时路径）。
 */
export declare class MatrixStore {
    static validateAccountPayload(payload: unknown): string | undefined;
    static validatePersonaPayload(payload: unknown): string | undefined;
    private readonly filePath;
    private data;
    private requireAccount;
    private requirePublishedNote;
    constructor(filePath?: string);
    /** 读取并校验存储文件；缺失则返回空结构。 */
    load(): StoreFile;
    /** 原子落盘（tmp + rename）。 */
    save(): void;
    /** 按账号与审核状态列出爆款池条目；batchId 指定时只返回该批次。 */
    listViralItems(accountId?: string, status?: ViralStatus, batchId?: string): ViralItem[];
    /**
     * 按采集批次分组列出爆款池（每次采集一个批次；历史无 batchId 的归入 legacy）。
     * 批次按最早采集时间倒序（新批次在前）。
     */
    listViralBatches(accountId: string): ViralBatch[];
    /** 删除整个采集批次（该批次全部条目），返回删除条数。 */
    deleteViralBatch(accountId: string, batchId: string): number;
    /** 新增爆款池条目（默认 pending）；账号必须存在。 */
    saveViralItem(payload: ViralItemPayload): ViralItem;
    /** 审核爆款条目为 accepted / ignored；条目必须属于该账号。 */
    reviewViralItem(accountId: string, itemId: string, status: 'accepted' | 'ignored'): ViralItem;
    /** 更新爆款条目的详情字段（采纳后抓回完整正文/标题，或重算评分）。 */
    updateViralItem(accountId: string, itemId: string, patch: {
        title?: string;
        body?: string;
        score?: number;
        reasons?: string[];
    }): ViralItem;
    /** 读取运行时设置（apify 等）。 */
    getSettings(): MatrixSettings;
    /** 更新 Apify 数据源配置并落盘；返回更新后的设置。 */
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
    listDrafts(): Draft[];
    /** v3 草稿独立于选题，去重键为账号 + 日期（无 topicId 残留）。 */
    findDraft(accountId: string, date: string): Draft | undefined;
    saveDraft(payload: DraftPayload): Draft;
    deleteDraft(id: string): void;
    setDraftStatus(id: string, status: DraftStatus, metrics?: DraftMetrics): Draft;
    updateDraft(id: string, payload: {
        copy?: string;
        coverPrompt?: string;
        tags?: string;
    }): Draft;
    listPublishedNotes(accountId?: string): PublishedNote[];
    savePublishedNote(payload: PublishedNotePayload): PublishedNote;
    importPublishedNotes(accountId: string, payloads: PublishedNotePayload[]): PublishedNote[];
    deletePublishedNote(id: string): void;
    setNoteWeight(accountId: string, noteId: string, weight: number): PublishedNote;
    listMetricSnapshots(accountId?: string, noteId?: string): MetricSnapshot[];
    saveMetricSnapshot(payload: MetricSnapshotPayload): MetricSnapshot;
    listStudioMessages(accountId?: string): StudioMessage[];
    saveStudioMessage(payload: StudioMessagePayload): StudioMessage;
    markStudioMessageRead(id: string): void;
}
