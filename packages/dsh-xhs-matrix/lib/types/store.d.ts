/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */
import type { Account, CollectionConfig, CollectionStatus, Draft, DraftMetrics, DraftStatus, MetricSnapshot, NoteWeight, Persona, PublishedNote, StoreFile, StudioMessage, Topic, TrendSample } from './types.ts';
/** 存储文件格式版本。 */
export declare const MATRIX_STORE_VERSION = 2;
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
export interface DraftPayload {
    accountId: string;
    topicId: string;
    date: string;
    copy: string;
    coverPrompt: string;
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
export interface TrendSamplePayload {
    accountId: string;
    title: string;
    summary?: string;
    sourceUrl?: string;
    source: 'apify' | 'manual';
    actorId?: string;
    publishedAt?: string;
    reads?: number;
    likes?: number;
    favorites?: number;
    comments?: number;
    keywords?: string[];
    contentType?: string;
    status: 'success' | 'failed';
    error?: string;
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
    listAccounts(): Account[];
    upsertAccount(payload: AccountPayload, id?: string): Account;
    deleteAccount(id: string): void;
    updateAccountConnection(id: string, connection: Account['connection']): Account;
    updateCollectionConfig(id: string, collection: CollectionConfig): Account;
    updateCollectionStatus(id: string, status: CollectionStatus): Account;
    listPersonas(): Persona[];
    upsertPersona(payload: PersonaPayload, id?: string): Persona;
    deletePersona(id: string): void;
    listTopics(): Topic[];
    addTopics(titles: string[]): Topic[];
    retireTopic(id: string): void;
    markTopicUsed(id: string, draftId: string): void;
    listDrafts(): Draft[];
    findDraft(accountId: string, date: string, topicId: string): Draft | undefined;
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
    listTrendSamples(accountId?: string): TrendSample[];
    saveTrendSample(payload: TrendSamplePayload): TrendSample;
    listStudioMessages(accountId?: string): StudioMessage[];
    saveStudioMessage(payload: StudioMessagePayload): StudioMessage;
    markStudioMessageRead(id: string): void;
}
