/** Apify Actor Run/Dataset 的 Host 适配器。 */
import { type CollectionResult, type TrendProvider, type TrendProviderRequest } from './trends.ts';
export interface ApifyConfig {
    actorId: string;
    apiToken: string;
    maxItems: number;
    requestTimeoutMs: number;
    maxPolls: number;
}
export interface ApifyClientOptions {
    fetcher?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
}
/** 通过 Apify API 搜索公开趋势样本；凭据只在 Host 端使用。 */
export declare class ApifyTrendProvider implements TrendProvider {
    private readonly config;
    private readonly fetcher;
    private readonly sleep;
    constructor(config: ApifyConfig, options?: ApifyClientOptions);
    search(request: TrendProviderRequest): Promise<CollectionResult>;
}
