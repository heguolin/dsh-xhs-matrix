/** 存储文件版本迁移。 */
import type { Account, CollectionStatus, Draft, MatrixSettings, Persona, StoreFile, Topic } from './types.ts';
/** 运行时设置默认值（存于 migration 模块，避免 store↔migration 循环依赖）。 */
export declare function defaultMatrixSettings(): MatrixSettings;
/** version 1 中尚未包含连接和采集配置的账号。 */
type VersionOneAccount = Omit<Account, 'connection' | 'collection' | 'collectionStatus'> & {
    connection?: Account['connection'];
    collection?: Account['collection'];
    collectionStatus?: CollectionStatus;
};
/** 旧版存储文件的最小输入。 */
export interface VersionOneStoreFile {
    version: 1;
    accounts?: VersionOneAccount[];
    personas?: Persona[];
    topics?: Topic[];
    negatives?: unknown[];
    drafts?: Draft[];
}
/** 将 version 1 存储迁移到 version 2；旧版独立约束不会迁移。 */
export declare function migrateStoreFile(file: VersionOneStoreFile): StoreFile;
export {};
