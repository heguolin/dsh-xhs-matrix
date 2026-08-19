/** 领域类型：只放类型，不放运行时代码。 */
/** 矩阵账号。 */
export interface Account {
    id: string;
    name: string;
    personaId: string;
    enabled: boolean;
    createdAt: string;
}
/** 人设模板。 */
export interface Persona {
    id: string;
    name: string;
    prompt: string;
    toneTags?: string[];
    createdAt: string;
}
export type TopicStatus = 'open' | 'used' | 'retired';
/** 选题。 */
export interface Topic {
    id: string;
    title: string;
    source: 'manual' | 'import';
    status: TopicStatus;
    usedByDraftId?: string;
    createdAt: string;
}
/** 黑名单条目；accountId 为空表示全局。 */
export interface NegativeTopic {
    id: string;
    accountId?: string;
    keyword: string;
    reason: string;
    createdAt: string;
}
export type DraftStatus = 'generated' | 'published' | 'dropped';
/** 发布后回填的流量指标。 */
export interface DraftMetrics {
    reads: number;
    likes: number;
    comments: number;
    collected: string;
}
/** 草稿（文案 + 封面提示词）。 */
export interface Draft {
    id: string;
    accountId: string;
    topicId: string;
    date: string;
    copy: string;
    coverPrompt: string;
    status: DraftStatus;
    metrics?: DraftMetrics;
    createdAt: string;
}
/** 存储文件整体形状。 */
export interface StoreFile {
    version: number;
    accounts: Account[];
    personas: Persona[];
    topics: Topic[];
    negatives: NegativeTopic[];
    drafts: Draft[];
}
