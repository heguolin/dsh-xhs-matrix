/** 浏览器侧 API 客户端：面板组件唯一的数据通道（同源 fetch）。 */
import type { StudioSseEvent } from '../studio.ts';
import type { DraftEvidence, DraftMetrics, DraftQualityReport, DraftStatus, NoteWeight, PendingOwnership, PublishedNote, ViralBatch, ViralItem, ViralStatus } from '../types.ts';
import type { AccountPayload, PersonaPayload } from '../store.ts';
/** 携带路由 JSON 错误消息的客户端错误。 */
export declare class XhsApiError extends Error {
    constructor(message: string);
}
/**
 * 人设作用域：公开资产方法以 personaId（string）为主参数；兼容期使用显式
 * `{ accountId }` 对象，避免把裸字符串静默当作账号或人设猜测。
 */
type AssetScope = string | {
    accountId: string;
};
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
    importPublishedNotes(accountId: string, format: 'csv' | 'json', content: string, personaId?: string): Promise<number>;
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
        writingStyles?: string[];
        endingHookConstraints?: string;
        endingHookExamples?: string[];
        forbiddenWords?: string[];
    }>>;
    createPersona(payload: PersonaPayload): Promise<{
        id: string;
    }>;
    updatePersona(id: string, payload: PersonaPayload): Promise<{
        id: string;
    }>;
    deletePersona(id: string): Promise<void>;
    private scopeParams;
    /** 按人设与审核状态列出爆款池条目（所有批次拍平）。 */
    listViralItems(scope: AssetScope, status?: ViralStatus): Promise<ViralItem[]>;
    /** 按采集批次列出爆款池（每批含条目）；status 过滤条目。personaId 为主参数，兼容显式 { accountId }。 */
    listViralBatches(scope: AssetScope, status?: ViralStatus): Promise<Array<ViralBatch & {
        items: ViralItem[];
    }>>;
    /** 删除整个采集批次（该批全部条目）。 */
    deleteViralBatch(scope: AssetScope, batchId: string): Promise<number>;
    /** 采集爆款入库（query/maxItems 缺省时由后端按人设方向降级生成搜索词与条数）。 */
    collectViral(accountId: string, query?: string, maxItems?: number): Promise<ViralItem[]>;
    /** 审核爆款条目为 accepted / ignored。 */
    reviewViralItem(scope: AssetScope, itemId: string, status: 'accepted' | 'ignored'): Promise<ViralItem>;
    /** 调整爆款人工权重（0-5），以 personaId 为主参数。 */
    setViralWeight(personaId: string, itemId: string, weight: NoteWeight): Promise<ViralItem>;
    /** 手动新增爆款（personaId 为主参数）。 */
    addManualViral(personaId: string, payload: {
        title: string;
        body: string;
        sourceUrl?: string;
        publishedAt?: string;
        reasons?: string[];
    }): Promise<ViralItem>;
    /** 显式转移爆款到目标人设。 */
    transferVirals(personaId: string, targetPersonaId: string, itemIds: string[]): Promise<ViralItem[]>;
    listNotes(scope: AssetScope): Promise<PublishedNote[]>;
    setNoteWeight(scope: AssetScope, noteId: string, weight: NoteWeight): Promise<void>;
    /** 显式转移已发布笔记到目标人设。 */
    transferNotes(personaId: string, targetPersonaId: string, noteIds: string[]): Promise<PublishedNote[]>;
    listPending(): Promise<PendingOwnership[]>;
    assignPending(id: string, targetPersonaId: string): Promise<PublishedNote | ViralItem>;
    listMetrics(accountId: string, noteId?: string): Promise<Array<{
        id: string;
        noteId: string;
        accountId: string;
        reads: number;
        likes: number;
        favorites: number;
        comments: number;
        collectedAt: string;
        source: string;
        status: string;
    }>>;
    /** 手动录入一条指标快照（运维用，来源 manual）。 */
    saveMetricSnapshot(accountId: string, noteId: string, reads: number): Promise<void>;
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
        evidence: DraftEvidence;
        warning?: string;
    }>;
    /**
     * 流式发送创作指令（结构化 SSE）：按完整空白行分隔解析类型化事件，
     * 跨 chunk 保留缓冲区；onEvent 按顺序收到 type/phase/evidence/plan_delta/
     * content_delta/quality/done/error。错误事件抛 XhsApiError；done 提供
     * messageId/coverPrompt/personaId。requestId 透传到请求体用于幂等去重。
     */
    studioSendStream(accountId: string, input: string, mode: 'full' | 'creative', onEvent: (event: StudioSseEvent) => void, requestId?: string): Promise<{
        messageId: string;
        coverPrompt: string;
        evidence?: DraftEvidence;
        personaId?: string;
        quality?: DraftQualityReport;
        warning?: string;
    }>;
    /** 保存创作台草稿（v3 草稿独立，不含 topicId）。 */
    studioSaveDraft(accountId: string, copy: string, coverPrompt: string, evidence?: DraftEvidence): Promise<{
        id: string;
    }>;
    listDrafts(): Promise<Array<{
        id: string;
        accountId: string;
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
export {};
