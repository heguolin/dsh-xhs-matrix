/** 存储文件版本迁移（v1/v2/v3 → v4）。 */
import type { Account, CollectionStatus, DataSource, Draft, MatrixSettings, MetricSnapshot, NoteWeight, Persona, StudioMessage, StoreFile, ViralStatus } from './types.ts';
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
/** 旧版已发布笔记（v2 仍以 accountId 归属）。 */
interface LegacyNote {
    id: string;
    accountId: string;
    title: string;
    copy: string;
    topic?: string;
    contentType?: string;
    sourceUrl?: string;
    publishedAt: string;
    source: string;
    weight: number;
    createdAt: string;
    updatedAt?: string;
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
    publishedNotes?: LegacyNote[];
    metricSnapshots?: MetricSnapshot[];
    trendSamples?: VersionTwoTrendSample[];
    studioMessages?: StudioMessage[];
    settings?: MatrixSettings;
}
/** 迁移输入：v1 或 v2 存储文件。 */
export type LegacyStoreFile = VersionOneStoreFile | VersionTwoStoreFile;
/** v3 已发布笔记：以 accountId 归属，无 personaId/来源快照字段。 */
export interface V3PublishedNote {
    id: string;
    accountId: string;
    title: string;
    copy: string;
    topic?: string;
    contentType?: string;
    sourceUrl?: string;
    publishedAt: string;
    source: DataSource;
    weight: NoteWeight;
    createdAt: string;
    updatedAt?: string;
}
/** v3 爆款条目：以 accountId 归属，无 personaId、无人工权重。 */
export interface V3ViralItem {
    id: string;
    accountId: string;
    title: string;
    body: string;
    sourceUrl?: string;
    source: 'apify' | 'manual' | 'import';
    status: ViralStatus;
    score: number;
    reasons?: string[];
    publishedAt?: string;
    collectedAt: string;
    batchId?: string;
}
/** v3 草稿：无 personaIdSnapshot/qualityReport。 */
export type V3Draft = Omit<Draft, 'personaIdSnapshot' | 'qualityReport'>;
/** v3 指标快照：无 accountNameSnapshot。 */
export type V3MetricSnapshot = Omit<MetricSnapshot, 'accountNameSnapshot'>;
/** v3 创作室消息：无 personaIdSnapshot/requestId。 */
export type V3StudioMessage = Omit<StudioMessage, 'personaIdSnapshot' | 'requestId'>;
/** v3 存储文件：笔记/爆款以 accountId 归属。 */
export interface StoreFileV3 {
    version: 3;
    accounts?: Account[];
    personas?: Persona[];
    drafts?: V3Draft[];
    publishedNotes?: V3PublishedNote[];
    metricSnapshots?: V3MetricSnapshot[];
    viralItems?: V3ViralItem[];
    studioMessages?: V3StudioMessage[];
    settings?: MatrixSettings;
}
/**
 * 将 v1/v2 存储迁移到 v4：先迁为内存 v3，再走 v3→v4 统一流程。
 * 无法解析人设的笔记/爆款进入待归属集合，draft 去 topicId，并补齐人设与来源账号快照。
 */
export declare function migrateStoreFile(file: LegacyStoreFile): StoreFile;
/**
 * 将 v3 存储迁移到 v4：直接从 file.accounts 与 file.personas 解析归属（不接收外部 resolver）。
 * - 账号存在且绑定有效人设 → 归属该人设，并保存来源账号 id 与名称快照。
 * - 账号缺失/未绑定/人设失效 → 进入 pendingOwnership（reason 区分）。
 * - 旧 ViralItem 一律补 weight=1，既有审核状态保留；内容 id 不重写。
 * - 多账号映射同一人设时内容自然合并，权重不平均也不覆盖。
 */
export declare function migrateStoreFileV3ToV4(file: StoreFileV3): StoreFile;
/**
 * 在同目录创建带时间戳的 v3 备份文件（逐字节复制），返回备份路径。
 * 备份文件名形如 <file>.bak-<时间戳>；同名已存在时追加序号，绝不覆盖已有备份。
 */
export declare function backupStoreFile(filePath: string, now?: () => Date): string;
/** 原子写选项（rename 注入用于故障测试）。 */
export interface AtomicWriteOptions {
    rename?: (from: string, to: string) => void;
}
/**
 * 原子落盘：同目录写 <file>.tmp-<pid>-<random>，成功后 renameSync 替换正式文件；
 * 失败时仅删除已解析的临时文件并抛出，正式文件（及既有备份）保持原样。
 */
export declare function atomicWriteStoreFile(filePath: string, data: StoreFile, options?: AtomicWriteOptions): void;
export {};
