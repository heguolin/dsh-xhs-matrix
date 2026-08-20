export interface NormalizedViral {
    title: string;
    body?: string;
    sourceUrl?: string;
    source: 'apify' | 'manual';
    publishedAt?: string;
    reads?: number;
    likes?: number;
    comments?: number;
}
export interface RankedViral extends NormalizedViral {
    score: number;
    reasons: string[];
}
export interface ViralProviderRequest {
    accountId: string;
    query: string;
    maxItems: number;
}
export interface ViralCollectionResult {
    items: NormalizedViral[];
    status: 'success' | 'failed';
    error?: string;
}
export interface ViralProvider {
    search(request: ViralProviderRequest): Promise<ViralCollectionResult>;
    /** 按笔记链接抓取详情（完整正文）；失败返回 undefined。搜索接口通常不含正文，采纳时用于补全。 */
    fetchNoteDetail?(noteUrl: string): Promise<NormalizedViral | undefined>;
}
export declare function normalizeApifyItem(item: unknown): NormalizedViral;
