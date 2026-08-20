/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */
import type { DraftMetrics, DraftStatus } from '../types.ts';
import type { AccountPayload, PersonaPayload } from '../store.ts';
/** 携带路由 JSON 错误消息的客户端错误。 */
export declare class XhsApiError extends Error {
    constructor(message: string);
}
/** 面板数据入口。 */
export declare class XhsApi {
    listAccounts(): Promise<Array<{
        id: string;
        name: string;
        personaId: string;
        enabled: boolean;
        createdAt: string;
        connection?: {
            profileUrl?: string;
            externalId?: string;
            status: string;
            source?: string;
            lastError?: string;
            lastSuccessAt?: string;
        };
        collection?: {
            enabled: boolean;
            intervalMinutes: number;
            maxItems: number;
        };
        collectionStatus?: {
            running: boolean;
            lastStatus: string;
            lastSuccessAt?: string;
            lastError?: string;
        };
    }>>;
    createAccount(payload: AccountPayload): Promise<{
        id: string;
    }>;
    updateAccount(id: string, payload: AccountPayload & {
        connection?: {
            profileUrl?: string;
            externalId?: string;
            status?: string;
            source?: string;
        };
    }): Promise<{
        id: string;
    }>;
    deleteAccount(id: string): Promise<void>;
    importPublishedNotes(accountId: string, format: 'csv' | 'json', content: string): Promise<number>;
    listPersonas(): Promise<Array<{
        id: string;
        name: string;
        prompt: string;
        toneTags?: string[];
        createdAt: string;
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
    }>>;
    createPersona(payload: PersonaPayload): Promise<{
        id: string;
    }>;
    updatePersona(id: string, payload: PersonaPayload): Promise<{
        id: string;
    }>;
    deletePersona(id: string): Promise<void>;
    listTopics(): Promise<Array<{
        id: string;
        title: string;
        status: string;
        createdAt: string;
    }>>;
    addTopic(title: string): Promise<void>;
    importTopics(titles: string[]): Promise<number>;
    retireTopic(id: string): Promise<void>;
    listNotes(accountId?: string): Promise<Array<{
        id: string;
        accountId: string;
        title: string;
        copy: string;
        topic?: string;
        contentType?: string;
        sourceUrl?: string;
        publishedAt: string;
        source: string;
        weight: number;
        createdAt: string;
        updatedAt: string;
    }>>;
    setNoteWeight(accountId: string, noteId: string, weight: number): Promise<void>;
    listTrends(accountId: string): Promise<Array<{
        id: string;
        title: string;
        summary?: string;
        sourceUrl?: string;
        likes?: number;
        favorites?: number;
        comments?: number;
        collectedAt: string;
    }>>;
    collectTrends(accountId: string, searchQuery?: string, maxItems?: number): Promise<Array<{
        title: string;
        score: number;
        reasons: string[];
    }>>;
    listMetrics(accountId: string, noteId?: string): Promise<Array<{
        id: string;
        noteId: string;
        reads: number;
        likes: number;
        favorites: number;
        comments: number;
        collectedAt: string;
        source: string;
        status: string;
    }>>;
    getApifyConfig(): Promise<{
        actorId: string;
        apiToken: string;
        maxItems: number;
        requestTimeoutMs: number;
        maxPolls: number;
    }>;
    updateApifyConfig(payload: {
        actorId?: string;
        apiToken?: string;
        maxItems?: number;
        requestTimeoutMs?: number;
        maxPolls?: number;
    }): Promise<{
        actorId: string;
        apiToken: string;
        maxItems: number;
        requestTimeoutMs: number;
        maxPolls: number;
    }>;
    listStudioMessages(accountId: string): Promise<Array<{
        id: string;
        role: string;
        content: string;
        receivedAt: string;
    }>>;
    studioSend(accountId: string, input: string, mode: 'full' | 'creative'): Promise<{
        message: {
            id: string;
            content: string;
        };
        evidence: {
            persona?: string;
            noteIds: string[];
            trendIds: string[];
            reasons: string[];
        };
        warning?: string;
    }>;
    studioSaveDraft(accountId: string, topicId: string, copy: string, coverPrompt: string): Promise<{
        id: string;
    }>;
    listDrafts(): Promise<Array<{
        id: string;
        accountId: string;
        topicId: string;
        date: string;
        copy: string;
        coverPrompt: string;
        status: DraftStatus;
        metrics?: DraftMetrics;
    }>>;
    setDraftStatus(draftId: string, status: 'published' | 'dropped', metrics?: DraftMetrics): Promise<void>;
    updateDraft(draftId: string, payload: {
        copy?: string;
        coverPrompt?: string;
        tags?: string;
    }): Promise<void>;
}
