/** Client 与路由共享的 API 路径字面量。 */

export const XHS_API_BASE = '/api/dsh-xhs-matrix' as const

export const XHS_API = {
  accounts: XHS_API_BASE + '/accounts',
  personas: XHS_API_BASE + '/personas',
  topics: XHS_API_BASE + '/topics',
  negatives: XHS_API_BASE + '/negatives',
  drafts: XHS_API_BASE + '/drafts',
} as const
