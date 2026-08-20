/** Client 与路由共享的 API 路径字面量。 */

export const XHS_API_BASE = '/api/dsh-xhs-matrix' as const

export const XHS_API = {
  accounts: XHS_API_BASE + '/accounts',
  accountImport: XHS_API_BASE + '/accounts/import',
  personas: XHS_API_BASE + '/personas',
  notes: XHS_API_BASE + '/notes',
  trends: XHS_API_BASE + '/trends',
  metrics: XHS_API_BASE + '/metrics',
  studio: XHS_API_BASE + '/studio',
  studioMessages: XHS_API_BASE + '/studio/messages',
  topics: XHS_API_BASE + '/topics',
  drafts: XHS_API_BASE + '/drafts',
} as const
