/** Apify Actor Run/Dataset 的 Host 适配器（v3 爆款采集）。 */
import { type NormalizedViral, type ViralCollectionResult, type ViralProvider, type ViralProviderRequest } from './provider.ts';
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
/** 通过 Apify API 搜索公开爆款样本；凭据只在 Host 端使用。 */
export declare class ApifyViralProvider implements ViralProvider {
    private readonly config;
    private readonly fetcher;
    private readonly sleep;
    constructor(config: ApifyConfig, options?: ApifyClientOptions);
    search(request: ViralProviderRequest): Promise<ViralCollectionResult>;
    /** 按笔记链接抓详情（get_note_detail）；任何失败返回 undefined。 */
    fetchNoteDetail(noteUrl: string): Promise<NormalizedViral | undefined>;
}
