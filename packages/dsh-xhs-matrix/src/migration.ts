/** 存储文件版本迁移。 */

import type { Account, CollectionStatus, Draft, Persona, StoreFile, Topic } from './types.ts'

/** version 1 中尚未包含连接和采集配置的账号。 */
type VersionOneAccount = Omit<Account, 'connection' | 'collection' | 'collectionStatus'> & {
  connection?: Account['connection']
  collection?: Account['collection']
  collectionStatus?: CollectionStatus
}

/** 旧版存储文件的最小输入。 */
export interface VersionOneStoreFile {
  version: 1
  accounts?: VersionOneAccount[]
  personas?: Persona[]
  topics?: Topic[]
  negatives?: unknown[]
  drafts?: Draft[]
}

/** 将 version 1 存储迁移到 version 2；旧版独立约束不会迁移。 */
export function migrateStoreFile(file: VersionOneStoreFile): StoreFile {
  return {
    version: 2,
    accounts: (file.accounts ?? []).map(account => ({
      ...account,
      connection: account.connection ?? { status: 'unbound' },
      collection: account.collection ?? { enabled: false, intervalMinutes: 1440, maxItems: 100 },
      collectionStatus: account.collectionStatus ?? { running: false, lastStatus: 'idle' },
    })),
    personas: file.personas ?? [],
    topics: file.topics ?? [],
    drafts: file.drafts ?? [],
    publishedNotes: [],
    metricSnapshots: [],
    trendSamples: [],
    studioMessages: [],
  }
}
