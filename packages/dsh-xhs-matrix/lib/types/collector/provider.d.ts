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
}
export declare function normalizeApifyItem(item: unknown): NormalizedViral;
