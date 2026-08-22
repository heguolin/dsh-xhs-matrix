/** Client 与路由共享的 API 路径字面量。 */

export const XHS_API_BASE = '/api/dsh-xhs-matrix' as const

export const XHS_API = {
  settingsApify: XHS_API_BASE + '/settings/apify',
  accounts: XHS_API_BASE + '/accounts',
  accountImport: XHS_API_BASE + '/accounts/import',
  personas: XHS_API_BASE + '/personas',
  notes: XHS_API_BASE + '/notes',
  notesTransfer: XHS_API_BASE + '/notes/transfer',
  viral: XHS_API_BASE + '/viral',
  viralManual: XHS_API_BASE + '/viral/manual',
  viralTransfer: XHS_API_BASE + '/viral/transfer',
  pendingOwnership: XHS_API_BASE + '/pending-ownership',
  metrics: XHS_API_BASE + '/metrics',
  studio: XHS_API_BASE + '/studio',
  studioMessages: XHS_API_BASE + '/studio/messages',
  drafts: XHS_API_BASE + '/drafts',
} as const
