/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */
import type { DraftMetrics, DraftStatus } from '../types.ts';
import type { AccountPayload, NegativePayload, PersonaPayload } from '../store.ts';
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
    }>>;
    createAccount(payload: AccountPayload): Promise<{
        id: string;
    }>;
    updateAccount(id: string, payload: AccountPayload): Promise<{
        id: string;
    }>;
    deleteAccount(id: string): Promise<void>;
    listPersonas(): Promise<Array<{
        id: string;
        name: string;
        prompt: string;
        toneTags?: string[];
        createdAt: string;
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
    listNegatives(): Promise<Array<{
        id: string;
        accountId?: string;
        keyword: string;
        reason: string;
    }>>;
    addNegative(payload: NegativePayload): Promise<void>;
    deleteNegative(id: string): Promise<void>;
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
}
