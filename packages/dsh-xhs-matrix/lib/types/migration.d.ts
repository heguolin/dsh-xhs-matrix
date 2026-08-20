/** 存储文件版本迁移（v1/v2 → v3）。 */
import type { Account, CollectionStatus, Draft, MatrixSettings, MetricSnapshot, Persona, PublishedNote, StoreFile, StudioMessage } from './types.ts';
/** 运行时设置默认值（存于 migration 模块，避免 store↔migration 循环依赖）。 */
export declare function defaultMatrixSettings(): MatrixSettings;
/** version 1 中尚未包含连接和采集配置的账号。 */
type VersionOneAccount = Omit<Account, 'connection' | 'collection' | 'collectionStatus'> & {
    connection?: Account['connection'];
    collection?: Account['collection'];
    collectionStatus?: CollectionStatus;
};
/** v2 旧版趋势样本（迁移为爆款池条目）。 */
interface VersionTwoTrendSample {
    id: string;
    accountId: string;
    title: string;
    summary?: string;
    desc?: string;
    sourceUrl?: string;
    source: string;
    publishedAt?: string;
    collectedAt: string;
    status?: string;
}
/** 旧版草稿（v2 含冗余 topicId 字段）。 */
type LegacyDraft = Draft & {
    topicId?: string;
};
/** v1 存储文件的最小输入。 */
export interface VersionOneStoreFile {
    version: 1;
    accounts?: VersionOneAccount[];
    personas?: Persona[];
    topics?: unknown[];
    negatives?: unknown[];
    drafts?: LegacyDraft[];
}
/** v2 存储文件输入（含趋势样本与已发布知识库）。 */
export interface VersionTwoStoreFile {
    version: 2;
    accounts?: VersionOneAccount[];
    personas?: Persona[];
    topics?: unknown[];
    negatives?: unknown[];
    drafts?: LegacyDraft[];
    publishedNotes?: PublishedNote[];
    metricSnapshots?: MetricSnapshot[];
    trendSamples?: VersionTwoTrendSample[];
    studioMessages?: StudioMessage[];
    settings?: MatrixSettings;
}
/** 迁移输入：v1 或 v2 存储文件。 */
export type LegacyStoreFile = VersionOneStoreFile | VersionTwoStoreFile;
/** 将 v1/v2 存储迁移到 v3：trendSamples 转为爆款池 pending 条目、topics/negatives 丢弃、draft 去 topicId。 */
export declare function migrateStoreFile(file: LegacyStoreFile): StoreFile;
export {};
