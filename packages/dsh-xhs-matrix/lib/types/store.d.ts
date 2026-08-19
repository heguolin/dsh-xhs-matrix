/** 私有 JSON 文件存储（~/.dsh/dsh-xhs-matrix.json），原子写 + 格式版本。 */
import type { Account, Draft, DraftMetrics, DraftStatus, NegativeTopic, Persona, StoreFile, Topic } from './types.ts';
/** 存储文件格式版本。 */
export declare const MATRIX_STORE_VERSION = 1;
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
}
export interface NegativePayload {
    accountId?: string;
    keyword: string;
    reason: string;
}
export interface DraftPayload {
    accountId: string;
    topicId: string;
    date: string;
    copy: string;
    coverPrompt: string;
}
/**
 * 持久化存储：整个 StoreFile 一个文件，写操作后整体原子落盘。
 * @param filePath - 存储文件路径（测试注入临时路径）。
 */
export declare class MatrixStore {
    static validateAccountPayload(payload: unknown): string | undefined;
    static validatePersonaPayload(payload: unknown): string | undefined;
    static validateNegativePayload(payload: unknown): string | undefined;
    private readonly filePath;
    private data;
    constructor(filePath?: string);
    /** 读取并校验存储文件；缺失则返回空结构。 */
    load(): StoreFile;
    /** 原子落盘（tmp + rename）。 */
    save(): void;
    listAccounts(): Account[];
    upsertAccount(payload: AccountPayload, id?: string): Account;
    deleteAccount(id: string): void;
    listPersonas(): Persona[];
    upsertPersona(payload: PersonaPayload, id?: string): Persona;
    deletePersona(id: string): void;
    listTopics(): Topic[];
    addTopics(titles: string[]): Topic[];
    retireTopic(id: string): void;
    markTopicUsed(id: string, draftId: string): void;
    listNegatives(): NegativeTopic[];
    addNegative(payload: NegativePayload): NegativeTopic;
    deleteNegative(id: string): void;
    listDrafts(): Draft[];
    findDraft(accountId: string, date: string, topicId: string): Draft | undefined;
    saveDraft(payload: DraftPayload): Draft;
    deleteDraft(id: string): void;
    setDraftStatus(id: string, status: DraftStatus, metrics?: DraftMetrics): Draft;
}
