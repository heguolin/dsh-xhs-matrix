/** 指标快照严格校验与账号级采集调度。 */
import { MatrixStore } from './store.ts';
import type { DataSource, MetricSnapshot } from './types.ts';
import type { ViralProvider } from './collector/provider.ts';
export interface MetricSnapshotInput {
    accountId: string;
    noteId: string;
    reads: number;
    likes: number;
    favorites: number;
    comments: number;
    shares?: number;
    source: DataSource;
    collectedAt?: string;
}
/** 校验指标快照；失败抛错。 */
export declare function validateMetricSnapshot(input: MetricSnapshotInput): Omit<MetricSnapshot, 'id'>;
export interface CollectionSchedulerDeps {
    store: MatrixStore;
    provider: ViralProvider;
    now?: () => Date;
    intervalMs?: number;
}
/** 按账号定时采集已发布笔记公开指标；生命周期由插件 Fiber 管理。 */
export declare class CollectionScheduler {
    private timer;
    private active;
    private readonly store;
    private readonly provider;
    private readonly now;
    private readonly intervalMs;
    constructor(deps: CollectionSchedulerDeps);
    get isActive(): boolean;
    start(): void;
    stop(): void;
    /** 为指定账号执行一轮采集；记录 running/success/failed 状态，不触发生成或发布。 */
    runAccount(accountId: string): Promise<void>;
    private tick;
}
