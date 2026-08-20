/** 外部趋势样本的统一模型、标准化和账号相关性排序。 */
import type { Account, Persona, PublishedNote } from './types.ts';
export interface NormalizedTrend {
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
}
export interface RankedTrend extends NormalizedTrend {
    score: number;
    reasons: string[];
}
/** 只保留 Apify 返回中可用于分析的公开字段。 */
export declare function normalizeApifyItem(item: unknown, actorId?: string): NormalizedTrend;
/** 按当前账号人设、历史样本和公开互动信号排序，并返回解释。 */
export declare function rankTrends(account: Account, persona: Persona, notes: PublishedNote[], trends: NormalizedTrend[]): RankedTrend[];
export interface TrendProviderRequest {
    accountId: string;
    query: string;
    maxItems: number;
}
export interface CollectionResult {
    samples: NormalizedTrend[];
    status: 'success' | 'failed';
    error?: string;
}
export interface TrendProvider {
    search(request: TrendProviderRequest): Promise<CollectionResult>;
}
